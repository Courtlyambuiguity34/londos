import { beforeAll, beforeEach, afterAll, test, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
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
  readOwnerCosts,
  readOperatorCosts,
  claimCostScope,
  readCostJournal,
  writeCostEntry,
} from "../../src/server/costs";
import { costCommand, costClaim, costWindow, costCursor } from "../../src/modules/costs/contract";
import { enqueue } from "../../src/server/jobs/enqueue";
import { replay } from "../../src/server/jobs/queue";
const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  auth: Auth,
  directory: string,
  accounts: SeedAccounts,
  merchant: string,
  shop: string,
  baseline: unknown;
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
    for (const c of r.headers.getSetCookie()) {
      const first = c.split(";")[0]!,
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
    application_name: "londos-cost-test",
  });
  directory = await mkdtemp(join(tmpdir(), "londos-costs-"));
  await migrate(pool, undefined, "015_local_privacy_governance.sql");
  auth = createAuth(pool, coreConfig(), true);
  accounts = await seed(pool, auth, directory);
  baseline = (await pool.query("SELECT * FROM shops ORDER BY id")).rows;
  await migrate(pool);
  await migrate(pool);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM operator_grants WHERE permission='costs'"))
      .rows[0].n,
  ).toBe(0);
  for (const key of ["ownerA", "ownerB", "staff", "operator"] as const) {
    const c = new Client();
    expect((await c.post("sign-in/email", accounts[key])).status).toBe(200);
    if (key === "operator") {
      const e = await c.post("two-factor/enable", { password: accounts[key].password });
      const secret = new URL((await e.json()).totpURI).searchParams.get("secret")!;
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
  const other = {
    email: `costs-test-${randomUUID()}@londos.example`,
    password: `Fictional-${randomUUID()}`,
  };
  const created = await auth.api.signUpEmail({
    body: { ...other, name: "Fictional independent costs operator" },
  });
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
  const c = new Client();
  expect((await c.post("sign-in/email", other)).status).toBe(200);
  const e = await c.post("two-factor/enable", { password: other.password });
  const secret = new URL((await e.json()).totpURI).searchParams.get("secret")!;
  expect(
    (
      await c.post("two-factor/verify-totp", {
        code: await generate({ secret }),
        trustDevice: false,
      })
    ).status,
  ).toBe(200);
  actors.other = await resolveActor(auth, c.headers());
});
beforeEach(async () => {
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'costs'),($2,'costs') ON CONFLICT DO NOTHING",
    [actors.operator!.userId, actors.other!.userId],
  );
  await pool.query(
    "UPDATE mfa_proofs SET verified_at=clock_timestamp() WHERE user_id=ANY($1::text[])",
    [[actors.operator!.userId, actors.other!.userId]],
  );
  merchant = randomUUID();
  shop = randomUUID();
  await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Fictional resource merchant')", [
    merchant,
  ]);
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    merchant,
    actors.ownerA!.userId,
  ]);
  await pool.query(
    "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category,tagline) SELECT $1,$2,mall_id,'Fictional resource shop',$3,'fashion','Fictional only' FROM shops WHERE id=$4",
    [shop, merchant, `costs-${shop}`, seedIds.shopA],
  );
});
afterAll(async () => {
  await pool?.end();
  await parent.query(`DROP DATABASE IF EXISTS ${name}`);
  await parent.end();
  await rm(directory, { recursive: true, force: true });
  process.env.DATABASE_URL = parentURL;
});
const day = (offset = 0) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
async function claim(actor = actors.operator!, id = shop) {
  return claimCostScope(pool, actor, id, {
    shopVersion: (await pool.query("SELECT version FROM shops WHERE id=$1", [id])).rows[0].version,
    reason: "Fictional resource reporting scope.",
    confirm: true,
  });
}
async function version(id = shop) {
  return (
    (await pool.query("SELECT version FROM shop_cost_state WHERE shop_id=$1", [id])).rows[0]
      ?.version ?? 0
  );
}
async function record(
  overrides: Partial<Extract<ReturnType<typeof costCommand.parse>, { action: "record" }>> = {},
  actor = actors.operator!,
  id = shop,
) {
  return writeCostEntry(pool, actor, id, {
    action: "record",
    key: randomUUID(),
    version: await version(id),
    category: "support",
    workDay: day(),
    minutes: 15,
    expenseMinor: 500,
    currency: "UGX",
    reason: "PRIVATE COST REPORTING SENTINEL fictional work.",
    confirm: true,
    ...overrides,
  });
}
async function reverse(id: string, overrides: Record<string, unknown> = {}) {
  return writeCostEntry(
    pool,
    actors.operator!,
    shop,
    costCommand.parse({
      action: "reverse",
      key: randomUUID(),
      version: await version(),
      originalId: id,
      reason: "Fictional correction of reported work.",
      confirm: true,
      ...overrides,
    }),
  );
}
async function waitFor(text: string) {
  const until = Date.now() + 4000;
  while (Date.now() < until) {
    if (
      (
        await pool.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid() AND query LIKE $1",
          [`%${text}%`],
        )
      ).rowCount
    )
      return;
    await setTimeout(20);
  }
  throw Error("Expected actual PostgreSQL lock wait was not observed");
}
test("015 to 016 is additive, repeatable and creates no historical measurements or implicit grants", async () => {
  expect(
    (
      await pool.query("SELECT * FROM shops WHERE id=ANY($1::uuid[]) ORDER BY id", [
        (baseline as { id: string }[]).map((s) => s.id),
      ])
    ).rows,
  ).toEqual((baseline as unknown[]).slice(0, 6));
  expect((await pool.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n).toBe(18);
  expect((await pool.query("SELECT count(*)::int AS n FROM resource_cost_entries")).rows[0].n).toBe(
    0,
  );
  expect(
    (
      await pool.query("SELECT count(*)::int AS n FROM operator_grants WHERE user_id=$1", [
        actors.other!.userId,
      ])
    ).rows[0].n,
  ).toBe(1);
});
test("strict reporting inputs reject forged attribution, noninteger/negative/zero units and unknown source fields", () => {
  const v = {
    action: "record",
    key: randomUUID(),
    version: 0,
    category: "support",
    workDay: day(),
    minutes: 15,
    expenseMinor: 500,
    currency: "UGX",
    reason: "Fictional reported work.",
    confirm: true,
  };
  for (const extra of [
    "actorId",
    "merchantId",
    "shopId",
    "provider",
    "measured",
    "hourlyRate",
    "bytes",
    "approval",
  ])
    expect(costCommand.safeParse({ ...v, [extra]: "FORGED" }).success).toBe(false);
  for (const bad of [
    { minutes: 1.5 },
    { expenseMinor: -1 },
    { currency: "USD" },
    { minutes: 481 },
    { expenseMinor: 1000000001 },
    { minutes: 0, expenseMinor: 0 },
    { workDay: "2026-02-30" },
    { confirm: false },
  ])
    expect(costCommand.safeParse({ ...v, ...bad }).success).toBe(false);
  expect(
    costClaim.safeParse({
      shopVersion: 1,
      reason: "Fictional scope.",
      confirm: true,
      userId: "forged",
    }).success,
  ).toBe(false);
  expect(costWindow.safeParse(365).success).toBe(false);
  expect(costCursor.safeParse("not-a-cursor").success).toBe(false);
});
test("fresh owner resource reads reject foreign owners, staff, ordinary operator and aged native sign-in", async () => {
  expect((await readOwnerCosts(pool, actors.ownerA!, shop)).shop.name).toBe(
    "Fictional resource shop",
  );
  for (const key of ["ownerB", "staff", "operator"])
    await expect(readOwnerCosts(pool, actors[key]!, shop)).rejects.toMatchObject({ status: 404 });
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query(
      "UPDATE session SET \"createdAt\"=clock_timestamp()-interval '6 minutes' WHERE id=$1",
      [actors.ownerA!.sessionId],
    );
    await blocker.query("COMMIT");
    await expect(readOwnerCosts(pool, actors.ownerA!, shop)).rejects.toMatchObject({ status: 403 });
  } finally {
    await pool.query('UPDATE session SET "createdAt"=clock_timestamp() WHERE id=$1', [
      actors.ownerA!.sessionId,
    ]);
    blocker.release();
  }
});
test("logical media lengths and reserved quota are exact snapshots without byte payloads or keys", async () => {
  const asset = randomUUID(),
    bytes = Buffer.from("PRIVATE MEDIA BYTE SENTINEL");
  await pool.query(
    "INSERT INTO media_assets(id,shop_id,merchant_id,state,storage_key,created_by,byte_count,reserved_bytes) VALUES($1,$2,$3,'ready','PRIVATE_STORAGE_KEY',$4,$5,123)",
    [asset, shop, merchant, actors.ownerA!.userId, bytes.length + 4],
  );
  await pool.query(
    "INSERT INTO media_blobs(asset_id,variant,bytes) VALUES($1,'source',$2),($1,'display',$3)",
    [asset, bytes, Buffer.from("1234")],
  );
  await pool.query(
    "INSERT INTO media_quotas(shop_id,asset_count,stored_bytes,reserved_bytes) VALUES($1,1,$2,123)",
    [shop, bytes.length + 4],
  );
  const data = await readOwnerCosts(pool, actors.ownerA!, shop);
  expect(data.resource.blobs).toEqual([
    { variant: "display", count: "1", bytes: "4" },
    { variant: "source", count: "1", bytes: String(bytes.length) },
  ]);
  expect(data.resource.quota).toEqual({
    asset_count: 1,
    stored_bytes: String(bytes.length + 4),
    reserved_bytes: "123",
  });
  expect(JSON.stringify(data)).not.toContain("PRIVATE MEDIA");
  expect(JSON.stringify(data)).not.toContain("PRIVATE_STORAGE_KEY");
});
test("queue attribution separates shop, shared merchant and platform rows and never reveals payloads", async () => {
  for (const scope of ["shop", "merchant", "platform"]) {
    const id = await enqueue(pool, {
      kind: "notification.local",
      key: randomUUID(),
      payload: { private: "PRIVATE JOB PAYLOAD" },
      ...(scope !== "platform" ? { merchantId: merchant } : {}),
      ...(scope === "shop" ? { shopId: shop } : {}),
    });
    await pool.query("UPDATE jobs SET attempts=3 WHERE id=$1", [id]);
  }
  const owner = await readOwnerCosts(pool, actors.ownerA!, shop);
  expect(owner.resource.jobs).toEqual([{ state: "pending", count: "1", attempt_counter_sum: "3" }]);
  const op = await readOperatorCosts(pool, actors.operator!);
  for (const scope of ["shop-bound", "merchant-shared", "platform-shared"])
    expect(op.jobs.some((j) => j.scope === scope && Number(j.count) >= 1)).toBe(true);
  expect(JSON.stringify([owner, op])).not.toContain("PRIVATE JOB PAYLOAD");
});
test("replayed queue counters are current counters and do not pretend to be lifetime execution or CPU cost", async () => {
  const id = await enqueue(pool, {
    kind: "unsupported",
    key: randomUUID(),
    shopId: shop,
    merchantId: merchant,
    payload: {},
  });
  await pool.query("UPDATE jobs SET state='dead',attempts=5 WHERE id=$1", [id]);
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'jobs') ON CONFLICT DO NOTHING",
    [actors.operator!.userId],
  );
  expect(
    (await readOwnerCosts(pool, actors.ownerA!, shop)).resource.jobs[0]!.attempt_counter_sum,
  ).toBe("5");
  await replay(pool, actors.operator!, id!);
  const result = await readOwnerCosts(pool, actors.ownerA!, shop);
  expect(result.resource.jobs[0]!.attempt_counter_sum).toBe("0");
  expect(result.limits.jobs).toContain("not lifetime executions");
});
test("missing sources and absent work logs are unavailable rather than falsely free operation", async () => {
  const r = await readOwnerCosts(pool, actors.ownerA!, shop);
  expect(r.reported).toEqual([]);
  expect(r.unavailable.map((u) => u.source)).toEqual([
    "bandwidth",
    "AI usage and charges",
    "compute and storage charges",
    "independently measured staff time",
    "live rent collection fees",
  ]);
  expect(r.unavailable.every((u) => u.reason.length > 10)).toBe(true);
});
test("costs permission, claimed scope and self-conflict are independent of all prior workflow grants", async () => {
  await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='costs'", [
    actors.operator!.userId,
  ]);
  await expect(readOperatorCosts(pool, actors.operator!)).rejects.toMatchObject({ status: 403 });
  await pool.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'costs')", [
    actors.operator!.userId,
  ]);
  await expect(readCostJournal(pool, actors.operator!, shop)).rejects.toMatchObject({
    status: 404,
  });
  await claim();
  expect((await readCostJournal(pool, actors.operator!, shop)).version).toBe(0);
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'staff')", [
    merchant,
    actors.operator!.userId,
  ]);
  await expect(readCostJournal(pool, actors.operator!, shop)).rejects.toMatchObject({
    code: "conflict_of_interest",
  });
  await expect(claim()).rejects.toMatchObject({ code: "conflict_of_interest" });
});
test("scope claim compares current shop version and repeats without modifying canonical state", async () => {
  await expect(
    claimCostScope(pool, actors.operator!, shop, {
      shopVersion: 99,
      reason: "Fictional scope.",
      confirm: true,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await Promise.all([claim(), claim(), claim()]);
  expect(
    (
      await pool.query("SELECT count(*)::int AS n FROM operator_cost_scopes WHERE shop_id=$1", [
        shop,
      ])
    ).rows[0].n,
  ).toBe(1);
  expect((await pool.query("SELECT version FROM shops WHERE id=$1", [shop])).rows[0].version).toBe(
    1,
  );
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_events WHERE action='cost.scope.claimed' AND resource_id=$1",
        [shop],
      )
    ).rows[0].n,
  ).toBe(1);
});
test("reported minutes and exact UGX expenses remain separate, categorized and owner-redacted", async () => {
  await claim();
  await record();
  await record({ category: "verification", minutes: 30, expenseMinor: 0 });
  await record({ category: "rent_collection", minutes: 0, expenseMinor: 1000 });
  const owner = await readOwnerCosts(pool, actors.ownerA!, shop);
  expect(owner.reported).toEqual([
    {
      category: "rent_collection",
      recorded_entries: "1",
      corrections: "0",
      net_minutes: "0",
      net_expense_minor: "1000",
    },
    {
      category: "support",
      recorded_entries: "1",
      corrections: "0",
      net_minutes: "15",
      net_expense_minor: "500",
    },
    {
      category: "verification",
      recorded_entries: "1",
      corrections: "0",
      net_minutes: "30",
      net_expense_minor: "0",
    },
  ]);
  expect(JSON.stringify(owner)).not.toContain("PRIVATE COST REPORTING SENTINEL");
  expect(JSON.stringify(owner)).not.toContain(actors.operator!.userId);
  expect((await readCostJournal(pool, actors.operator!, shop)).entries[0]!.reason).toContain(
    "PRIVATE COST",
  );
  expect(
    (
      await pool.query(
        "SELECT details FROM audit_events WHERE action='cost.reported.recorded' AND merchant_id=$1",
        [merchant],
      )
    ).rows.every((r) => Object.keys(r.details).join(",") === "category"),
  ).toBe(true);
});
test("unchanged concurrent retries produce one entry, version increment and audit; changed payload and shop retries conflict", async () => {
  await claim();
  const key = randomUUID(),
    result = await Promise.all(Array.from({ length: 8 }, () => record({ key, version: 0 })));
  expect(new Set(result.map((r) => r.id)).size).toBe(1);
  expect(await version()).toBe(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_events WHERE action='cost.reported.recorded' AND merchant_id=$1",
        [merchant],
      )
    ).rows[0].n,
  ).toBe(1);
  await expect(record({ key, version: 0, minutes: 16 })).rejects.toMatchObject({
    code: "retry_payload_changed",
  });
  await claim(actors.operator!, seedIds.shopB);
  await expect(record({ key, version: 0 }, actors.operator!, seedIds.shopB)).rejects.toMatchObject({
    code: "retry_payload_changed",
  });
});
test("concurrent distinct journal writes compare versions and preserve the losing request for a fresh retry", async () => {
  await claim();
  const results = await Promise.allSettled([record({ version: 0 }), record({ version: 0 })]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(await version()).toBe(1);
  await record();
  expect(await version()).toBe(2);
});
test("correction appends the exact original units once and preserves immutable original history", async () => {
  await claim();
  const e = await record(),
    key = randomUUID();
  const results = await Promise.all([
    reverse(e.id, { key, version: 1 }),
    reverse(e.id, { key, version: 1 }),
  ]);
  expect(results[0]!.id).toBe(results[1]!.id);
  expect((await readOwnerCosts(pool, actors.ownerA!, shop)).reported).toEqual([
    {
      category: "support",
      recorded_entries: "1",
      corrections: "1",
      net_minutes: "0",
      net_expense_minor: "0",
    },
  ]);
  await expect(reverse(e.id)).rejects.toMatchObject({ code: "cost_entry_already_reversed" });
  await expect(reverse(results[0]!.id)).rejects.toMatchObject({
    code: "cost_entry_already_reversed",
  });
  await expect(
    pool.query("UPDATE resource_cost_entries SET minutes=1 WHERE id=$1", [e.id]),
  ).rejects.toThrow();
  await expect(
    pool.query("DELETE FROM resource_cost_entries WHERE id=$1", [e.id]),
  ).rejects.toThrow();
});
test("two differently keyed simultaneous corrections cannot over-cancel the original", async () => {
  await claim();
  const e = await record(),
    r = await Promise.allSettled([reverse(e.id, { version: 1 }), reverse(e.id, { version: 1 })]);
  expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect((await readOwnerCosts(pool, actors.ownerA!, shop)).reported[0]!.net_minutes).toBe("0");
});
test("foreign and mismatched corrections/scopes fail tenant-consistent constraints", async () => {
  await claim();
  await claim(actors.operator!, seedIds.shopB);
  const e = await record({}, actors.operator!, seedIds.shopB);
  await expect(reverse(e.id)).rejects.toMatchObject({ status: 404 });
  await expect(
    pool.query("INSERT INTO operator_cost_scopes(user_id,shop_id,merchant_id) VALUES($1,$2,$3)", [
      actors.other!.userId,
      shop,
      seedIds.merchantB,
    ]),
  ).rejects.toThrow();
  await expect(
    pool.query(
      "INSERT INTO resource_cost_entries(id,merchant_id,shop_id,actor_id,request_key,fingerprint,category,work_day,minutes,currency,expense_minor,reason,reverses_id) VALUES($1,$2,$3,$4,$5,$6,'support',current_date,-1,'UGX',-1,'Fictional mismatched reversal.',$7)",
      [randomUUID(), merchant, shop, actors.operator!.userId, randomUUID(), "b".repeat(64), e.id],
    ),
  ).rejects.toThrow();
});
test("SQL rejects fabricated reversal quantities or categories independently of the application", async () => {
  await claim();
  const e = await record();
  await expect(
    pool.query(
      "INSERT INTO resource_cost_entries(id,merchant_id,shop_id,actor_id,request_key,fingerprint,category,work_day,minutes,currency,expense_minor,reason,reverses_id) VALUES($1,$2,$3,$4,$5,$6,'support',current_date,-1,'UGX',-1,'Fictional incorrect reversal.',$7)",
      [randomUUID(), merchant, shop, actors.operator!.userId, randomUUID(), "b".repeat(64), e.id],
    ),
  ).rejects.toThrow("exactly reverse");
});
test("work dates reject future/too-old records and UTC windows include exactly their original work day", async () => {
  await claim();
  await expect(record({ workDay: day(-1) })).rejects.toMatchObject({
    code: "work_day_outside_window",
  });
  await expect(record({ workDay: day(90) })).rejects.toMatchObject({
    code: "work_day_outside_window",
  });
  await record({ workDay: day(6), minutes: 1, expenseMinor: 0 });
  await record({ workDay: day(7), minutes: 2, expenseMinor: 0 });
  await record({ workDay: day(89), minutes: 4, expenseMinor: 0 });
  expect((await readOwnerCosts(pool, actors.ownerA!, shop, 7)).reported[0]!.net_minutes).toBe("1");
  expect((await readOwnerCosts(pool, actors.ownerA!, shop, 30)).reported[0]!.net_minutes).toBe("3");
  expect((await readOwnerCosts(pool, actors.ownerA!, shop, 90)).reported[0]!.net_minutes).toBe("7");
});
test("later correction is attributed to the original day instead of subtracting unrelated current work", async () => {
  await claim();
  const older = await record({ workDay: day(8), minutes: 30, expenseMinor: 2000 });
  await record({ minutes: 5, expenseMinor: 100 });
  await reverse(older.id);
  expect((await readOwnerCosts(pool, actors.ownerA!, shop, 7)).reported[0]!.net_minutes).toBe("5");
  expect(
    (await readOwnerCosts(pool, actors.ownerA!, shop, 30)).reported[0]!.net_expense_minor,
  ).toBe("100");
});
test("private journal and operator shop selection use bounded UUID cursors without duplicates", async () => {
  await claim();
  for (let i = 0; i < 23; i++) await record({ minutes: 1, expenseMinor: 0 });
  const first = await readCostJournal(pool, actors.operator!, shop),
    next = await readCostJournal(pool, actors.operator!, shop, 30, first.nextAfter);
  expect(first.entries).toHaveLength(20);
  expect(next.entries).toHaveLength(3);
  expect(new Set([...first.entries, ...next.entries].map((e) => e.id)).size).toBe(23);
  expect(next.nextAfter).toBeNull();
  const op = await readOperatorCosts(pool, actors.operator!);
  expect(op.shops.length).toBeLessThanOrEqual(20);
  expect(op.nextAfter).not.toBeNull();
  expect(
    (await readOperatorCosts(pool, actors.operator!, 30, op.nextAfter)).shops.every(
      (s) => s.id > op.nextAfter!,
    ),
  ).toBe(true);
});
test("cost journal writes and corrections never change canonical financial, shop or privacy state", async () => {
  const before = (await pool.query("SELECT * FROM shops WHERE id=$1", [shop])).rows;
  const counts = async () => {
    const r: Record<string, string> = {};
    for (const table of [
      "invoices",
      "rent_events",
      "tenancies",
      "shop_publication",
      "shop_moderation",
      "privacy_holds",
      "shop_privacy_exclusions",
    ])
      r[table] = (await pool.query(`SELECT count(*)::text AS n FROM ${table}`)).rows[0].n;
    return r;
  };
  const original = await counts();
  await claim();
  const entry = await record({
    category: "rent_collection",
    minutes: 60,
    expenseMinor: 1000000000,
  });
  await reverse(entry.id);
  expect((await pool.query("SELECT * FROM shops WHERE id=$1", [shop])).rows).toEqual(before);
  expect(await counts()).toEqual(original);
});
test("actual journal storage failure rolls back entry/version/audit and retry succeeds after restoration", async () => {
  await claim();
  await pool.query(
    "CREATE FUNCTION fail_cost_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional cost store failure'; END $$",
  );
  await pool.query(
    "CREATE TRIGGER fail_cost_test BEFORE INSERT ON resource_cost_entries FOR EACH ROW EXECUTE FUNCTION fail_cost_test()",
  );
  const key = randomUUID();
  try {
    await expect(record({ key, version: 0 })).rejects.toThrow("Fictional cost store failure");
    expect(await version()).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE action='cost.reported.recorded' AND merchant_id=$1",
          [merchant],
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await pool.query("DROP TRIGGER fail_cost_test ON resource_cost_entries");
    await pool.query("DROP FUNCTION fail_cost_test()");
  }
  await record({ key, version: 0 });
  expect(await version()).toBe(1);
});
test("report query failure does not modify canonical writes or existing queue state", async () => {
  await pool.query("ALTER TABLE resource_cost_entries RENAME TO cost_entries_unavailable");
  try {
    await expect(readOwnerCosts(pool, actors.ownerA!, shop)).rejects.toThrow();
    await pool.query(
      "UPDATE shops SET tagline='Fictional update during reporting outage',version=version+1 WHERE id=$1",
      [shop],
    );
    const job = await enqueue(pool, {
      kind: "notification.local",
      key: randomUUID(),
      payload: {},
      shopId: shop,
      merchantId: merchant,
    });
    expect(job).toBeTruthy();
  } finally {
    await pool.query("ALTER TABLE cost_entries_unavailable RENAME TO resource_cost_entries");
  }
  expect((await readOwnerCosts(pool, actors.ownerA!, shop)).shop.name).toBe(
    "Fictional resource shop",
  );
});
test("revoked owner after a proven merchant lock wait cannot receive resource aggregates", async () => {
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    merchant,
    actors.staff!.userId,
  ]);
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchant]);
    const pending = readOwnerCosts(pool, actors.ownerA!, shop);
    const rejected = expect(pending).rejects.toMatchObject({ status: 404 });
    await waitFor("merchants");
    await blocker.query(
      "UPDATE memberships SET status='revoked' WHERE merchant_id=$1 AND user_id=$2",
      [merchant, actors.ownerA!.userId],
    );
    await blocker.query("COMMIT");
    await rejected;
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
});
test("revoked costs grant during a proven journal lock wait prevents any new entry", async () => {
  await claim();
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchant]);
    const pending = record(),
      rejected = expect(pending).rejects.toMatchObject({ status: 403 });
    await waitFor("merchants");
    await blocker.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='costs'", [
      actors.operator!.userId,
    ]);
    await blocker.query("COMMIT");
    await rejected;
    expect(
      (
        await pool.query("SELECT count(*)::int AS n FROM resource_cost_entries WHERE shop_id=$1", [
          shop,
        ])
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
});
test("revoked cost scope and aged native MFA across proven merchant/user waits prevent reporting", async () => {
  await claim();
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchant]);
    const pending = record(),
      rejected = expect(pending).rejects.toMatchObject({ status: 404 });
    await waitFor("merchants");
    await blocker.query("DELETE FROM operator_cost_scopes WHERE shop_id=$1 AND user_id=$2", [
      shop,
      actors.operator!.userId,
    ]);
    await blocker.query("COMMIT");
    await rejected;
    await claim();
    await blocker.query("BEGIN");
    await blocker.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [actors.operator!.userId]);
    const next = record(),
      denied = expect(next).rejects.toMatchObject({ status: 403 });
    await waitFor('SELECT id FROM "user"');
    await blocker.query(
      "UPDATE mfa_proofs SET verified_at=clock_timestamp()-interval '6 minutes' WHERE session_id=$1",
      [actors.operator!.sessionId],
    );
    await blocker.query("COMMIT");
    await denied;
    expect(await version()).toBe(0);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
});
test("platform aggregates recheck current grant after a proven query wait", async () => {
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("LOCK media_blobs IN ACCESS EXCLUSIVE MODE");
    const pending = readOperatorCosts(pool, actors.operator!),
      denied = expect(pending).rejects.toMatchObject({ status: 403 });
    await waitFor("FROM media_blobs");
    await blocker.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='costs'", [
      actors.operator!.userId,
    ]);
    await blocker.query("COMMIT");
    await denied;
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
});
test("platform private evidence volume is aggregate-only and is absent from owner shop reporting", async () => {
  const application = randomUUID(),
    bytes = Buffer.from("PRIVATE APPLICATION EVIDENCE BYTE SENTINEL");
  await pool.query(
    "INSERT INTO applications(id,merchant_id,applicant_id,state,business_name) VALUES($1,$2,$3,'draft','PRIVATE APPLICATION NAME')",
    [application, merchant, actors.ownerA!.userId],
  );
  await pool.query(
    "INSERT INTO application_evidence(application_id,merchant_id,slot,bytes,digest,created_by) VALUES($1,$2,1,$3,$4,$5)",
    [application, merchant, bytes, "a".repeat(64), actors.ownerA!.userId],
  );
  const owner = await readOwnerCosts(pool, actors.ownerA!, shop),
    operator = await readOperatorCosts(pool, actors.operator!);
  expect("evidence" in owner).toBe(false);
  expect(owner.resource.blobs).toEqual([]);
  expect(operator.evidence.find((e) => e.category === "application")!.bytes).toBe(
    String(bytes.length),
  );
  for (const value of [JSON.stringify(owner), JSON.stringify(operator)]) {
    expect(value).not.toContain("PRIVATE APPLICATION");
    expect(value).not.toContain(application);
  }
});
test("daily original reporting limit leaves exact corrections available without adding new fictional expense", async () => {
  await claim();
  const entries = await pool.query(
    "INSERT INTO resource_cost_entries(id,merchant_id,shop_id,actor_id,request_key,fingerprint,category,work_day,minutes,currency,expense_minor,reason,created_at) SELECT gen_random_uuid(),$1,$2,$3,gen_random_uuid(),$4,'support',(clock_timestamp() AT TIME ZONE 'UTC')::date,1,'UGX',0,'Fictional bounded reporting fixture.',((clock_timestamp() AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'UTC') FROM generate_series(1,100) RETURNING id",
    [merchant, shop, actors.operator!.userId, "a".repeat(64)],
  );
  await expect(record()).rejects.toMatchObject({ code: "daily_reporting_limit" });
  const timezonePool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: "-c timezone=Pacific/Honolulu",
    max: 1,
  });
  try {
    await expect(
      writeCostEntry(timezonePool, actors.operator!, shop, {
        action: "record",
        key: randomUUID(),
        version: await version(),
        category: "support",
        workDay: day(),
        minutes: 1,
        expenseMinor: 0,
        currency: "UGX",
        reason: "Fictional UTC boundary check in a non-UTC database session.",
        confirm: true,
      }),
    ).rejects.toMatchObject({ code: "daily_reporting_limit" });
  } finally {
    await timezonePool.end();
  }
  await reverse(entries.rows[0].id);
  expect((await readOwnerCosts(pool, actors.ownerA!, shop)).reported[0]!.net_minutes).toBe("99");
});
