import { beforeAll, beforeEach, afterAll, test, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { generate } from "otplib";
import { migrate } from "../../src/server/db/migrate";
import { seed, seedIds, type SeedAccounts } from "../../src/server/db/seed";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { coreConfig } from "../../src/server/config";
import { createAuth, type Auth } from "../../src/server/security/auth";
import { resolveActor, type Actor } from "../../src/server/security/authorization";
import {
  privacyPolicyId,
  privacyInventory,
  ownerPrivacyCommand,
  exportPrivacy,
  privacyQueue,
  claimPrivacy,
  readPrivacy,
  commandPrivacy,
  handlePrivacyErasure,
} from "../../src/server/privacy";
import {
  privacyOwnerCommand,
  privacyCommand,
  exportInput,
} from "../../src/modules/privacy/contract";
import { renderPilotContext, storePilotEvent } from "../../src/server/analytics";
import { saveDesign, publishDesign } from "../../src/server/shop-design";
import { readEvidence } from "../../src/server/applications";
import { submitGuestRequest } from "../../src/server/contacts";
import { acknowledge, type Job } from "../../src/server/jobs/queue";
const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  auth: Auth,
  accounts: SeedAccounts,
  directory: string,
  merchant: string,
  shop: string,
  legacy: string;
const actors: Record<string, Actor> = {};
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
    for (const cookie of r.headers.getSetCookie()) {
      const first = cookie.split(";")[0]!,
        at = first.indexOf("=");
      this.cookies.set(first.slice(0, at), first.slice(at + 1));
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
  pool = new Pool({
    connectionString: url.toString(),
    max: 12,
    application_name: "londos-privacy-test",
  });
  directory = await mkdtemp(join(tmpdir(), "londos-privacy-"));
  await migrate(pool, undefined, "014_local_pilot_analytics.sql");
  auth = createAuth(pool, coreConfig(), true);
  accounts = await seed(pool, auth, directory);
  legacy = randomUUID();
  await pool.query(
    "INSERT INTO guest_requests(id,shop_id,merchant_id,request_key,fingerprint,kind,name,reply_to,message,status) VALUES($1,$2,$3,$4,'LEGACY','enquiry','Legacy fictional person','legacy@invalid.example','Legacy fictional content','closed')",
    [legacy, seedIds.shopA, seedIds.merchantA, randomUUID()],
  );
  const baseline = (
    await pool.query(
      "SELECT id,name,reply_to,message,status,version FROM guest_requests WHERE id=$1",
      [legacy],
    )
  ).rows;
  await migrate(pool);
  await migrate(pool);
  expect(
    (
      await pool.query(
        "SELECT id,name,reply_to,message,status,version FROM guest_requests WHERE id=$1",
        [legacy],
      )
    ).rows,
  ).toEqual(baseline);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM operator_grants WHERE permission='privacy'"))
      .rows[0].n,
  ).toBe(0);
  for (const key of ["ownerA", "ownerB", "staff", "operator"] as const) {
    const c = new Client();
    expect((await c.post("sign-in/email", accounts[key])).status).toBe(200);
    if (key === "operator") {
      const r = await c.post("two-factor/enable", { password: accounts[key].password });
      const secret = new URL((await r.json()).totpURI).searchParams.get("secret")!;
      expect(
        (
          await c.post("two-factor/verify-totp", {
            code: await generate({ secret }),
            trustDevice: false,
          })
        ).status,
      ).toBe(200);
    }
    actors[key] = await resolveActor(auth, c.headers());
  }
});
beforeEach(async () => {
  process.env.LONDOS_PRIVACY_ERASURE = "true";
  process.env.LONDOS_PILOT_ANALYTICS = "true";
  process.env.LONDOS_DATA_SOURCE = "database";
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'privacy') ON CONFLICT DO NOTHING",
    [actors.operator!.userId],
  );
  await pool.query("UPDATE mfa_proofs SET verified_at=clock_timestamp() WHERE session_id=$1", [
    actors.operator!.sessionId,
  ]);
  merchant = randomUUID();
  shop = randomUUID();
  await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Fictional privacy merchant')", [
    merchant,
  ]);
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    merchant,
    actors.ownerA!.userId,
  ]);
  await pool.query(
    "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category,tagline) SELECT $1,$2,mall_id,'Fictional privacy shop',$3,'fashion','Fictional only' FROM shops WHERE id=$4",
    [shop, merchant, `privacy-${shop}`, seedIds.shopA],
  );
  await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [shop]);
  await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [shop]);
  await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [shop]);
});
afterAll(async () => {
  await pool?.end();
  await parent.query(`DROP DATABASE IF EXISTS ${name}`);
  await parent.end();
  await rm(directory, { recursive: true, force: true });
  process.env.DATABASE_URL = parentURL;
  delete process.env.LONDOS_PRIVACY_ERASURE;
  delete process.env.LONDOS_PILOT_ANALYTICS;
  delete process.env.LONDOS_DATA_SOURCE;
});
async function enquiry(days = 31, status = "closed") {
  const id = randomUUID(),
    key = randomUUID();
  await pool.query(
    "INSERT INTO guest_requests(id,shop_id,merchant_id,request_key,fingerprint,kind,name,reply_to,message,status,closed_at) VALUES($1,$2,$3,$4,$7,'enquiry','CUSTOMER_PRIVATE_NAME','customer-private@invalid.example','CUSTOMER_PRIVATE_MESSAGE',$5,clock_timestamp()-($6::int*interval '1 day'))",
    [
      id,
      shop,
      merchant,
      key,
      status,
      days,
      createHash("sha256")
        .update(
          JSON.stringify({
            key,
            kind: "enquiry",
            name: "CUSTOMER_PRIVATE_NAME",
            replyTo: "customer-private@invalid.example",
            message: "CUSTOMER_PRIVATE_MESSAGE",
            productId: null,
          }),
        )
        .digest("hex"),
    ],
  );
  return id;
}
async function application(state = "rejected", days = 31, applicant = actors.ownerA!.userId) {
  const id = randomUUID(),
    bytes = Buffer.from("Fictional verification bytes"),
    digest = createHash("sha256").update(bytes).digest("hex");
  await pool.query(
    "INSERT INTO applications(id,merchant_id,applicant_id,state,business_name,updated_at) VALUES($1,$2,$3,$4,'Fictional rejected application',clock_timestamp()-($5::int*interval '1 day'))",
    [id, merchant, applicant, state, days],
  );
  await pool.query(
    "INSERT INTO application_evidence(application_id,merchant_id,slot,bytes,digest,created_by) VALUES($1,$2,1,$3,$4,$5)",
    [id, merchant, bytes, digest, applicant],
  );
  return id;
}
async function request(
  kind: "enquiry" | "verification" | "analytics" | "history",
  target = shop,
  key = randomUUID(),
) {
  return (
    await ownerPrivacyCommand(pool, actors.ownerA!, merchant, {
      action: "request",
      key,
      kind,
      target,
      reason: "Fictional owner requests privacy review.",
      confirm: true,
    })
  ).id;
}
async function assigned(id: string) {
  const r = (await pool.query("SELECT version FROM privacy_requests WHERE id=$1", [id])).rows[0];
  await claimPrivacy(pool, actors.operator!, id, {
    version: r.version,
    reason: "Fictional qualified privacy assignment.",
    confirm: true,
  });
}
async function command(
  id: string,
  action: "approve" | "deny" | "hold" | "release" | "unassign" | "resolve",
  reason = "PRIVATE_REVIEW_REASON_SENTINEL",
) {
  const r = (await pool.query("SELECT version FROM privacy_requests WHERE id=$1", [id])).rows[0];
  return commandPrivacy(pool, actors.operator!, id, {
    action,
    version: r.version,
    reason,
    explanation: "Owner-visible fictional review explanation.",
    confirm: true,
  });
}
async function approved(kind: "enquiry" | "verification" | "analytics", target: string) {
  const id = await request(kind, target);
  await assigned(id);
  await command(id, "approve");
  return id;
}
async function jobFor(id: string) {
  const r = (await pool.query("SELECT version FROM privacy_requests WHERE id=$1", [id])).rows[0];
  return (
    await pool.query(
      "UPDATE jobs SET state='running',attempts=attempts+1,lease_token=$2,lease_until=clock_timestamp()+interval '30 seconds' WHERE dedupe_key=$1 RETURNING *",
      [`privacy:${id}:${r.version}`, randomUUID()],
    )
  ).rows[0] as Job;
}
async function execute(id: string) {
  const job = await jobFor(id);
  await handlePrivacyErasure(pool, job, new AbortController().signal);
  expect(await acknowledge(pool, job)).toBe(true);
  return job;
}
async function waitFor(query: string) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (
      (
        await pool.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query=$1",
          [query],
        )
      ).rowCount
    )
      return;
    await setTimeout(20);
  }
  throw Error("Expected real PostgreSQL lock wait was not observed");
}
test("014 upgrade preserves original enquiry fields/default grants and unknown closure dates start conservatively", async () => {
  const row = (
    await pool.query("SELECT closed_at,erased_at FROM guest_requests WHERE id=$1", [legacy])
  ).rows[0];
  expect(row.closed_at.getTime()).toBeGreaterThan(Date.now() - 60000);
  expect(row.erased_at).toBeNull();
  expect((await pool.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n).toBe(
    (await readdir("migrations")).filter((file) => /^\d{3}_.+\.sql$/.test(file)).length,
  );
  await expect(
    pool.query("UPDATE privacy_policies SET terminal_days=1 WHERE id=$1", [privacyPolicyId]),
  ).rejects.toThrow();
});
test("strict request/export/decision inputs cannot forge actors, policy, approval or raw private fields", () => {
  const base = {
    action: "request",
    key: randomUUID(),
    kind: "analytics",
    target: shop,
    reason: "Fictional request",
    confirm: true,
  };
  for (const field of [
    "merchantId",
    "actorId",
    "requesterId",
    "policyId",
    "approvalHash",
    "sessionId",
    "bytes",
  ])
    expect(privacyOwnerCommand.safeParse({ ...base, [field]: "FORGED" }).success).toBe(false);
  expect(exportInput.safeParse({ section: "reports", confirm: true }).success).toBe(false);
  expect(
    privacyCommand.safeParse({
      action: "approve",
      version: 1,
      reason: "Fictional decision",
      explanation: "Fictional public reason",
      confirm: false,
    }).success,
  ).toBe(false);
});
test("owner exports and requests reject foreign owners, staff, operator fallback and foreign targets", async () => {
  for (const actor of [actors.ownerB!, actors.staff!, actors.operator!]) {
    await expect(privacyInventory(pool, actor, merchant)).rejects.toMatchObject({ status: 404 });
    await expect(
      exportPrivacy(pool, actor, merchant, { section: "shops", after: null, confirm: true }),
    ).rejects.toMatchObject({ status: 404 });
  }
  await expect(request("analytics", seedIds.shopB)).rejects.toMatchObject({ status: 404 });
  const id = await application("rejected", 31, actors.ownerB!.userId);
  await expect(request("verification", id)).rejects.toMatchObject({ status: 404 });
});
test("database references reject tenant/subject-confused requests and mismatched hold targets", async () => {
  await expect(
    pool.query(
      "INSERT INTO privacy_requests(id,merchant_id,requester_id,kind,target_id,request_key,fingerprint,requester_reason,policy_id) VALUES($1,$2,$3,'analytics',$4,$5,$6,'Fictional review',$7)",
      [
        randomUUID(),
        merchant,
        actors.ownerA!.userId,
        seedIds.shopB,
        randomUUID(),
        "a".repeat(64),
        privacyPolicyId,
      ],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  const id = await request("analytics");
  await expect(
    pool.query(
      "INSERT INTO privacy_holds(id,case_id,merchant_id,kind,target_id,reason,created_by) VALUES($1,$2,$3,'analytics',$4,'Fictional hold',$5)",
      [randomUUID(), id, merchant, seedIds.shopB, actors.operator!.userId],
    ),
  ).rejects.toMatchObject({ code: "23503" });
});
test("bounded UUID export pages preserve all catalogue rows and never mix other tenants", async () => {
  const department = randomUUID();
  await pool.query(
    "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) VALUES($1,$2,$3,'Fictional department','fictional',0)",
    [department, shop, merchant],
  );
  for (let i = 0; i < 28; i++)
    await pool.query(
      "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,price_minor,availability) VALUES($1,$2,$3,$4,'product',$5,$6,'UGX',5000,'available')",
      [randomUUID(), shop, merchant, department, `Fictional product ${i}`, `fictional-${i}`],
    );
  const first = await exportPrivacy(pool, actors.ownerA!, merchant, {
    section: "catalogue",
    after: null,
    confirm: true,
  });
  const next = await exportPrivacy(pool, actors.ownerA!, merchant, {
    section: "catalogue",
    after: first.nextAfter,
    confirm: true,
  });
  expect(first.rows).toHaveLength(25);
  expect(next.rows).toHaveLength(3);
  expect(next.nextAfter).toBeNull();
  expect(new Set([...first.rows, ...next.rows].map((r) => r.id)).size).toBe(28);
  expect([...first.rows, ...next.rows].every((r) => r.shop_id === shop)).toBe(true);
});
test("all export sections exclude customer, other-subject, secret, evidence and private investigation content", async () => {
  await enquiry();
  await application();
  await application("rejected", 31, actors.ownerB!.userId);
  await pool.query(
    "INSERT INTO incident_cases(id,shop_id,merchant_id,reporter_id,kind,message,fingerprint) VALUES($1,$2,$3,$4,'support','OTHER_OWNER_PRIVATE_INCIDENT',$5)",
    [randomUUID(), shop, merchant, actors.ownerB!.userId, "b".repeat(64)],
  );
  for (const section of [
    "shops",
    "departments",
    "catalogue",
    "contacts",
    "invoices",
    "applications",
    "incidents",
    "analytics",
  ] as const) {
    const data = await exportPrivacy(pool, actors.ownerA!, merchant, {
        section,
        after: null,
        confirm: true,
      }),
      text = JSON.stringify(data.rows);
    for (const secret of [
      "CUSTOMER_PRIVATE_NAME",
      "CUSTOMER_PRIVATE_MESSAGE",
      "customer-private@invalid.example",
      "OTHER_OWNER_PRIVATE_INCIDENT",
      accounts.ownerA.password,
      actors.ownerA!.sessionId,
      "Fictional verification bytes",
    ])
      expect(text).not.toContain(secret);
    if (section === "applications") expect(data.rows).toHaveLength(1);
    if (section === "incidents") expect(data.rows).toHaveLength(0);
  }
  const audits = (
    await pool.query(
      "SELECT details FROM audit_events WHERE merchant_id=$1 AND action='privacy.export'",
      [merchant],
    )
  ).rows;
  expect(audits).toHaveLength(8);
  expect(audits.every((r) => Object.keys(r.details).sort().join(",") === "records,section")).toBe(
    true,
  );
});
test("concurrent identical owner retries have one request/history effect; changed retries conflict", async () => {
  const key = randomUUID(),
    results = await Promise.all(Array.from({ length: 8 }, () => request("analytics", shop, key)));
  expect(new Set(results).size).toBe(1);
  expect(
    (
      await pool.query("SELECT count(*)::int AS n FROM privacy_events WHERE case_id=$1", [
        results[0],
      ])
    ).rows[0].n,
  ).toBe(1);
  await expect(
    ownerPrivacyCommand(pool, actors.ownerA!, merchant, {
      action: "request",
      key,
      kind: "history",
      target: shop,
      reason: "Fictional owner requests privacy review.",
      confirm: true,
    }),
  ).rejects.toMatchObject({ status: 409 });
});
test("privacy authority is independent, scope is explicit and self-review is refused", async () => {
  const id = await request("analytics");
  await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='privacy'", [
    actors.operator!.userId,
  ]);
  await expect(privacyQueue(pool, actors.operator!)).rejects.toMatchObject({ status: 403 });
  await pool.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'privacy')", [
    actors.operator!.userId,
  ]);
  await expect(readPrivacy(pool, actors.operator!, id)).rejects.toMatchObject({ status: 404 });
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'staff')", [
    merchant,
    actors.operator!.userId,
  ]);
  await expect(assigned(id)).rejects.toMatchObject({ code: "conflict_of_interest" });
});
test("competing claims have one winner and append immutable scoped history", async () => {
  const id = await request("analytics"),
    body = { version: 1, reason: "Fictional competing claim", confirm: true as const };
  const results = await Promise.allSettled([
    claimPrivacy(pool, actors.operator!, id, body),
    claimPrivacy(pool, actors.operator!, id, body),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (
      await pool.query("SELECT count(*)::int AS n FROM operator_privacy_scopes WHERE case_id=$1", [
        id,
      ])
    ).rows[0].n,
  ).toBe(1);
  await expect(pool.query("DELETE FROM privacy_events WHERE case_id=$1", [id])).rejects.toThrow();
  await expect(
    pool.query("UPDATE privacy_requests SET target_id=$2 WHERE id=$1", [id, seedIds.shopB]),
  ).rejects.toThrow();
});
test("retention holds block approval; reasoned release retains private history without owner leakage", async () => {
  const target = await enquiry(),
    id = await request("enquiry", target);
  await assigned(id);
  await command(id, "hold");
  await expect(command(id, "approve")).rejects.toMatchObject({
    code: "privacy_target_not_eligible",
  });
  const owner = await privacyInventory(pool, actors.ownerA!, merchant);
  expect(JSON.stringify(owner)).not.toContain("PRIVATE_REVIEW_REASON_SENTINEL");
  expect(owner.requests[0]!.state).toBe("held");
  await command(id, "release");
  await command(id, "approve");
  await execute(id);
  expect(
    (await pool.query("SELECT released_at FROM privacy_holds WHERE case_id=$1", [id])).rows[0]
      .released_at,
  ).not.toBeNull();
  expect((await readPrivacy(pool, actors.operator!, id)).request.state).toBe("completed");
});
test("age, open enquiry, approved application and financial references prevent erasure", async () => {
  for (const target of [await enquiry(29), await enquiry(31, "new")]) {
    const id = await request("enquiry", target);
    await assigned(id);
    await expect(command(id, "approve")).rejects.toMatchObject({
      code: "privacy_target_not_eligible",
    });
  }
  for (const target of [await application("approved"), await application("rejected", 29)]) {
    const id = await request("verification", target);
    await assigned(id);
    await expect(command(id, "approve")).rejects.toMatchObject({
      code: "privacy_target_not_eligible",
    });
  }
  const target = await application();
  await pool.query(
    "INSERT INTO invoices(id,merchant_id,application_id,currency,amount_minor,period_start,period_end) VALUES($1,$2,$3,'UGX',5000,now(),now()+interval '30 days')",
    [randomUUID(), merchant, target],
  );
  const id = await request("verification", target);
  await assigned(id);
  await expect(command(id, "approve")).rejects.toMatchObject({
    code: "privacy_target_not_eligible",
  });
});
test("primary enquiry erasure is atomic and one-way while minimal retry identity remains", async () => {
  const target = await enquiry(),
    before = (await pool.query("SELECT * FROM guest_requests WHERE id=$1", [target])).rows[0],
    id = await approved("enquiry", target),
    job = await jobFor(id);
  await handlePrivacyErasure(pool, job, new AbortController().signal);
  await handlePrivacyErasure(pool, job, new AbortController().signal);
  expect(await acknowledge(pool, job)).toBe(true);
  const after = (await pool.query("SELECT * FROM guest_requests WHERE id=$1", [target])).rows[0];
  expect([after.name, after.reply_to, after.message]).toEqual(["[Erased]", "[Erased]", "[Erased]"]);
  expect(after.erased_at).not.toBeNull();
  expect([after.id, after.request_key, after.fingerprint, after.status, after.closed_at]).toEqual([
    before.id,
    before.request_key,
    before.fingerprint,
    before.status,
    before.closed_at,
  ]);
  await expect(
    pool.query("UPDATE guest_requests SET message='RESTORED PRIVATE CONTENT' WHERE id=$1", [
      target,
    ]),
  ).rejects.toThrow();
  await expect(handlePrivacyErasure(pool, job, new AbortController().signal)).rejects.toThrow(
    "lease_lost",
  );
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM privacy_events WHERE case_id=$1 AND kind='complete'",
        [id],
      )
    ).rows[0].n,
  ).toBe(1);
  expect((await readPrivacy(pool, actors.operator!, id)).request.result).toMatchObject({
    primaryDataErased: true,
    backupsErased: false,
    externalCopiesErased: false,
  });
});
test("verification erasure removes only eligible byte payloads and preserves application/submission/audit metadata", async () => {
  const target = await application();
  await pool.query(
    "INSERT INTO application_submissions(application_id,version,snapshot) VALUES($1,1,'{\"fictional\":true}')",
    [target],
  );
  const before = (await pool.query("SELECT * FROM applications WHERE id=$1", [target])).rows;
  const id = await approved("verification", target);
  await execute(id);
  expect((await pool.query("SELECT * FROM applications WHERE id=$1", [target])).rows).toEqual(
    before,
  );
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM application_submissions WHERE application_id=$1",
        [target],
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM application_evidence WHERE application_id=$1",
        [target],
      )
    ).rows[0].n,
  ).toBe(0);
  await expect(readEvidence(pool, actors.ownerA!, target, 1, "owner")).rejects.toMatchObject({
    status: 404,
  });
});
test("direct SQL cannot erase enquiry/evidence or stop capture outside a current governed approval context", async () => {
  const target = await enquiry(),
    app = await application(),
    id = await request("analytics");
  await expect(
    pool.query(
      "UPDATE guest_requests SET name='[Erased]',reply_to='[Erased]',message='[Erased]',erased_at=now() WHERE id=$1",
      [target],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    pool.query("DELETE FROM application_evidence WHERE application_id=$1", [app]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    pool.query(
      "INSERT INTO shop_privacy_exclusions(shop_id,merchant_id,case_id) VALUES($1,$2,$3)",
      [shop, merchant, id],
    ),
  ).rejects.toMatchObject({ code: "23514" });
});
test("analytics erasure stops future capture, preserves platform counters and canonical business states", async () => {
  const d = await saveDesign(pool, actors.ownerA!, shop, {
    version: 0,
    summary: "Fictional privacy design",
    specification: {
      schemaVersion: 1,
      theme: "earth",
      announcement: "",
      spaces: [
        { id: "story", type: "story", version: 1, title: "Fictional shop", body: "Fictional only" },
      ],
      actions: ["call"],
    },
  });
  await publishDesign(pool, actors.ownerA!, shop, { ...d, confirm: true });
  await pool.query(
    "INSERT INTO pilot_metrics(day,shop_id,merchant_id,event,source,detail,count) VALUES(current_date,$1,$2,'shop_viewed','direct','none',5)",
    [shop, merchant],
  );
  await pool.query(
    "INSERT INTO pilot_metrics(day,event,source,detail,count) VALUES(current_date,'mall_visit','none','none',2) ON CONFLICT(day,shop_id,event,source,detail) DO UPDATE SET count=pilot_metrics.count+2",
  );
  const before = (
    await pool.query(
      "SELECT state FROM shop_publication WHERE shop_id=$1 UNION ALL SELECT state FROM tenancies WHERE shop_id=$1 UNION ALL SELECT state FROM shop_moderation WHERE shop_id=$1",
      [shop],
    )
  ).rows;
  const id = await approved("analytics", shop);
  await execute(id);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM pilot_metrics WHERE shop_id=$1", [shop]))
      .rows[0].n,
  ).toBe(0);
  const c = renderPilotContext({
    page: "shop",
    shopId: shop,
    departmentId: null,
    productId: null,
    shops: [],
    resultCount: 0,
    globalDiscovery: false,
    channels: ["call"],
  })!;
  expect(
    await storePilotEvent(pool, new Headers({ "user-agent": "Fictional browser" }), {
      token: c.token,
      event: "shop_viewed",
      target: null,
      source: "direct",
      channel: null,
    }),
  ).toBe(false);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM pilot_metrics WHERE shop_id IS NULL")).rows[0]
      .n,
  ).toBeGreaterThan(0);
  expect(
    (
      await pool.query(
        "SELECT state FROM shop_publication WHERE shop_id=$1 UNION ALL SELECT state FROM tenancies WHERE shop_id=$1 UNION ALL SELECT state FROM shop_moderation WHERE shop_id=$1",
        [shop],
      )
    ).rows,
  ).toEqual(before);
  await expect(
    pool.query("DELETE FROM shop_privacy_exclusions WHERE shop_id=$1", [shop]),
  ).rejects.toThrow();
});
test("protected history is explicitly retained and denial/closure never deletes it", async () => {
  const id = await request("history");
  await assigned(id);
  await expect(command(id, "approve")).rejects.toMatchObject({ status: 409 });
  await command(id, "deny");
  await pool.query("UPDATE tenancies SET state='closed' WHERE shop_id=$1", [shop]);
  expect((await pool.query("SELECT id FROM shops WHERE id=$1", [shop])).rowCount).toBe(1);
  expect((await readPrivacy(pool, actors.operator!, id)).request.state).toBe("denied");
  await expect(pool.query("DELETE FROM privacy_requests WHERE id=$1", [id])).rejects.toThrow();
});
test("disabled erasure refuses approval/execution while exports and requests remain available", async () => {
  const target = await enquiry(),
    id = await request("enquiry", target);
  await assigned(id);
  process.env.LONDOS_PRIVACY_ERASURE = "false";
  await expect(command(id, "approve")).rejects.toMatchObject({ code: "local_erasure_disabled" });
  expect((await privacyInventory(pool, actors.ownerA!, merchant)).erasureEnabled).toBe(false);
  expect(
    (
      await exportPrivacy(pool, actors.ownerA!, merchant, {
        section: "shops",
        after: null,
        confirm: true,
      })
    ).rows,
  ).toHaveLength(1);
});
test("stale/wrong-scope worker leases cannot apply an approved effect", async () => {
  const target = await enquiry(),
    id = await approved("enquiry", target),
    job = await jobFor(id);
  await expect(
    handlePrivacyErasure(pool, { ...job, lease_token: randomUUID() }, new AbortController().signal),
  ).rejects.toThrow("lease_lost");
  await expect(
    handlePrivacyErasure(
      pool,
      { ...job, merchant_id: seedIds.merchantB },
      new AbortController().signal,
    ),
  ).rejects.toThrow("privacy_job_scope_mismatch");
  expect(
    (await pool.query("SELECT erased_at FROM guest_requests WHERE id=$1", [target])).rows[0]
      .erased_at,
  ).toBeNull();
});
test("target changes and expired approvals return to review without erasure", async () => {
  const target = await enquiry(),
    id = await approved("enquiry", target);
  await pool.query(
    "UPDATE guest_requests SET message='CHANGED FICTIONAL CONTENT',version=version+1 WHERE id=$1",
    [target],
  );
  await execute(id);
  expect((await readPrivacy(pool, actors.operator!, id)).request.state).toBe("reviewing");
  const target2 = await enquiry(),
    id2 = await approved("enquiry", target2);
  await pool.query(
    "UPDATE privacy_requests SET approval_until=clock_timestamp()-interval '1 second' WHERE id=$1",
    [id2],
  );
  await execute(id2);
  expect((await readPrivacy(pool, actors.operator!, id2)).request.state).toBe("reviewing");
  expect(
    (
      await pool.query("SELECT erased_at FROM guest_requests WHERE id=ANY($1::uuid[])", [
        [target, target2],
      ])
    ).rows.every((r) => r.erased_at === null),
  ).toBe(true);
});
test("erasure/history/job-effect rollback together on a real SQL failure; valid retry succeeds", async () => {
  const target = await enquiry(),
    id = await approved("enquiry", target),
    job = await jobFor(id);
  await pool.query(
    "CREATE FUNCTION privacy_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional primary storage failure'; END $$",
  );
  await pool.query(
    "CREATE TRIGGER privacy_fixture_failure BEFORE UPDATE ON guest_requests FOR EACH ROW EXECUTE FUNCTION privacy_fixture_fail()",
  );
  try {
    await expect(handlePrivacyErasure(pool, job, new AbortController().signal)).rejects.toThrow(
      "Fictional primary storage failure",
    );
  } finally {
    await pool.query("DROP TRIGGER privacy_fixture_failure ON guest_requests");
    await pool.query("DROP FUNCTION privacy_fixture_fail()");
  }
  expect(
    (await pool.query("SELECT erased_at FROM guest_requests WHERE id=$1", [target])).rows[0]
      .erased_at,
  ).toBeNull();
  expect(
    (await pool.query("SELECT state FROM privacy_requests WHERE id=$1", [id])).rows[0].state,
  ).toBe("approved");
  expect((await pool.query("SELECT 1 FROM job_effects WHERE job_id=$1", [job.id])).rowCount).toBe(
    0,
  );
  await handlePrivacyErasure(pool, job, new AbortController().signal);
  expect((await readPrivacy(pool, actors.operator!, id)).request.state).toBe("completed");
});
test("revoked owner during a proven merchant-lock wait denies private exports", async () => {
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    merchant,
    actors.staff!.userId,
  ]);
  const c = await pool.connect();
  await c.query("BEGIN");
  await c.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchant]);
  const pending = exportPrivacy(pool, actors.ownerA!, merchant, {
    section: "contacts",
    after: null,
    confirm: true,
  }).catch((e) => e);
  try {
    await waitFor("SELECT id FROM merchants WHERE id=$1 FOR UPDATE");
    await c.query("UPDATE memberships SET status='revoked' WHERE merchant_id=$1 AND user_id=$2", [
      merchant,
      actors.ownerA!.userId,
    ]);
    await c.query("COMMIT");
    expect(await pending).toMatchObject({ status: 404 });
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
});
test("revoked privacy grant during a proven merchant-lock wait denies approval", async () => {
  const target = await enquiry(),
    id = await request("enquiry", target);
  await assigned(id);
  const c = await pool.connect();
  await c.query("BEGIN");
  await c.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchant]);
  const pending = command(id, "approve").catch((e) => e);
  try {
    await waitFor("SELECT id FROM merchants WHERE id=$1 FOR UPDATE");
    await c.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='privacy'", [
      actors.operator!.userId,
    ]);
    await c.query("COMMIT");
    expect(await pending).toMatchObject({ status: 403 });
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
  expect(
    (
      await pool.query("SELECT 1 FROM jobs WHERE kind='privacy.erase' AND merchant_id=$1", [
        merchant,
      ])
    ).rowCount,
  ).toBe(0);
});
test("revoked scope or aged native MFA before execution invalidates approval without primary changes", async () => {
  const target = await enquiry(),
    id = await approved("enquiry", target);
  await pool.query("DELETE FROM operator_privacy_scopes WHERE case_id=$1", [id]);
  await execute(id);
  expect(
    (await pool.query("SELECT state FROM privacy_requests WHERE id=$1", [id])).rows[0].state,
  ).toBe("reviewing");
  const target2 = await enquiry(),
    id2 = await approved("enquiry", target2);
  await pool.query(
    "UPDATE mfa_proofs SET verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",
    [actors.operator!.sessionId],
  );
  await execute(id2);
  expect(
    (
      await pool.query("SELECT erased_at FROM guest_requests WHERE id=ANY($1::uuid[])", [
        [target, target2],
      ])
    ).rows.every((r) => r.erased_at === null),
  ).toBe(true);
});
test("a late hold during a proven worker lock wait prevents primary effects", async () => {
  const target = await enquiry(),
    id = await approved("enquiry", target),
    job = await jobFor(id),
    c = await pool.connect();
  await c.query("BEGIN");
  await c.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchant]);
  const pending = handlePrivacyErasure(pool, job, new AbortController().signal);
  try {
    await waitFor("SELECT id FROM merchants WHERE id=$1 FOR UPDATE");
    await c.query(
      "INSERT INTO privacy_holds(id,case_id,merchant_id,kind,target_id,reason,created_by) VALUES($1,$2,$3,'enquiry',$4,'Fictional late retention hold',$5)",
      [randomUUID(), id, merchant, target, actors.operator!.userId],
    );
    await c.query("COMMIT");
    await pending;
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
  expect((await readPrivacy(pool, actors.operator!, id)).request.state).toBe("held");
  expect(
    (await pool.query("SELECT erased_at FROM guest_requests WHERE id=$1", [target])).rows[0]
      .erased_at,
  ).toBeNull();
});
test("assignment release clears scope and approval; a qualified new claim preserves hold history", async () => {
  const id = await request("analytics");
  await assigned(id);
  await command(id, "hold");
  await command(id, "unassign");
  expect(
    (await pool.query("SELECT 1 FROM operator_privacy_scopes WHERE case_id=$1", [id])).rowCount,
  ).toBe(0);
  await expect(readPrivacy(pool, actors.operator!, id)).rejects.toMatchObject({ status: 404 });
  await assigned(id);
  expect((await readPrivacy(pool, actors.operator!, id)).holds).toHaveLength(1);
});

