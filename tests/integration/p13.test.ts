import { beforeAll, afterAll, test, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../../src/server/db/migrate";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { createAuth, type Auth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seed, type SeedAccounts } from "../../src/server/db/seed";
import { seedDemonstration } from "../../src/server/db/demo-seed";
import { resolveActor, sessionState, type Actor } from "../../src/server/security/authorization";
import { readDemoAccounts, retireDemoAccount } from "../../src/server/demo-accounts";
import { generate } from "otplib";
import {
  BrevoNotifications,
  EmailQuotaDeferred,
  type BrevoSettings,
} from "../../src/server/jobs/brevo";
import { enqueue } from "../../src/server/jobs/enqueue";
import { handle } from "../../src/server/jobs/handlers";
import { replay, type Job } from "../../src/server/jobs/queue";
import { readServiceConfiguration } from "../../src/server/services/status";
import { registerShopkeeper } from "../../src/server/registration";
const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  auth: Auth,
  directory: string,
  accounts: SeedAccounts,
  operator: Actor,
  owner: Actor,
  oldChecksums: unknown,
  demo: { id: string; email: string; password: string }[];
class Client {
  cookies = new Map<string, string>();
  headers() {
    return new Headers({
      origin: coreConfig().baseURL,
      "content-type": "application/json",
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    });
  }
  async post(path: string, body: unknown) {
    const r = await auth.handler(
      new Request(`${coreConfig().baseURL}/api/auth/${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      }),
    );
    for (const c of r.headers.getSetCookie()) {
      const first = c.split(";")[0]!,
        i = first.indexOf("=");
      this.cookies.set(first.slice(0, i), first.slice(i + 1));
    }
    return r;
  }
}
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  pool = new Pool({ connectionString: url.toString(), max: 8 });
  directory = await mkdtemp(join(tmpdir(), "londos-p13-"));
  await migrate(pool, undefined, "018_catalogue_pagination.sql");
  auth = createAuth(pool, coreConfig(), true);
  accounts = await seed(pool, auth, directory);
  oldChecksums = (await pool.query("SELECT name,checksum FROM schema_migrations ORDER BY name"))
    .rows;
  // An 018 schema still supports native authentication despite the new retired flag.
  const c = new Client();
  expect((await c.post("sign-in/email", accounts.ownerA)).status).toBe(200);
  owner = await resolveActor(auth, c.headers());
  await migrate(pool);
  await migrate(pool);
  const op = new Client();
  expect((await op.post("sign-in/email", accounts.operator)).status).toBe(200);
  const factor = await (
      await op.post("two-factor/enable", { password: accounts.operator.password })
    ).json(),
    secret = new URL(factor.totpURI).searchParams.get("secret")!;
  expect(
    (
      await op.post("two-factor/verify-totp", {
        code: await generate({ secret }),
        trustDevice: false,
      })
    ).status,
  ).toBe(200);
  operator = await resolveActor(auth, op.headers());
  await pool.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'operations')", [
    operator.userId,
  ]);
  await seedDemonstration(pool, auth, 12, directory);
  demo = JSON.parse(await readFile(join(directory, "demonstration-accounts.json"), "utf8"));
}, 30000);
afterAll(async () => {
  await pool?.end();
  // Let PostgreSQL observe closed sockets; never kill a still-owned test client
  // to make cleanup look successful or emit an unhandled driver exception.
  let remaining = 1;
  for (let attempt = 0; attempt < 40 && remaining; attempt++) {
    remaining = Number(
      (
        await parent.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1", [
          name,
        ])
      ).rows[0].n,
    );
    if (remaining) await new Promise((resolve) => setTimeout(resolve, 25));
  }
  expect(remaining).toBe(0);
  await parent.query(`DROP DATABASE IF EXISTS ${name}`);
  await parent.end();
  await rm(directory, { recursive: true, force: true });
  process.env.DATABASE_URL = parentURL;
});
test("service configuration is restricted to operations operators with current native MFA", async () => {
  await expect(readServiceConfiguration(pool, owner)).rejects.toMatchObject({
    code: "mfa_required",
  });
  expect(await readServiceConfiguration(pool, operator)).toMatchObject({
    verification: "configuration only; no provider request made",
  });
  await pool.query(
    "UPDATE mfa_proofs SET verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",
    [operator.sessionId],
  );
  await expect(readServiceConfiguration(pool, operator)).rejects.toMatchObject({
    code: "fresh_authentication_required",
  });
  await pool.query("UPDATE mfa_proofs SET verified_at=clock_timestamp() WHERE session_id=$1", [
    operator.sessionId,
  ]);
  await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='operations'", [
    operator.userId,
  ]);
  await expect(readServiceConfiguration(pool, operator)).rejects.toMatchObject({
    code: "permission_denied",
  });
  await pool.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'operations')", [
    operator.userId,
  ]);
});
test("019 expands an 018 native-auth database idempotently without modifying applied migration checksums", async () => {
  expect(
    (await pool.query("SELECT name,checksum FROM schema_migrations WHERE name<'019' ORDER BY name"))
      .rows,
  ).toEqual(oldChecksums);
  expect((await pool.query("SELECT count(*)::int AS n FROM demo_accounts")).rows[0].n).toBe(12);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM notification_deliveries")).rows[0].n,
  ).toBe(0);
});
test("public shopkeeper registration creates only an unverified, unprivileged identity", async () => {
  const email = `registration-${randomUUID()}@londos.invalid`,
    input = {
      name: "Fictional registering owner",
      email,
      password: "Fictional-registration-password-42",
      acceptTerms: true as const,
    };
  await expect(registerShopkeeper(pool, input)).resolves.toEqual({ accepted: true });
  await expect(registerShopkeeper(pool, input)).resolves.toEqual({ accepted: true });
  const identity = (
    await pool.query('SELECT id,"emailVerified" FROM "user" WHERE email=$1', [email])
  ).rows[0];
  expect(identity.emailVerified).toBe(false);
  expect(
    (
      await pool.query(
        "SELECT (SELECT count(*) FROM memberships WHERE user_id=$1)::int AS memberships,(SELECT count(*) FROM operator_grants WHERE user_id=$1)::int AS grants",
        [identity.id],
      )
    ).rows[0],
  ).toEqual({ memberships: 0, grants: 0 });
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM jobs WHERE payload->>'template'='email-verification' AND payload->>'to'=$1",
        [email],
      )
    ).rows[0].n,
  ).toBeGreaterThan(0);
  expect(
    (await new Client().post("sign-in/email", { email, password: input.password })).status,
  ).toBe(403);
});
test("native demonstration accounts have no operators, payments, live publication or fabricated pilot outcomes", async () => {
  const r = await pool.query(
    "SELECT count(*)::int AS n,count(*) FILTER(WHERE p.state='unpublished' AND t.state='pending')::int AS safe FROM demo_accounts d JOIN shop_publication p ON p.shop_id=d.shop_id JOIN tenancies t ON t.shop_id=d.shop_id",
  );
  expect(r.rows[0]).toEqual({ n: 12, safe: 12 });
  expect(
    (
      await pool.query(
        "SELECT 1 FROM demo_accounts d JOIN operator_grants g ON g.user_id=d.user_id",
      )
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await pool.query(
        "SELECT 1 FROM invoices i JOIN demo_accounts d ON d.merchant_id=i.merchant_id",
      )
    ).rowCount,
  ).toBe(0);
  const c = new Client();
  expect((await c.post("sign-in/email", demo[0])).status).toBe(200);
  expect((await resolveActor(auth, c.headers())).userId).toBe(demo[0]!.id);
});
test("reseed preserves edited shop details and all private credentials", async () => {
  const bytes = await readFile(join(directory, "demonstration-accounts.json"));
  const row = (
    await pool.query("SELECT shop_id FROM demo_accounts WHERE user_id=$1", [demo[0]!.id])
  ).rows[0];
  await pool.query("UPDATE shops SET name='Edited fictional merchant shop' WHERE id=$1", [
    row.shop_id,
  ]);
  await seedDemonstration(pool, auth, 12, directory);
  expect((await pool.query("SELECT name FROM shops WHERE id=$1", [row.shop_id])).rows[0].name).toBe(
    "Edited fictional merchant shop",
  );
  expect((await readFile(join(directory, "demonstration-accounts.json"))).equals(bytes)).toBe(true);
});
test("owners, missing grants and stale native MFA cannot administer demo accounts", async () => {
  await expect(readDemoAccounts(pool, owner)).rejects.toMatchObject({ code: "mfa_required" });
  await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='operations'", [
    operator.userId,
  ]);
  await expect(readDemoAccounts(pool, operator)).rejects.toMatchObject({
    code: "permission_denied",
  });
  await pool.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'operations')", [
    operator.userId,
  ]);
  await pool.query(
    "UPDATE mfa_proofs SET verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",
    [operator.sessionId],
  );
  await expect(readDemoAccounts(pool, operator)).rejects.toMatchObject({
    code: "fresh_authentication_required",
  });
  await pool.query("UPDATE mfa_proofs SET verified_at=clock_timestamp() WHERE session_id=$1", [
    operator.sessionId,
  ]);
});
test("unknown real identities and stale versions cannot be retired", async () => {
  await expect(
    retireDemoAccount(pool, operator, owner.userId, {
      version: 1,
      reason: "Fictional clean-up request",
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "resource_unavailable" });
  await expect(
    retireDemoAccount(pool, operator, demo[1]!.id, {
      version: 2,
      reason: "Fictional clean-up request",
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "stale_version" });
});
test("retirement rechecks operator authority after a blocked merchant lock", async () => {
  const target = (
      await pool.query("SELECT merchant_id FROM demo_accounts WHERE user_id=$1", [demo[2]!.id])
    ).rows[0],
    lock = await pool.connect();
  await lock.query("BEGIN");
  await lock.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [target.merchant_id]);
  const pending = retireDemoAccount(pool, operator, demo[2]!.id, {
    version: 1,
    reason: "Fictional race retirement",
    confirm: true,
  });
  const outcome = pending.catch((error) => error);
  await expect
    .poll(async () =>
      Number(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT id FROM merchants%' AND datname=current_database()",
          )
        ).rows[0].n,
      ),
    )
    .toBeGreaterThan(0);
  await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='operations'", [
    operator.userId,
  ]);
  await lock.query("COMMIT");
  lock.release();
  expect(await outcome).toMatchObject({ code: "permission_denied" });
  await pool.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'operations')", [
    operator.userId,
  ]);
});
test("confirmed retirement revokes native sessions, hides shops and preserves immutable business history; reseed never reactivates", async () => {
  const target = demo[11]!,
    c = new Client();
  expect((await c.post("sign-in/email", target)).status).toBe(200);
  const actor = await resolveActor(auth, c.headers()),
    registration = (await pool.query("SELECT * FROM demo_accounts WHERE user_id=$1", [target.id]))
      .rows[0];
  const invoice = randomUUID();
  await pool.query(
    "INSERT INTO invoices(id,merchant_id,shop_id,currency,amount_minor,period_start,period_end) VALUES($1,$2,$3,'UGX',5000,now(),now()+interval '30 days')",
    [invoice, registration.merchant_id, registration.shop_id],
  );
  const before = (await pool.query("SELECT * FROM invoices WHERE id=$1", [invoice])).rows;
  expect(
    await retireDemoAccount(pool, operator, target.id, {
      version: 1,
      reason: "Remove this fictional demonstration account",
      confirm: true,
    }),
  ).toEqual({ retired: true, version: 2 });
  await expect(sessionState(pool, actor)).rejects.toMatchObject({
    code: "authentication_required",
  });
  expect((await pool.query("SELECT * FROM invoices WHERE id=$1", [invoice])).rows).toEqual(before);
  expect(
    (
      await pool.query("SELECT state FROM shop_publication WHERE shop_id=$1", [
        registration.shop_id,
      ])
    ).rows[0].state,
  ).toBe("archived");
  await seedDemonstration(pool, auth, 12, directory);
  expect(
    (await pool.query('SELECT demo_retired FROM "user" WHERE id=$1', [target.id])).rows[0]
      .demo_retired,
  ).toBe(true);
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [target.id]);
  expect((await new Client().post("sign-in/email", target)).status).toBe(401);
  await expect(
    pool.query("DELETE FROM demo_accounts WHERE user_id=$1", [target.id]),
  ).rejects.toMatchObject({ code: "P0001" });
  expect(
    await retireDemoAccount(pool, operator, target.id, {
      version: 1,
      reason: "Idempotent duplicate removal request",
      confirm: true,
    }),
  ).toEqual({ retired: true, version: 2 });
});
const settings: BrevoSettings = {
  apiKey: "PRIVATE-BREVO-SENTINEL-".repeat(3),
  senderEmail: "sender@merchant.tld",
  senderName: "Londos",
  baseURL: "https://mall.merchant.tld",
};
test.each([
  [201, "accepted", "provider_accepted_not_delivery_confirmed"],
  [400, "rejected", "provider_request_rejected"],
  [401, "rejected", "provider_api_key_rejected"],
  [403, "rejected", "provider_access_denied"],
  [429, "rejected", "provider_rate_limited"],
  [503, "uncertain", "provider_server_error"],
  [null, "uncertain", "provider_network_or_timeout"],
] as const)(
  "Brevo %s emits safe delivery diagnostics without private data or duplicate sends",
  async (status, outcome, category) => {
    const job = await notification();
    let calls = 0;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const adapter = new BrevoNotifications(pool, settings, async () => {
        calls++;
        if (status === null) throw new Error("PRIVATE-network-error");
        return status === 201
          ? Response.json({ messageId: "PRIVATE-provider-reference" }, { status })
          : new Response("PRIVATE-response-body", { status });
      });
      const deliver = () =>
        adapter.deliver(job.id, job.payload, new AbortController().signal, {
          leaseToken: job.lease_token,
        });
      if (status === 201) {
        await deliver();
        await deliver();
      } else {
        await expect(deliver()).rejects.toThrow("delivery_requires_reconciliation");
        await expect(deliver()).rejects.toThrow("delivery_requires_reconciliation");
      }
      expect(calls).toBe(1);
      expect(log).toHaveBeenCalledTimes(1);
      const text = log.mock.calls[0]![0] as string;
      expect(JSON.parse(text)).toMatchObject({
        event: "notification.delivery",
        provider: "brevo",
        jobId: job.id,
        outcome,
        category,
        httpStatus: status,
      });
      for (const privateValue of [
        "PRIVATE-",
        "merchant@",
        "sender@",
        "business.tld",
        "merchant.tld",
      ])
        expect(text).not.toContain(privateValue);
      expect(
        (await pool.query("SELECT state FROM notification_deliveries WHERE job_id=$1", [job.id]))
          .rows[0].state,
      ).toBe(outcome);
    } finally {
      log.mockRestore();
    }
  },
);
async function notification() {
  const payload = {
      template: "email-verification",
      to: "merchant@business.tld",
      url: "https://mall.merchant.tld/api/auth/verify-email?token=PRIVATE-ACTION-SENTINEL",
    },
    id = await enqueue(pool, { kind: "notification.local", key: randomUUID(), payload }),
    lease = randomUUID();
  return (
    await pool.query(
      "UPDATE jobs SET state='running',lease_token=$2,lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$1 RETURNING *",
      [id, lease],
    )
  ).rows[0] as Job;
}
test("accepted Brevo delivery uses fixed HTTPS, plain text and durable identity; retries after acknowledgement loss never resend", async () => {
  const job = await notification();
  let calls = 0;
  const transport: typeof fetch = async (url, init) => {
    calls++;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init!.redirect).toBe("error");
    expect(JSON.parse(init!.body as string).headers.idempotencyKey).toBe(`londos-${job.id}`);
    return Response.json({ messageId: "<fixture-brevo-reference>" }, { status: 201 });
  };
  const adapter = new BrevoNotifications(pool, settings, transport);
  await handle(pool, job, adapter, new AbortController().signal);
  await handle(pool, job, adapter, new AbortController().signal);
  expect(calls).toBe(1);
  const row = (await pool.query("SELECT * FROM notification_deliveries WHERE job_id=$1", [job.id]))
    .rows[0];
  expect(row.state).toBe("accepted");
  expect(JSON.stringify(row)).not.toContain("PRIVATE-");
  expect(JSON.stringify(row)).not.toContain("merchant@");
  await expect(
    adapter.deliver(
      job.id,
      { ...job.payload, to: "another@business.tld" },
      new AbortController().signal,
      { leaseToken: job.lease_token },
    ),
  ).rejects.toThrow("delivery_payload_changed");
});
test.each(["network", "timeout", "server-error", "unauthorized", "malformed", "oversized"])(
  "Brevo %s outcomes remain durable and cannot blindly resend, including operator replay",
  async (kind) => {
    const job = await notification();
    let calls = 0;
    const transport: typeof fetch = async () => {
      calls++;
      if (kind === "network" || kind === "timeout") throw new Error("PRIVATE-provider-body");
      if (kind === "server-error") return new Response("PRIVATE-body", { status: 503 });
      if (kind === "unauthorized") return new Response("PRIVATE-body", { status: 401 });
      return new Response(kind === "oversized" ? "x".repeat(8193) : "malformed", { status: 201 });
    };
    const adapter = new BrevoNotifications(pool, settings, transport);
    await expect(handle(pool, job, adapter, new AbortController().signal)).rejects.toThrow(
      "delivery_requires_reconciliation",
    );
    await pool.query("UPDATE jobs SET state='dead',lease_token=NULL,lease_until=NULL WHERE id=$1", [
      job.id,
    ]);
    await replay(pool, operator, job.id);
    await expect(handle(pool, job, adapter, new AbortController().signal)).rejects.toThrow(
      "delivery_requires_reconciliation",
    );
    expect(calls).toBe(1);
    expect(
      (await pool.query("SELECT state FROM notification_deliveries WHERE job_id=$1", [job.id]))
        .rows[0].state,
    ).toBe(kind === "unauthorized" ? "rejected" : "uncertain");
  },
);
test("stale worker lease, altered durable payload and fictional addresses never reach Brevo", async () => {
  const job = await notification();
  let calls = 0;
  const adapter = new BrevoNotifications(pool, settings, async () => {
    calls++;
    return Response.json({ messageId: "id" }, { status: 201 });
  });
  await expect(
    adapter.deliver(job.id, job.payload, new AbortController().signal, {
      leaseToken: randomUUID(),
    }),
  ).rejects.toThrow("delivery_not_owned");
  await expect(
    adapter.deliver(
      job.id,
      { ...job.payload, to: "changed@business.tld" },
      new AbortController().signal,
      { leaseToken: job.lease_token },
    ),
  ).rejects.toThrow("delivery_not_owned");
  await expect(
    adapter.deliver(
      job.id,
      { ...job.payload, to: "demo01@londos.invalid" },
      new AbortController().signal,
      { leaseToken: job.lease_token },
    ),
  ).rejects.toThrow("fictional_email_denied");
  expect(calls).toBe(0);
});
test("Brevo quota reservations defer excess work without provider calls or recipient artifacts", async () => {
  const previousHour = process.env.LONDOS_EMAIL_MAX_PER_HOUR,
    previousDay = process.env.LONDOS_EMAIL_MAX_PER_DAY;
  process.env.LONDOS_EMAIL_MAX_PER_HOUR = "1";
  process.env.LONDOS_EMAIL_MAX_PER_DAY = "1";
  await pool.query("DELETE FROM email_quota_windows");
  let calls = 0;
  const adapter = new BrevoNotifications(pool, settings, async () => {
    calls++;
    return Response.json({ messageId: `quota-fixture-${calls}` }, { status: 201 });
  });
  try {
    const first = await notification();
    await adapter.deliver(first.id, first.payload, new AbortController().signal, {
      leaseToken: first.lease_token,
    });
    const deferred = await notification();
    await expect(
      adapter.deliver(deferred.id, deferred.payload, new AbortController().signal, {
        leaseToken: deferred.lease_token,
      }),
    ).rejects.toBeInstanceOf(EmailQuotaDeferred);
    expect(calls).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM email_quota_windows")).rows[0].n).toBe(
      2,
    );
    expect(
      (
        await pool.query("SELECT count(*)::int AS n FROM notification_deliveries WHERE job_id=$1", [
          deferred.id,
        ])
      ).rows[0].n,
    ).toBe(0);
  } finally {
    if (previousHour === undefined) delete process.env.LONDOS_EMAIL_MAX_PER_HOUR;
    else process.env.LONDOS_EMAIL_MAX_PER_HOUR = previousHour;
    if (previousDay === undefined) delete process.env.LONDOS_EMAIL_MAX_PER_DAY;
    else process.env.LONDOS_EMAIL_MAX_PER_DAY = previousDay;
  }
});
