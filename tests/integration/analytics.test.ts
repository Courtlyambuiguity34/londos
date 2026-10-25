import { beforeAll, beforeEach, afterAll, test, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID, createHmac } from "node:crypto";
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
  renderPilotContext,
  storePilotEvent,
  cleanupPilotMetrics,
  readShopPilot,
  readOperatorPilot,
  pilotPolicy,
} from "../../src/server/analytics";
import {
  captureInput,
  type CaptureInput,
  type PilotContext,
} from "../../src/modules/analytics/contract";
import { saveDesign, publishDesign, readDesign } from "../../src/server/shop-design";
import { saveProduct } from "../../src/server/catalogue";
const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  directory: string,
  auth: Auth,
  accounts: SeedAccounts,
  department: string,
  product: string,
  baseline: unknown;
const actors: Record<string, Actor> = {},
  headers = new Headers({ "user-agent": "Fictional browser" });
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
  process.env.LONDOS_DATA_SOURCE = "database";
  process.env.LONDOS_PILOT_ANALYTICS = "true";
  pool = new Pool({ connectionString: url.toString(), max: 12 });
  directory = await mkdtemp(join(tmpdir(), "londos-analytics-"));
  await migrate(pool, undefined, "013_local_incidents_and_contact_history.sql");
  auth = createAuth(pool, coreConfig(), true);
  accounts = await seed(pool, auth, directory);
  baseline = (await pool.query("SELECT * FROM shops ORDER BY id")).rows;
  await migrate(pool);
  await migrate(pool);
  for (const key of ["ownerA", "ownerB", "staff", "operator"] as const) {
    const c = new Client();
    expect((await c.post("sign-in/email", accounts[key])).status).toBe(200);
    if (key === "operator") {
      const enabled = await c.post("two-factor/enable", { password: accounts[key].password });
      const secret = new URL((await enabled.json()).totpURI).searchParams.get("secret")!;
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
  await pool.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'analytics')", [
    actors.operator!.userId,
  ]);
  department = (
    await pool.query("SELECT id FROM departments WHERE shop_id=$1 ORDER BY id LIMIT 1", [
      seedIds.shopA,
    ])
  ).rows[0].id;
  product = (
    await pool.query("SELECT id FROM products WHERE department_id=$1 ORDER BY id LIMIT 1", [
      department,
    ])
  ).rows[0].id;
  const d = await saveDesign(pool, actors.ownerA!, seedIds.shopA, {
    version: 0,
    summary: "Fictional analytics design",
    specification: {
      schemaVersion: 1,
      theme: "earth",
      announcement: "",
      spaces: [
        { id: "story", type: "story", version: 1, title: "Fictional shop", body: "Sample only" },
      ],
      actions: ["call", "enquiry"],
    },
  });
  await publishDesign(pool, actors.ownerA!, seedIds.shopA, { ...d, confirm: true });
});
beforeEach(async () => {
  process.env.LONDOS_PILOT_ANALYTICS = "true";
  process.env.LONDOS_DATA_SOURCE = "database";
  process.env.LONDOS_PILOT_RETENTION_DAYS = "30";
  await pool.query("DELETE FROM pilot_metrics");
  await pool.query("DELETE FROM pilot_receipts");
  await pool.query("DELETE FROM request_budgets WHERE key LIKE 'pilot:%'");
});
afterAll(async () => {
  await pool?.end();
  await parent.query(`DROP DATABASE IF EXISTS ${name}`);
  await parent.end();
  await rm(directory, { recursive: true, force: true });
  process.env.DATABASE_URL = parentURL;
  delete process.env.LONDOS_PILOT_ANALYTICS;
  delete process.env.LONDOS_PILOT_RETENTION_DAYS;
  delete process.env.LONDOS_DATA_SOURCE;
});
function context(overrides: Partial<PilotContext> = {}) {
  return renderPilotContext({
    page: "shop",
    shopId: seedIds.shopA,
    departmentId: null,
    productId: null,
    shops: [],
    resultCount: 0,
    globalDiscovery: false,
    channels: ["call", "enquiry"],
    ...overrides,
  })!;
}
function event(c = context(), overrides: Partial<CaptureInput> = {}) {
  return {
    token: c.token,
    event: "shop_viewed",
    target: null,
    source: "direct",
    channel: null,
    ...overrides,
  } as CaptureInput;
}
async function counts() {
  return (
    await pool.query(
      "SELECT event,source,detail,count::int AS count FROM pilot_metrics ORDER BY event,source,detail",
    )
  ).rows;
}
async function waitForLock() {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (
      (
        await pool.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid() AND query LIKE '%pilot_metrics%' OR datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid() AND query LIKE '%merchants%'",
        )
      ).rowCount
    )
      return;
    await setTimeout(10);
  }
  throw Error("Expected proven lock wait");
}
test("013-to-014 preserves existing shops/default grants and aggregate references are tenant-consistent", async () => {
  expect((await pool.query("SELECT * FROM shops ORDER BY id")).rows).toEqual(baseline);
  expect((await pool.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n).toBe(
    (await readdir("migrations")).filter((file) => /^\d{3}_.+\.sql$/.test(file)).length,
  );
  await expect(
    pool.query(
      "INSERT INTO pilot_metrics VALUES(current_date,$1,$2,'shop_viewed','direct','none',1)",
      [seedIds.shopA, seedIds.merchantB],
    ),
  ).rejects.toMatchObject({ code: "23503" });
  expect(
    (
      await pool.query(
        "SELECT permission FROM operator_grants WHERE user_id=$1 ORDER BY permission",
        [actors.operator!.userId],
      )
    ).rows.map((r) => r.permission),
  ).toEqual(["analytics", "jobs", "review"]);
});
test("strict event/context contracts exclude raw sensitive fields and forged merchant events", async () => {
  for (const field of [
    "query",
    "url",
    "referrer",
    "ip",
    "visitorId",
    "userId",
    "email",
    "paymentInstructions",
  ]) {
    expect(captureInput.safeParse({ ...event(), [field]: "PRIVATE" }).success).toBe(false);
  }
  expect(captureInput.safeParse({ ...event(), event: "merchant_publish" }).success).toBe(false);
  await expect(
    storePilotEvent(
      pool,
      headers,
      event(context({ page: "mall", shopId: null }), { event: "product_viewed" }),
    ),
  ).rejects.toMatchObject({ status: 422 });
});
test("signed contexts bind exact actions/targets/channels and expired/tampered contexts cannot count", async () => {
  await expect(
    storePilotEvent(pool, headers, { ...event(), token: event().token + "broken" }),
  ).rejects.toMatchObject({ status: 422 });
  const c = context(),
    payload = JSON.parse(Buffer.from(c.token.split(".")[0]!, "base64url").toString());
  payload.until = Date.now() - 1;
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url"),
    signature = createHmac("sha256", coreConfig().secret)
      .update(`londos-pilot-v1:${coreConfig().baseURL}:${encoded}`)
      .digest("base64url");
  await expect(
    storePilotEvent(pool, headers, { ...event(c), token: `${encoded}.${signature}` }),
  ).rejects.toMatchObject({ code: "context_expired" });
  await expect(
    storePilotEvent(
      pool,
      headers,
      event(c, { event: "contact_action_clicked", channel: "website" }),
    ),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    storePilotEvent(
      pool,
      headers,
      event(
        context({ page: "search", shopId: null, shops: [seedIds.shopA], globalDiscovery: true }),
        { event: "shop_result_clicked", target: seedIds.shopB, source: "discovery" },
      ),
    ),
  ).rejects.toMatchObject({ status: 422 });
  expect(await counts()).toEqual([]);
});
test("concurrent retries count once; changed retry attribution cannot rewrite or double-count", async () => {
  const e = event();
  expect(
    (await Promise.all([1, 2, 3, 4].map(() => storePilotEvent(pool, headers, e)))).filter(Boolean),
  ).toHaveLength(1);
  expect(await storePilotEvent(pool, headers, { ...e, source: "discovery" })).toBe(false);
  expect(await counts()).toEqual([
    { event: "shop_viewed", source: "direct", detail: "none", count: 1 },
  ]);
  expect((await pool.query("SELECT * FROM pilot_receipts")).rows).toHaveLength(1);
});
test("all nine public events have bounded source/detail semantics and no visitor/raw content rows", async () => {
  const mall = context({
    page: "mall",
    shopId: null,
    channels: [],
    shops: [seedIds.shopA],
    globalDiscovery: true,
  });
  await storePilotEvent(pool, headers, event(mall, { event: "mall_visit", source: null }));
  await storePilotEvent(pool, headers, event(mall, { event: "search_submitted", source: null }));
  await storePilotEvent(
    pool,
    headers,
    event(context({ page: "search", shopId: null, resultCount: 0 }), {
      event: "search_results_viewed",
      source: null,
    }),
  );
  await storePilotEvent(
    pool,
    headers,
    event(mall, { event: "shop_result_clicked", target: seedIds.shopA, source: "discovery" }),
  );
  await storePilotEvent(pool, headers, event());
  await storePilotEvent(
    pool,
    headers,
    event(context({ page: "department", departmentId: department }), {
      event: "department_viewed",
    }),
  );
  await storePilotEvent(
    pool,
    headers,
    event(context({ page: "product", productId: product }), { event: "product_viewed" }),
  );
  await storePilotEvent(
    pool,
    headers,
    event(context(), { event: "contact_action_clicked", channel: "call" }),
  );
  await storePilotEvent(pool, headers, event(context(), { event: "direct_link_entry" }));
  expect((await counts()).map((r) => r.event)).toEqual([
    "contact_action_clicked",
    "department_viewed",
    "direct_link_entry",
    "mall_visit",
    "product_viewed",
    "search_results_viewed",
    "search_submitted",
    "shop_result_clicked",
    "shop_viewed",
  ]);
  expect(
    (
      await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='pilot_metrics' ORDER BY ordinal_position",
      )
    ).rows.map((r) => r.column_name),
  ).toEqual(["day", "shop_id", "merchant_id", "event", "source", "detail", "count"]);
});
test("current publication/moderation/hold and owned active resources fence late public events", async () => {
  const c = context();
  await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [
    seedIds.shopA,
  ]);
  expect(await storePilotEvent(pool, headers, event(c))).toBe(false);
  await pool.query("UPDATE shop_moderation SET state='clear' WHERE shop_id=$1", [seedIds.shopA]);
  await pool.query(
    "INSERT INTO shop_operations(shop_id,merchant_id,paused,reason,changed_by) VALUES($1,$2,true,'Fictional analytics eligibility check',$3) ON CONFLICT(shop_id) DO UPDATE SET paused=true",
    [seedIds.shopA, seedIds.merchantA, actors.operator!.userId],
  );
  expect(await storePilotEvent(pool, headers, event(c))).toBe(false);
  await pool.query("UPDATE shop_operations SET paused=false WHERE shop_id=$1", [seedIds.shopA]);
  expect(
    await storePilotEvent(
      pool,
      headers,
      event(context({ page: "product", productId: randomUUID() }), { event: "product_viewed" }),
    ),
  ).toBe(false);
  expect(await counts()).toEqual([]);
});
test("known bots, internal cookies and DNT/GPC signals are filtered without storing identity", async () => {
  for (const h of [
    { "user-agent": "Googlebot" },
    { "user-agent": "HeadlessChrome" },
    { dnt: "1" },
    { "sec-gpc": "1" },
    { cookie: "better-auth.session_token=fictional" },
  ]) {
    expect(await storePilotEvent(pool, new Headers(h), event())).toBe(false);
  }
  expect(await counts()).toEqual([]);
});
test("disabled/fixture/invalid-policy capture fails closed without changing canonical state", async () => {
  process.env.LONDOS_PILOT_ANALYTICS = "false";
  expect(
    renderPilotContext(
      context()?.context ?? {
        page: "mall",
        shopId: null,
        departmentId: null,
        productId: null,
        shops: [],
        resultCount: 0,
        globalDiscovery: true,
        channels: [],
      },
    ),
  ).toBeNull();
  expect(
    await storePilotEvent(pool, headers, {
      token: "invalid",
      event: "mall_visit",
      source: null,
      target: null,
      channel: null,
    }),
  ).toBe(false);
  process.env.LONDOS_PILOT_ANALYTICS = "true";
  process.env.LONDOS_DATA_SOURCE = "fixtures";
  expect(pilotPolicy().enabled).toBe(false);
  process.env.LONDOS_DATA_SOURCE = "database";
  process.env.LONDOS_PILOT_RETENTION_DAYS = "999";
  expect(pilotPolicy()).toMatchObject({ enabled: false, valid: false });
});
test("atomic budget failure rolls back receipt and counters; retries can succeed later", async () => {
  const c = context(),
    before = (await pool.query("SELECT count(*)::int AS n FROM pilot_receipts")).rows[0].n;
  await pool.query(
    "INSERT INTO request_budgets(key,window_id,count) VALUES('pilot:global',floor(extract(epoch FROM now())/60)::bigint,2000)",
  );
  await expect(storePilotEvent(pool, headers, event(c))).rejects.toMatchObject({ status: 429 });
  expect((await pool.query("SELECT count(*)::int AS n FROM pilot_receipts")).rows[0].n).toBe(
    before,
  );
  expect(await counts()).toEqual([]);
  await pool.query("DELETE FROM request_budgets WHERE key='pilot:global'");
  expect(await storePilotEvent(pool, headers, event(c))).toBe(true);
});
test("retention hides expired UTC-day totals immediately and cleanup deletes only eligible bounded analytics", async () => {
  await pool.query(
    "INSERT INTO pilot_metrics VALUES((clock_timestamp() AT TIME ZONE 'UTC')::date-30,$1,$2,'shop_viewed','direct','none',2),((clock_timestamp() AT TIME ZONE 'UTC')::date-29,$1,$2,'shop_viewed','direct','none',3)",
    [seedIds.shopA, seedIds.merchantA],
  );
  await pool.query(
    "INSERT INTO pilot_receipts VALUES($1,$2,clock_timestamp()-interval '1 second'),($3,$2,clock_timestamp()+interval '1 minute')",
    ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
  );
  expect(
    (await readShopPilot(pool, actors.ownerA!, seedIds.shopA, 90)).observations[0]?.count,
  ).toBe("3");
  const auditBefore = (await pool.query("SELECT count(*)::int AS n FROM audit_events")).rows[0].n;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    expect(await cleanupPilotMetrics(client)).toEqual({ receipts: 1, metrics: 1 });
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  expect((await pool.query("SELECT count(*)::int AS n FROM audit_events")).rows[0].n).toBe(
    auditBefore,
  );
  expect((await pool.query("SELECT count(*)::int AS n FROM pilot_receipts")).rows[0].n).toBe(1);
  process.env.LONDOS_PILOT_RETENTION_DAYS = "7";
  expect((await readShopPilot(pool, actors.ownerA!, seedIds.shopA, 30)).observations).toEqual([]);
});
test("foreign owners, constrained staff and existing operator grants/scopes cannot read shop/platform aggregates", async () => {
  for (const key of ["ownerB", "staff", "operator"]) {
    await expect(readShopPilot(pool, actors[key]!, seedIds.shopA)).rejects.toMatchObject({
      status: 404,
    });
  }
  await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='analytics'", [
    actors.operator!.userId,
  ]);
  await expect(readOperatorPilot(pool, actors.operator!)).rejects.toMatchObject({ status: 403 });
  await expect(readOperatorPilot(pool, actors.ownerA!)).rejects.toMatchObject({ status: 403 });
  await pool.query("INSERT INTO operator_grants VALUES($1,'analytics',now())", [
    actors.operator!.userId,
  ]);
});
test("shop aggregates never include another merchant's counters", async () => {
  await storePilotEvent(pool, headers, event());
  await pool.query(
    "INSERT INTO pilot_metrics VALUES(current_date,$1,$2,'shop_viewed','discovery','none',999)",
    [seedIds.shopB, seedIds.merchantB],
  );
  const own = await readShopPilot(pool, actors.ownerA!, seedIds.shopA);
  expect(own.observations).toEqual([
    { event: "shop_viewed", source: "direct", detail: "none", count: "1" },
  ]);
  const other = await readShopPilot(pool, actors.ownerB!, seedIds.shopB);
  expect(other.observations[0]?.count).toBe("999");
});
test("analytics table outage cannot roll back catalogue/publication; canonical counts reflect only successful commits", async () => {
  const before = await readShopPilot(pool, actors.ownerA!, seedIds.shopA),
    base = Number(before.canonical.find((r) => r.event === "merchant_publish")?.count ?? 0);
  await pool.query("ALTER TABLE pilot_metrics RENAME TO pilot_metrics_offline");
  try {
    await expect(storePilotEvent(pool, headers, event())).rejects.toMatchObject({ code: "42P01" });
    const p = await saveProduct(pool, actors.ownerA!, seedIds.shopA, null, {
      departmentId: department,
      kind: "product",
      name: "Fictional analytics catalogue",
      slug: `pilot-${randomUUID()}`,
      description: "",
      currency: "UGX",
      priceMinor: "5000",
      availability: "available",
      position: 1,
      mediaId: null,
      version: 0,
    });
    expect(p.version).toBe(1);
    const d = await readDesign(pool, actors.ownerA!, seedIds.shopA);
    await publishDesign(pool, actors.ownerA!, seedIds.shopA, {
      version: d.version,
      revision: d.revision!,
      confirm: true,
    });
    await expect(
      publishDesign(pool, actors.ownerA!, seedIds.shopA, {
        version: d.version,
        revision: d.revision!,
        confirm: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
  } finally {
    await pool.query("ALTER TABLE pilot_metrics_offline RENAME TO pilot_metrics");
  }
  const after = await readShopPilot(pool, actors.ownerA!, seedIds.shopA);
  expect(Number(after.canonical.find((r) => r.event === "merchant_publish")?.count)).toBe(base + 1);
  expect(after.canonical.find((r) => r.event === "merchant_catalogue_update")).toBeDefined();
});
test("revoked owner authority during a proven merchant-lock wait denies the aggregate read", async () => {
  await pool.query(
    "INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT DO NOTHING",
    [seedIds.merchantA, accounts.invitee.id],
  );
  const blocker = await pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [seedIds.merchantA]);
  const pending = readShopPilot(pool, actors.ownerA!, seedIds.shopA).then(
    () => null,
    (e) => e,
  );
  try {
    await waitForLock();
    await blocker.query(
      "UPDATE memberships SET permissions=ARRAY['catalogue'],role='staff' WHERE merchant_id=$1 AND user_id=$2",
      [seedIds.merchantA, actors.ownerA!.userId],
    );
    await blocker.query("COMMIT");
    expect(await pending).toMatchObject({ status: 404 });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await pool.query(
      "UPDATE memberships SET role='owner',permissions='{}' WHERE merchant_id=$1 AND user_id=$2",
      [seedIds.merchantA, actors.ownerA!.userId],
    );
  }
});
test("revoked analytics grant during a proven query-lock wait denies completed platform results", async () => {
  const blocker = await pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("LOCK TABLE pilot_metrics IN ACCESS EXCLUSIVE MODE");
  const pending = readOperatorPilot(pool, actors.operator!).then(
    () => null,
    (e) => e,
  );
  try {
    await waitForLock();
    await blocker.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='analytics'", [
      actors.operator!.userId,
    ]);
    await blocker.query("COMMIT");
    expect(await pending).toMatchObject({ status: 403 });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await pool.query(
      "INSERT INTO operator_grants VALUES($1,'analytics',now()) ON CONFLICT DO NOTHING",
      [actors.operator!.userId],
    );
  }
});
test("different page receipts accumulate without lost updates under concurrency", async () => {
  expect(
    (
      await Promise.all(Array.from({ length: 6 }, () => storePilotEvent(pool, headers, event())))
    ).filter(Boolean),
  ).toHaveLength(6);
  expect(await counts()).toEqual([
    { event: "shop_viewed", source: "direct", detail: "none", count: 6 },
  ]);
});
test("platform activation and renewals distinguish unpublished, actual payment, waiver and reversal", async () => {
  const app = randomUUID(),
    policy = (await pool.query("SELECT id FROM rent_policies ORDER BY id LIMIT 1")).rows[0].id;
  await pool.query(
    "INSERT INTO applications(id,merchant_id,applicant_id,state,policy_id,provisioned_shop_id) VALUES($1,$2,$3,'approved',$4,$5)",
    [app, seedIds.merchantA, actors.ownerA!.userId, policy, seedIds.shopA],
  );
  const design = await readDesign(pool, actors.ownerA!, seedIds.shopA);
  await publishDesign(pool, actors.ownerA!, seedIds.shopA, {
    version: design.version,
    revision: design.revision!,
    confirm: true,
  });
  const before = await readOperatorPilot(pool, actors.operator!);
  expect(before.activation).toEqual({ applications: "1", provisioned: "1" });
  // The application was created after the shop's historical first publication,
  // so that incompatible history must not be invented as a positive duration.
  expect(before.firstPublish).toEqual({ measured: "0", median_seconds: null });
  for (const mode of ["paid", "waiver", "reversed"]) {
    const id = randomUUID(),
      credit = randomUUID();
    await pool.query(
      "INSERT INTO invoices(id,merchant_id,application_id,shop_id,currency,amount_minor,period_start,period_end) VALUES($1,$2,$3,$4,'UGX',5000,clock_timestamp(),clock_timestamp()+interval '30 days')",
      [id, seedIds.merchantA, app, seedIds.shopA],
    );
    await pool.query(
      "INSERT INTO rent_invoice_state(invoice_id,reference,policy_id,kind,application_id) VALUES($1,$2,$3,'renewal',$4)",
      [id, `LON-${id.replaceAll("-", "").toUpperCase()}`, policy, app],
    );
    await pool.query(
      "INSERT INTO rent_events(id,invoice_id,merchant_id,currency,amount_minor,kind,source,source_reference,actor_id,reason) VALUES($1,$2,$3,'UGX',5000,$4,'local-manual',$5,$6,'Fictional analytics credit fixture')",
      [
        credit,
        id,
        seedIds.merchantA,
        mode === "waiver" ? "waiver" : "payment",
        randomUUID(),
        actors.operator!.userId,
      ],
    );
    await pool.query("UPDATE rent_invoice_state SET finalized=true WHERE invoice_id=$1", [id]);
    if (mode === "reversed") {
      const reversal = randomUUID();
      await pool.query(
        "INSERT INTO rent_events(id,invoice_id,merchant_id,currency,amount_minor,kind,source,source_reference,actor_id,reason) VALUES($1,$2,$3,'UGX',-5000,'adjustment','local-reversal',$4,$5,'Fictional analytics reversal fixture')",
        [reversal, id, seedIds.merchantA, credit, actors.operator!.userId],
      );
      await pool.query("INSERT INTO rent_reversals VALUES($1,$2,$3)", [credit, reversal, id]);
    }
  }
  const newShop = randomUUID(),
    cohortApp = randomUUID();
  await pool.query(
    "INSERT INTO shops(id,merchant_id,mall_id,name,slug) VALUES($1,$2,$3,'Fictional new pilot cohort',$4)",
    [newShop, seedIds.merchantA, seedIds.mallA, `pilot-cohort-${newShop}`],
  );
  await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [
    newShop,
  ]);
  await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [newShop]);
  await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [newShop]);
  await pool.query(
    "INSERT INTO applications(id,merchant_id,applicant_id,state,policy_id,provisioned_shop_id) VALUES($1,$2,$3,'approved',$4,$5)",
    [cohortApp, seedIds.merchantA, actors.ownerA!.userId, policy, newShop],
  );
  const saved = await saveDesign(pool, actors.ownerA!, newShop, {
    version: 0,
    summary: "Fictional first cohort publication",
    specification: { schemaVersion: 1, theme: "earth", announcement: "", spaces: [], actions: [] },
  });
  await publishDesign(pool, actors.ownerA!, newShop, { ...saved, confirm: true });
  const result = await readOperatorPilot(pool, actors.operator!);
  expect(result.activation).toEqual({ applications: "2", provisioned: "2" });
  expect(result.firstPublish.measured).toBe("1");
  expect(result.firstPublish.median_seconds).toBeGreaterThanOrEqual(0);
  expect(result.renewal).toEqual({ issued: "3", fully_paid: "1", waiver_supported: "1" });
  expect(JSON.stringify(result)).not.toContain(accounts.ownerA.email);
  expect(Object.keys(result.renewal)).toEqual(["issued", "fully_paid", "waiver_supported"]);
});
test("fresh native MFA aging during a proven query-lock wait denies platform results", async () => {
  const blocker = await pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("LOCK TABLE pilot_metrics IN ACCESS EXCLUSIVE MODE");
  const pending = readOperatorPilot(pool, actors.operator!).then(
    () => null,
    (e) => e,
  );
  try {
    await waitForLock();
    await blocker.query(
      "UPDATE mfa_proofs SET verified_at=now()-interval '6 minutes' WHERE session_id=$1",
      [actors.operator!.sessionId],
    );
    await blocker.query("COMMIT");
    expect(await pending).toMatchObject({ code: "fresh_authentication_required" });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
});

test("search quality retains only result buckets and invalid retention never deletes aggregate history", async () => {
  for (const resultCount of [0, 4, 20]) {
    await storePilotEvent(
      pool,
      headers,
      event(context({ page: "search", shopId: null, resultCount, channels: [] }), {
        event: "search_results_viewed",
        source: null,
      }),
    );
  }
  expect((await counts()).map((r) => r.detail)).toEqual(["empty", "few", "many"]);
  await pool.query(
    "INSERT INTO pilot_metrics VALUES(current_date-45,$1,$2,'shop_viewed','direct','none',1)",
    [seedIds.shopA, seedIds.merchantA],
  );
  process.env.LONDOS_PILOT_RETENTION_DAYS = "invalid";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    expect((await cleanupPilotMetrics(client)).metrics).toBe(0);
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM pilot_metrics WHERE day<current_date-30"))
      .rows[0].n,
  ).toBe(1);
});