test("a real guest retry after enquiry erasure cannot recreate primary personal content", async () => {
  await pool.query("UPDATE shop_publication SET state='active' WHERE shop_id=$1", [shop]);
  const draft = await saveDesign(pool, actors.ownerA!, shop, {
    version: 0,
    summary: "Public privacy retry fixture",
    specification: { schemaVersion: 1, theme: "earth", announcement: "", spaces: [], actions: [] },
  });
  await publishDesign(pool, actors.ownerA!, shop, { ...draft, confirm: true });
  await pool.query(
    "INSERT INTO shop_contacts(shop_id,merchant_id,version,fulfilment,payment_instructions,delivery_instructions,enquiries_enabled) VALUES($1,$2,1,'contact','','',true)",
    [shop, merchant],
  );
  const target = await enquiry(),
    before = (await pool.query("SELECT request_key FROM guest_requests WHERE id=$1", [target]))
      .rows[0];
  const id = await approved("enquiry", target);
  await execute(id);
  expect(
    await submitGuestRequest(pool, shop, {
      key: before.request_key,
      kind: "enquiry",
      name: "CUSTOMER_PRIVATE_NAME",
      replyTo: "customer-private@invalid.example",
      message: "CUSTOMER_PRIVATE_MESSAGE",
      productId: null,
    }),
  ).toEqual({ received: true });
  expect(
    (await pool.query("SELECT name,reply_to,message FROM guest_requests WHERE shop_id=$1", [shop]))
      .rows,
  ).toEqual([{ name: "[Erased]", reply_to: "[Erased]", message: "[Erased]" }]);
});

