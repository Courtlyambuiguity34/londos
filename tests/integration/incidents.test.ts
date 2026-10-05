import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { Pool } from "pg";
import { generate } from "otplib";
import { migrate } from "../../src/server/db/migrate";
import { seed, seedIds, type SeedAccounts } from "../../src/server/db/seed";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { coreConfig } from "../../src/server/config";
import { createAuth, type Auth } from "../../src/server/security/auth";
import { resolveActor, requireShop, type Actor } from "../../src/server/security/authorization";
import { saveContacts, readContacts } from "../../src/server/contacts";
import {
  createIncident,
  claimIncident,
  commandIncident,
  ownerIncidentCommand,
  readOperatorIncident,
  readOwnerIncident,
  incidentQueue,
  ownerIncidents,
  incidentInput,
  incidentCommandInput,
} from "../../src/server/incidents";
import { LocalNotifications, LocalPrivateStorage } from "../../src/server/jobs/adapters";
const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool, auth: Auth, directory: string, accounts: SeedAccounts, baseline: unknown;
const actors: Record<string, Actor> = {},
  clients: Record<string, Client> = {};
class Client {
  cookies = new Map<string, string>();
  constructor(readonly authentication: Auth = auth) {}
  headers() {
    return new Headers({
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      origin: coreConfig().baseURL,
      "content-type": "application/json",
    });
  }
  async request(path: string, body: unknown) {
    const r = await this.authentication.handler(
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
async function login(key: string, account: { email: string; password: string }, mfa = false) {
  const c = new Client();
  expect((await c.request("sign-in/email", account)).status).toBe(200);
  if (mfa) {
    const enabled = await c.request("two-factor/enable", { password: account.password });
    expect(enabled.status).toBe(200);
    const secret = new URL((await enabled.json()).totpURI).searchParams.get("secret")!;
    expect(
      (
        await c.request("two-factor/verify-totp", {
          code: await generate({ secret }),
          trustDevice: false,
        })
      ).status,
    ).toBe(200);
  }
  actors[key] = await resolveActor(auth, c.headers());
  clients[key] = c;
}
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  pool = new Pool({ connectionString: url.toString(), max: 12 });
  directory = await mkdtemp(join(tmpdir(), "londos-incidents-"));
  await migrate(pool, undefined, "012_local_reporting_and_trust.sql");
  auth = createAuth(pool, coreConfig(), true);
  accounts = await seed(pool, auth, directory);
  await pool.query(
    "INSERT INTO shop_contacts(shop_id,merchant_id,version,phone,whatsapp,website,fulfilment,payment_instructions,delivery_instructions,enquiries_enabled) VALUES($1,$2,1,'+256700000001','','','contact','Fictional baseline','','false')",
    [seedIds.shopA, seedIds.merchantA],
  );
  baseline = (await pool.query("SELECT * FROM shop_contacts ORDER BY shop_id")).rows;
  await migrate(pool);
  await migrate(pool);
  for (const key of ["ownerA", "ownerB", "staff", "operator", "invitee"] as const)
    await login(key, accounts[key], key === "operator" || key === "invitee");
  const second = {
      email: `incident-${randomUUID()}@londos.example`,
      password: `Incident-${randomUUID()}`,
    },
    created = await auth.api.signUpEmail({
      body: { ...second, name: "Fictional second recovery reviewer" },
    });
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
  await login("second", second, true);
});
afterAll(async () => {
  await pool?.end();
  const deadline = Date.now() + 2000;
  while (
    (await parent.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1", [name])).rowCount &&
    Date.now() < deadline
  )
    await setTimeout(20);
  await parent.query(`DROP DATABASE IF EXISTS ${name}`);
  await parent.end();
  await rm(directory, { recursive: true, force: true });
  process.env.DATABASE_URL = parentURL;
});
async function shop() {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO shops(id,merchant_id,mall_id,name,slug) VALUES($1,$2,$3,'Fictional incident shop',$4)",
    [id, seedIds.merchantA, seedIds.mallA, `incident-${id}`],
  );
  await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [id]);
  await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [id]);
  await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'suspended')", [id]);
  return id;
}
async function contact(shopId: string, payment = "Original fictional instructions") {
  const old = await readContacts(pool, actors.ownerA!, shopId);
  return saveContacts(pool, actors.ownerA!, shopId, {
    version: old.version,
    phone: "+256700000010",
    whatsapp: "",
    website: "",
    fulfilment: "contact",
    paymentInstructions: payment,
    deliveryInstructions: "",
    enquiriesEnabled: false,
    reason: "Fictional contact update",
  });
}
async function request(
  shopId: string,
  kind:
    | "support"
    | "security"
    | "account_recovery"
    | "contact_change"
    | "fraud"
    | "payment_exception"
    | "verification" = "support",
) {
  const revision = (await readContacts(pool, actors.ownerA!, shopId)).version;
  return createIncident(pool, actors.ownerA!, shopId, {
    key: randomUUID(),
    kind,
    message: "PRIVATE-OWNER-REPORT fictional investigation requested",
    contactVersion: kind === "contact_change" ? revision : null,
    requestedRevision: kind === "contact_change" ? 1 : null,
    confirm: true,
  });
}
async function claim(id: string, actor = actors.operator!) {
  const row = (await pool.query("SELECT version FROM incident_cases WHERE id=$1", [id])).rows[0];
  return claimIncident(pool, actor, id, {
    version: row.version,
    reason: "Fictional responsibility assignment",
    confirm: true,
  });
}
async function command(
  id: string,
  action: "note" | "escalate" | "resolve" | "contain_sessions" | "restore_contacts",
  actor = actors.operator!,
) {
  const row = await readOperatorIncident(pool, actor, id);
  return commandIncident(pool, actor, id, {
    version: row.case.version,
    action,
    priority: 2,
    reason: "PRIVATE-INVESTIGATION fictional reason",
    publicReason: "Fictional incident response for the shop owner.",
    confirm: true,
  });
}
async function approve(shopId: string, id: string) {
  const view = await readOwnerIncident(pool, actors.ownerA!, shopId, id);
  return ownerIncidentCommand(pool, actors.ownerA!, shopId, id, {
    version: view.case.version,
    action: "confirm_restore",
    contactVersion: view.contactVersion,
    reason: "I confirm the exact historical fictional contact content",
    confirm: true,
  });
}
async function prepared() {
  const s = await shop();
  await contact(s);
  await contact(s, "Unexpected fictional payment instruction");
  const { id } = await request(s, "contact_change");
  await claim(id);
  return { s, id };
}