test("requester revocation during a proven worker merchant-lock wait invalidates the approval", async () => {
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    merchant,
    actors.staff!.userId,
  ]);
  const target = await enquiry(),
    id = await approved("enquiry", target),
    job = await jobFor(id),
    c = await pool.connect();
  await c.query("BEGIN");
  await c.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchant]);
  const pending = handlePrivacyErasure(pool, job, new AbortController().signal);
  try {
    await waitFor("SELECT id FROM merchants WHERE id=$1 FOR UPDATE");
    await c.query("UPDATE memberships SET status='revoked' WHERE merchant_id=$1 AND user_id=$2", [
      merchant,
      actors.ownerA!.userId,
    ]);
    await c.query("COMMIT");
    await pending;
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
  expect((await readPrivacy(pool, actors.operator!, id)).request.state).toBe("reviewing");
  expect(
    (await pool.query("SELECT erased_at FROM guest_requests WHERE id=$1", [target])).rows[0]
      .erased_at,
  ).toBeNull();
});

test("native MFA aging during a proven worker user-lock wait denies the erasure", async () => {
  const target = await enquiry(),
    id = await approved("enquiry", target),
    job = await jobFor(id),
    c = await pool.connect();
  await c.query("BEGIN");
  await c.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [actors.operator!.userId]);
  const pending = handlePrivacyErasure(pool, job, new AbortController().signal);
  try {
    await waitFor('SELECT id FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE');
    await c.query(
      "UPDATE mfa_proofs SET verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",
      [actors.operator!.sessionId],
    );
    await c.query("COMMIT");
    await pending;
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
  expect(
    (await pool.query("SELECT state FROM privacy_requests WHERE id=$1", [id])).rows[0].state,
  ).toBe("reviewing");
  expect(
    (await pool.query("SELECT erased_at FROM guest_requests WHERE id=$1", [target])).rows[0]
      .erased_at,
  ).toBeNull();
});

test("a captured observation waiting behind erasure cannot recreate erased shop metrics", async () => {
  const d = await saveDesign(pool, actors.ownerA!, shop, {
    version: 0,
    summary: "Fictional fenced capture",
    specification: {
      schemaVersion: 1,
      theme: "earth",
      announcement: "",
      spaces: [
        { id: "story", type: "story", version: 1, title: "Fictional", body: "Fictional only" },
      ],
      actions: ["call"],
    },
  });
  await publishDesign(pool, actors.ownerA!, shop, { ...d, confirm: true });
  const token = renderPilotContext({
    page: "shop",
    shopId: shop,
    departmentId: null,
    productId: null,
    shops: [],
    resultCount: 0,
    globalDiscovery: false,
    channels: ["call"],
  })!.token;
  const id = await approved("analytics", shop),
    job = await jobFor(id),
    c = await pool.connect();
  await c.query("BEGIN");
  await c.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchant]);
  const erasure = handlePrivacyErasure(pool, job, new AbortController().signal);
  let capture: Promise<boolean> | undefined;
  try {
    await waitFor("SELECT id FROM merchants WHERE id=$1 FOR UPDATE");
    capture = storePilotEvent(pool, new Headers({ "user-agent": "Fictional browser" }), {
      token,
      event: "shop_viewed",
      target: null,
      source: "direct",
      channel: null,
    });
    await waitFor("SELECT id FROM merchants WHERE id=$1 FOR SHARE");
    await c.query("COMMIT");
    await erasure;
    expect(await capture).toBe(false);
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
  expect((await pool.query("SELECT 1 FROM pilot_metrics WHERE shop_id=$1", [shop])).rowCount).toBe(
    0,
  );
});