test("upgrade backfills immutable contact baseline and preserves canonical state/default privileges", async () => {
  expect((await pool.query("SELECT * FROM shop_contacts ORDER BY shop_id")).rows).toEqual(baseline);
  expect(
    (
      await pool.query(
        "SELECT version,payment_instructions FROM shop_contact_history WHERE shop_id=$1",
        [seedIds.shopA],
      )
    ).rows,
  ).toEqual([{ version: 1, payment_instructions: "Fictional baseline" }]);
  expect(
    (await pool.query("SELECT 1 FROM operator_grants WHERE permission IN ('support','recovery')"))
      .rowCount,
  ).toBe(0);
  await expect(
    pool.query("UPDATE shop_contact_history SET phone='changed' WHERE shop_id=$1", [seedIds.shopA]),
  ).rejects.toThrow();
  await expect(
    pool.query("DELETE FROM shop_contact_history WHERE shop_id=$1", [seedIds.shopA]),
  ).rejects.toThrow();
  await expect(
    pool.query("UPDATE shop_contacts SET phone='+256700000099' WHERE shop_id=$1", [seedIds.shopA]),
  ).rejects.toMatchObject({ code: "23505" });
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'recovery'),($1,'support'),($1,'moderation'),($1,'finance'),($2,'recovery'),($3,'support')",
    [actors.operator!.userId, actors.second!.userId, actors.invitee!.userId],
  );
});
test("strict schemas and fresh owner boundaries reject forged identities, credentials, foreign shops and staff", async () => {
  const s = await shop(),
    v = {
      key: randomUUID(),
      kind: "support" as const,
      message: "Fictional owner incident",
      contactVersion: null,
      requestedRevision: null,
      confirm: true as const,
    };
  expect(incidentInput.safeParse({ ...v, reporterId: actors.ownerB!.userId }).success).toBe(false);
  expect(
    incidentCommandInput.safeParse({
      version: 1,
      action: "reset_password",
      priority: 0,
      reason: "Fictional reason",
      publicReason: "Fictional reply",
      confirm: true,
    }).success,
  ).toBe(false);
  await expect(createIncident(pool, actors.ownerB!, s, v)).rejects.toMatchObject({ status: 404 });
  await expect(createIncident(pool, actors.staff!, s, v)).rejects.toMatchObject({ status: 404 });
  await pool.query("UPDATE session SET \"createdAt\"=now()-interval '6 minutes' WHERE id=$1", [
    actors.ownerA!.sessionId,
  ]);
  try {
    await expect(createIncident(pool, actors.ownerA!, s, v)).rejects.toMatchObject({ status: 403 });
  } finally {
    await pool.query('UPDATE session SET "createdAt"=now() WHERE id=$1', [
      actors.ownerA!.sessionId,
    ]);
  }
  expect((await pool.query("SELECT 1 FROM incident_cases WHERE shop_id=$1", [s])).rowCount).toBe(0);
});
test("real retry races create one immutable owner request; changed payload conflicts", async () => {
  const s = await shop(),
    v = {
      key: randomUUID(),
      kind: "support" as const,
      message: "Fictional owner incident",
      contactVersion: null,
      requestedRevision: null,
      confirm: true as const,
    };
  const results = await Promise.all([
    createIncident(pool, actors.ownerA!, s, v),
    createIncident(pool, actors.ownerA!, s, v),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(
    (await pool.query("SELECT 1 FROM incident_events WHERE case_id=$1", [v.key])).rowCount,
  ).toBe(1);
  await expect(
    createIncident(pool, actors.ownerA!, s, { ...v, message: "Changed fictional incident" }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    pool.query("UPDATE incident_cases SET message='Overwritten report' WHERE id=$1", [v.key]),
  ).rejects.toThrow();
  await expect(
    pool.query("DELETE FROM incident_events WHERE case_id=$1", [v.key]),
  ).rejects.toThrow();
});
test("queues filter all seven categories by grant; ordinary scopes and unclaimed reviewers reveal no private report", async () => {
  const s = await shop();
  await contact(s);
  await contact(s);
  const ids = [];
  for (const k of [
    "security",
    "account_recovery",
    "contact_change",
    "fraud",
    "payment_exception",
    "verification",
    "support",
  ] as const)
    ids.push((await request(s, k)).id);
  const support = await incidentQueue(pool, actors.invitee!);
  expect(support.every((c) => c.kind === "support")).toBe(true);
  expect(JSON.stringify(support)).not.toContain("PRIVATE-OWNER-REPORT");
  const recovery = await incidentQueue(pool, actors.second!);
  expect(
    recovery.every((c) => ["security", "account_recovery", "contact_change"].includes(c.kind)),
  ).toBe(true);
  await pool.query("INSERT INTO operator_shop_scopes(user_id,shop_id) VALUES($1,$2)", [
    actors.operator!.userId,
    s,
  ]);
  await expect(readOperatorIncident(pool, actors.operator!, ids[0]!)).rejects.toMatchObject({
    status: 404,
  });
  await expect(claim(ids[0]!, actors.invitee!)).rejects.toMatchObject({ status: 403 });
  await claim(ids[0]!);
  await expect(readOperatorIncident(pool, actors.second!, ids[0]!)).rejects.toMatchObject({
    status: 404,
  });
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'recovery') ON CONFLICT DO NOTHING",
    [actors.ownerA!.userId],
  );
  await expect(claim(ids[0]!, actors.ownerA!)).rejects.toMatchObject({ status: 403 });
  await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='recovery'", [
    actors.ownerA!.userId,
  ]);
});
test("concurrent assignments have one responsible reviewer and enforce current assignment", async () => {
  const s = await shop(),
    { id } = await request(s, "security");
  const v = { version: 1, reason: "Fictional race assignment", confirm: true as const };
  const results = await Promise.allSettled([
    claimIncident(pool, actors.operator!, id, v),
    claimIncident(pool, actors.second!, id, v),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const assigned = (await pool.query("SELECT assigned_user FROM incident_cases WHERE id=$1", [id]))
    .rows[0].assigned_user;
  const other = assigned === actors.operator!.userId ? actors.second! : actors.operator!;
  await expect(readOperatorIncident(pool, other, id)).rejects.toMatchObject({ status: 404 });
  expect(
    (await pool.query("SELECT 1 FROM operator_incident_scopes WHERE case_id=$1", [id])).rowCount,
  ).toBe(1);
});
test("priority notes remain private and escalation releases scope for qualified reassignment", async () => {
  const s = await shop(),
    { id } = await request(s, "security");
  await claim(id);
  await command(id, "note");
  const owner = await readOwnerIncident(pool, actors.ownerA!, s, id);
  expect(JSON.stringify(owner)).not.toContain("PRIVATE-INVESTIGATION");
  expect(JSON.stringify(owner)).not.toContain(actors.operator!.userId);
  await command(id, "escalate");
  await expect(readOperatorIncident(pool, actors.operator!, id)).rejects.toMatchObject({
    status: 404,
  });
  expect(
    (await pool.query("SELECT 1 FROM operator_incident_scopes WHERE case_id=$1", [id])).rowCount,
  ).toBe(0);
  expect((await incidentQueue(pool, actors.second!))[0]!.id).toBe(id);
  await claim(id, actors.second!);
  expect((await readOperatorIncident(pool, actors.second!, id)).case.state).toBe("investigating");
});
test("exact historical restoration needs the original reporting owner, not another owner or support operator", async () => {
  const { s, id } = await prepared();
  await expect(command(id, "restore_contacts")).rejects.toMatchObject({
    status: 409,
    code: "owner_confirmation_required",
  });
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    seedIds.merchantA,
    actors.ownerB!.userId,
  ]);
  try {
    const view = await readOwnerIncident(pool, actors.ownerB!, s, id);
    expect(view.canConfirm).toBe(false);
    await expect(
      ownerIncidentCommand(pool, actors.ownerB!, s, id, {
        version: view.case.version,
        action: "confirm_restore",
        contactVersion: view.contactVersion,
        reason: "Fictional other owner confirmation",
        confirm: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await pool.query("DELETE FROM memberships WHERE merchant_id=$1 AND user_id=$2", [
      seedIds.merchantA,
      actors.ownerB!.userId,
    ]);
  }
  await approve(s, id);
  await expect(command(id, "restore_contacts", actors.invitee!)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    saveContacts(pool, actors.operator!, s, {
      version: 2,
      phone: "",
      whatsapp: "",
      website: "",
      fulfilment: "contact",
      paymentInstructions: "Forged replacement",
      deliveryInstructions: "",
      enquiriesEnabled: false,
      reason: "Fictional legacy recovery",
    }),
  ).rejects.toMatchObject({ status: 404 });
});
test("restoration appends a new version with atomic history/audit/notices and preserves all independent shop states", async () => {
  const { s, id } = await prepared();
  const before = (
    await pool.query(
      "SELECT p.state AS publication,t.state AS tenancy,m.state AS moderation,s.merchant_id,s.mall_id FROM shops s JOIN shop_publication p ON p.shop_id=s.id JOIN tenancies t ON t.shop_id=s.id JOIN shop_moderation m ON m.shop_id=s.id WHERE s.id=$1",
      [s],
    )
  ).rows[0];
  await approve(s, id);
  const view = await readOperatorIncident(pool, actors.operator!, id);
  const v = {
    version: view.case.version,
    action: "restore_contacts" as const,
    priority: 1,
    reason: "Private restoration checked",
    publicReason: "Requested fictional contacts restored.",
    confirm: true as const,
  };
  const results = await Promise.allSettled([
    commandIncident(pool, actors.operator!, id, v),
    commandIncident(pool, actors.operator!, id, v),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await readContacts(pool, actors.ownerA!, s)).payment_instructions).toBe(
    "Original fictional instructions",
  );
  expect(
    (
      await pool.query(
        "SELECT version FROM shop_contact_history WHERE shop_id=$1 ORDER BY version",
        [s],
      )
    ).rows,
  ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
  expect((await readOwnerIncident(pool, actors.ownerA!, s, id)).case.state).toBe("resolved");
  expect(
    (
      await pool.query(
        "SELECT p.state AS publication,t.state AS tenancy,m.state AS moderation,s.merchant_id,s.mall_id FROM shops s JOIN shop_publication p ON p.shop_id=s.id JOIN tenancies t ON t.shop_id=s.id JOIN shop_moderation m ON m.shop_id=s.id WHERE s.id=$1",
        [s],
      )
    ).rows[0],
  ).toEqual(before);
  const job = (
    await pool.query(
      "SELECT id,payload FROM jobs WHERE payload->>'caseId'=$1 AND payload->>'template'='incident-status'",
      [id],
    )
  ).rows[0];
  expect(JSON.stringify(job.payload)).not.toContain("Private restoration");
  await new LocalNotifications(new LocalPrivateStorage(join(directory, "notice"))).deliver(
    job.id,
    job.payload,
    AbortSignal.timeout(5000),
  );
  expect(await readFile(join(directory, "notice", `${job.id}.json`), "utf8")).not.toContain(
    "PRIVATE-OWNER-REPORT",
  );
  await expect(command(id, "note")).rejects.toMatchObject({ status: 409 });
});
test("a later contact edit invalidates approval; reconfirmation restores without erasing intervening changes", async () => {
  const { s, id } = await prepared();
  await approve(s, id);
  await contact(s, "Later owner edit");
  await expect(command(id, "restore_contacts")).rejects.toMatchObject({ status: 409 });
  expect((await readContacts(pool, actors.ownerA!, s)).version).toBe(3);
  await approve(s, id);
  await command(id, "restore_contacts");
  expect((await readContacts(pool, actors.ownerA!, s)).version).toBe(4);
  expect(
    (
      await pool.query(
        "SELECT payment_instructions FROM shop_contact_history WHERE shop_id=$1 AND version=3",
        [s],
      )
    ).rows[0].payment_instructions,
  ).toBe("Later owner edit");
});
test("expired owner confirmation and native password generation change prevent sensitive restoration", async () => {
  const { s, id } = await prepared();
  await approve(s, id);
  await pool.query(
    "UPDATE incident_cases SET approval_until=now()-interval '1 second' WHERE id=$1",
    [id],
  );
  await expect(command(id, "restore_contacts")).rejects.toMatchObject({ status: 409 });
  await approve(s, id);
  const password = `Changed-incident-${randomUUID()}`;
  expect(
    (
      await clients.ownerA!.request("change-password", {
        currentPassword: accounts.ownerA.password,
        newPassword: password,
        revokeOtherSessions: true,
      })
    ).status,
  ).toBe(200);
  accounts.ownerA.password = password;
  await expect(requireShop(pool, actors.ownerA!, s, "sensitive")).rejects.toMatchObject({
    status: 401,
  });
  await expect(command(id, "restore_contacts")).rejects.toMatchObject({ status: 409 });
  await login("ownerA", accounts.ownerA);
  await approve(s, id);
  await command(id, "restore_contacts");
});
test("credential rotation during a proven user-row lock wait invalidates a pending restoration", async () => {
  const { s, id } = await prepared();
  await approve(s, id);
  const blocker = await pool.connect();
  let attempt: Promise<unknown> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [actors.ownerA!.userId]);
    attempt = command(id, "restore_contacts").catch((e) => e);
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM \"user\"%' ",
            )
          ).rowCount,
        { timeout: 3000 },
      )
      .toBeGreaterThan(0);
    await blocker.query("SELECT invalidate_authentication($1,true)", [actors.ownerA!.userId]);
    await blocker.query("COMMIT");
    expect(await attempt).toMatchObject({ status: 409, code: "owner_confirmation_required" });
    expect(
      (await pool.query("SELECT version FROM shop_contacts WHERE shop_id=$1", [s])).rows[0].version,
    ).toBe(2);
    expect(
      (
        await pool.query(
          "SELECT 1 FROM incident_events WHERE case_id=$1 AND kind='restore_contacts'",
          [id],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await attempt;
    await login("ownerA", accounts.ownerA);
  }
});
test("scope and permission revocation during proven merchant-lock waits denies notes without effects", async () => {
  for (const revoke of ["scope", "grant"] as const) {
    const s = await shop(),
      { id } = await request(s, "security");
    await claim(id);
    const row = await readOperatorIncident(pool, actors.operator!, id),
      blocker = await pool.connect();
    let attempt: Promise<unknown> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [seedIds.merchantA]);
      attempt = commandIncident(pool, actors.operator!, id, {
        version: row.case.version,
        action: "note",
        priority: 2,
        reason: "Waiting fictional note",
        publicReason: "",
        confirm: true,
      }).catch((e) => e);
      await expect
        .poll(
          async () =>
            (
              await pool.query(
                "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
              )
            ).rowCount,
          { timeout: 3000 },
        )
        .toBeGreaterThan(0);
      if (revoke === "scope")
        await pool.query("DELETE FROM operator_incident_scopes WHERE case_id=$1", [id]);
      else
        await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='recovery'", [
          actors.operator!.userId,
        ]);
      await blocker.query("COMMIT");
      expect(await attempt).toMatchObject({ status: revoke === "scope" ? 404 : 403 });
      expect(
        (await pool.query("SELECT version FROM incident_cases WHERE id=$1", [id])).rows[0].version,
      ).toBe(row.case.version);
      expect(
        (await pool.query("SELECT 1 FROM incident_events WHERE case_id=$1 AND kind='note'", [id]))
          .rowCount,
      ).toBe(0);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      await attempt;
      await pool.query(
        "INSERT INTO operator_grants(user_id,permission) VALUES($1,'recovery') ON CONFLICT DO NOTHING",
        [actors.operator!.userId],
      );
    }
  }
});
test("fresh MFA expiry during a proven lock wait denies containment without deleting sessions", async () => {
  const s = await shop(),
    { id } = await request(s, "security");
  await claim(id);
  const row = await readOperatorIncident(pool, actors.operator!, id),
    blocker = await pool.connect();
  let attempt: Promise<unknown> | undefined;
  const count = (
    await pool.query('SELECT count(*)::int AS n FROM session WHERE "userId"=$1', [
      actors.ownerA!.userId,
    ])
  ).rows[0].n;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [seedIds.merchantA]);
    attempt = command(id, "contain_sessions").catch((e) => e);
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
            )
          ).rowCount,
        { timeout: 3000 },
      )
      .toBeGreaterThan(0);
    await pool.query(
      "UPDATE mfa_proofs SET verified_at=now()-interval '6 minutes' WHERE session_id=$1",
      [actors.operator!.sessionId],
    );
    await blocker.query("COMMIT");
    expect(await attempt).toMatchObject({ status: 403 });
    expect(
      (
        await pool.query('SELECT count(*)::int AS n FROM session WHERE "userId"=$1', [
          actors.ownerA!.userId,
        ])
      ).rows[0].n,
    ).toBe(count);
    expect(
      (await pool.query("SELECT version,contained_at FROM incident_cases WHERE id=$1", [id]))
        .rows[0],
    ).toEqual({ version: row.case.version, contained_at: null });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await attempt;
    await pool.query("UPDATE mfa_proofs SET verified_at=now() WHERE session_id=$1", [
      actors.operator!.sessionId,
    ]);
  }
});
test("owner revocation during confirmation lock wait prevents approval and writes no event", async () => {
  const { s, id } = await prepared(),
    blocker = await pool.connect();
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    seedIds.merchantA,
    actors.ownerB!.userId,
  ]);
  let attempt: Promise<unknown> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [seedIds.merchantA]);
    attempt = approve(s, id).catch((e) => e);
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
            )
          ).rowCount,
        { timeout: 3000 },
      )
      .toBeGreaterThan(0);
    await blocker.query(
      "UPDATE memberships SET role='staff',permissions='{}' WHERE merchant_id=$1 AND user_id=$2",
      [seedIds.merchantA, actors.ownerA!.userId],
    );
    await blocker.query("COMMIT");
    expect(await attempt).toMatchObject({ status: 404 });
    expect(
      (await pool.query("SELECT approval_until FROM incident_cases WHERE id=$1", [id])).rows[0]
        .approval_until,
    ).toBeNull();
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await attempt;
    await pool.query("UPDATE memberships SET role='owner' WHERE merchant_id=$1 AND user_id=$2", [
      seedIds.merchantA,
      actors.ownerA!.userId,
    ]);
    await pool.query("DELETE FROM memberships WHERE merchant_id=$1 AND user_id=$2", [
      seedIds.merchantA,
      actors.ownerB!.userId,
    ]);
  }
});
test("containment revokes real sessions/reset tokens, preserves credentials and fences in-flight old-password sign-in", async () => {
  const { s, id } = await prepared();
  await approve(s, id);
  await clients.ownerA!.request("request-password-reset", {
    email: accounts.ownerA.email,
    redirectTo: `${coreConfig().baseURL}/recover`,
  });
  const reset = (
    await pool.query(
      "SELECT identifier FROM verification WHERE value=$1 AND identifier LIKE 'reset-password:%' ORDER BY \"createdAt\" DESC LIMIT 1",
      [actors.ownerA!.userId],
    )
  ).rows[0].identifier as string;
  const credentials = (
    await pool.query(
      'SELECT a.password,u.email,u."twoFactorEnabled" FROM account a JOIN "user" u ON u.id=a."userId" WHERE u.id=$1 AND a."providerId"=\'credential\'',
      [actors.ownerA!.userId],
    )
  ).rows[0];
  const racingAuth = createAuth(pool, coreConfig()),
    racing = new Client(racingAuth),
    ctx = await racingAuth.$context,
    original = ctx.password.verify,
    entered = Promise.withResolvers<void>(),
    resume = Promise.withResolvers<void>();
  ctx.password.verify = async (...args) => {
    const valid = await original(...args);
    entered.resolve();
    await resume.promise;
    return valid;
  };
  const attempt = racing.request("sign-in/email", accounts.ownerA);
  try {
    await Promise.race([
      entered.promise,
      setTimeout(5000).then(() => {
        throw Error("Native password verifier not entered");
      }),
    ]);
    await command(id, "contain_sessions");
    resume.resolve();
    expect((await attempt).status).toBe(401);
    expect(
      (await pool.query('SELECT 1 FROM session WHERE "userId"=$1', [actors.ownerA!.userId]))
        .rowCount,
    ).toBe(0);
    expect(
      (await pool.query("SELECT 1 FROM verification WHERE identifier=$1", [reset])).rowCount,
    ).toBe(0);
    expect(
      (
        await clients.ownerA!.request("reset-password", {
          token: reset.slice("reset-password:".length),
          newPassword: `Rejected-${randomUUID()}`,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await pool.query(
          'SELECT a.password,u.email,u."twoFactorEnabled" FROM account a JOIN "user" u ON u.id=a."userId" WHERE u.id=$1 AND a."providerId"=\'credential\'',
          [actors.ownerA!.userId],
        )
      ).rows[0],
    ).toEqual(credentials);
    await expect(command(id, "restore_contacts")).rejects.toMatchObject({ status: 409 });
    await expect(command(id, "contain_sessions")).rejects.toMatchObject({ status: 409 });
  } finally {
    resume.resolve();
    await attempt;
    await login("ownerA", accounts.ownerA);
  }
  await approve(s, id);
  await command(id, "restore_contacts");
});
test("support resolution and owner cancellation cannot mutate credentials, contacts, money or visibility", async () => {
  const s = await shop();
  await contact(s);
  const { id } = await request(s, "support");
  await claim(id, actors.invitee!);
  await expect(command(id, "contain_sessions", actors.invitee!)).rejects.toMatchObject({
    status: 403,
  });
  await expect(command(id, "restore_contacts", actors.invitee!)).rejects.toMatchObject({
    status: 403,
  });
  await command(id, "resolve", actors.invitee!);
  const second = await request(s, "security"),
    view = await readOwnerIncident(pool, actors.ownerA!, s, second.id);
  await ownerIncidentCommand(pool, actors.ownerA!, s, second.id, {
    version: view.case.version,
    action: "cancel",
    contactVersion: null,
    reason: "Fictional request cancelled by owner",
    confirm: true,
  });
  await expect(claim(second.id)).rejects.toMatchObject({ status: 409 });
  expect((await readContacts(pool, actors.ownerA!, s)).version).toBe(1);
  expect((await ownerIncidents(pool, actors.ownerA!, s)).cases.map((c) => c.state).sort()).toEqual([
    "cancelled",
    "resolved",
  ]);
});