test("hosted privacy supports scoped export and manual review but cannot erase production data", async () => {
  const old = process.env.LONDOS_LOCAL_ADAPTERS;
  process.env.LONDOS_LOCAL_ADAPTERS = "false";
  try {
    const id = await request("history");
    expect(
      (await pool.query("SELECT policy_id FROM privacy_requests WHERE id=$1", [id])).rows[0]
        .policy_id,
    ).toBe("91000000-0000-4000-8000-000000000002");
    expect((await privacyInventory(pool, actors.ownerA!, merchant)).erasureEnabled).toBe(false);
    await expect(privacyInventory(pool, actors.ownerB!, merchant)).rejects.toMatchObject({
      status: 404,
    });
    await expect(readPrivacy(pool, actors.operator!, id)).rejects.toMatchObject({ status: 404 });
    await assigned(id);
    expect((await readPrivacy(pool, actors.operator!, id)).target.eligible).toBe(false);
    await expect(command(id, "approve")).rejects.toMatchObject({ code: "local_erasure_disabled" });
    await exportPrivacy(pool, actors.ownerA!, merchant, {
      section: "shops",
      after: null,
      confirm: true,
    });
    await command(id, "hold");
    expect((await readPrivacy(pool, actors.operator!, id)).request.state).toBe("held");
    await expect(command(id, "resolve")).rejects.toMatchObject({
      code: "privacy_request_not_resolvable",
    });
    await command(id, "release");
    await command(id, "resolve");
    const final = await readPrivacy(pool, actors.operator!, id);
    expect(final.request.state).toBe("completed");
    expect(final.request.result).toEqual({ manualReviewCompleted: true, primaryDataErased: false });
    expect(
      (
        await pool.query(
          "SELECT 1 FROM jobs WHERE kind='privacy.erase' AND payload->>'caseId'=$1",
          [id],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    process.env.LONDOS_LOCAL_ADAPTERS = old;
  }
});
