import { beforeAll, afterAll, describe, test, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "otplib";
import { fork } from "node:child_process";
import { migrate } from "../../src/server/db/migrate";
import { seed, seedIds, type SeedAccounts } from "../../src/server/db/seed";
import { transaction } from "../../src/server/db/pool";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { coreConfig } from "../../src/server/config";
import { createAuth, type Auth } from "../../src/server/security/auth";
import {
  resolveActor,
  requireShop,
  requireMerchant,
  requireOperator,
  requireOperatorShop,
  requireStepUp,
  sessionState,
  type Actor,
} from "../../src/server/security/authorization";
import {
  changeMembership,
  invite,
  acceptInvitation,
  revokeInvitation,
  transferOwnership,
  grantStaffShop,
} from "../../src/server/security/memberships";
import { authenticationRequest } from "../../src/server/security/auth-http";
import { consumeBudget } from "../../src/server/security/budget";
import { listShops, readShop, changeProfile } from "../../src/server/workspace";
import { enqueue } from "../../src/server/jobs/enqueue";
import { claim, acknowledge, fail, heartbeat, replay, type Job } from "../../src/server/jobs/queue";
import { handle } from "../../src/server/jobs/handlers";
import { LocalNotifications, LocalPrivateStorage } from "../../src/server/jobs/adapters";
import { schedule } from "../../src/server/jobs/scheduler";
import { withinDeadline } from "../../src/server/jobs/deadline";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
let authentication: Auth, accounts: SeedAccounts, directory: string, actors: Record<string, Actor>;
class Client {
  cookies = new Map<string, string>();
  constructor(
    readonly auth: Auth,
    readonly account: SeedAccounts[keyof SeedAccounts],
  ) {}
  headers() {
    return new Headers({
      cookie: Array.from(this.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join("; "),
      origin: coreConfig().baseURL,
      "content-type": "application/json",
    });
  }
  async request(path: string, body?: Record<string, unknown>) {
    const headers = this.headers();
    const request = new Request(`${coreConfig().baseURL}/api/auth/${path}`, {
      method: body ? "POST" : "GET",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const response = await authenticationRequest(request, this.auth, pool, (request) =>
      request.json(),
    );
    for (const value of response.headers.getSetCookie()) {
      const first = value.split(";")[0]!,
        split = first.indexOf("=");
      this.cookies.set(first.slice(0, split), first.slice(split + 1));
    }
    return response;
  }
  async login() {
    return this.request("sign-in/email", {
      email: this.account.email,
      password: this.account.password,
    });
  }
  async actor() {
    return resolveActor(this.auth, this.headers());
  }
}
let clients: Record<keyof SeedAccounts, Client>;
async function queuedOnly() {
  await pool.query(
    "UPDATE jobs SET state='done',lease_token=NULL,lease_until=NULL WHERE state IN ('pending','running')",
  );
}
async function newJob(
  kind = "shop.profile.changed",
  merchantId: string | undefined = seedIds.merchantA,
): Promise<string> {
  const id = await enqueue(pool, {
    kind,
    key: randomUUID(),
    ...(merchantId ? { merchantId, shopId: seedIds.shopA } : {}),
    payload: kind === "shop.profile.changed" ? { shopId: seedIds.shopA, version: 1 } : {},
  });
  return id!;
}
async function mustClaim() {
  const job = await claim(pool);
  expect(job).not.toBeNull();
  return job!;
}
async function killAtBoundary(stage: "commit" | "effect") {
  const child = fork("tests/helpers/crash-worker.ts", [stage], {
    execArgv: ["--import", "tsx"],
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    env: { ...process.env, LONDOS_CRASH_KEY: randomUUID(), LONDOS_CRASH_DIRECTORY: directory },
  });
  try {
    const checkpoint = await new Promise<{ jobId: string }>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Crash-driver checkpoint timed out")),
        5000,
      );
      child.once("message", (message) => {
        clearTimeout(timeout);
        resolve(message as { jobId: string });
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Crash driver exited before checkpoint (${code})`));
      });
    });
    const exit = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill("SIGKILL");
    await exit;
    return checkpoint.jobId;
  } finally {
    child.kill("SIGKILL");
  }
}
beforeAll(async () => {
  await requireDevelopmentDatabase(pool);
  directory = await mkdtemp(join(tmpdir(), "londos-x1-"));
  await migrate(pool, undefined, "001_identity.sql");
  // Identity data created before domain migrations survives the upgrade.
  authentication = createAuth(pool, coreConfig(), true);
  await pool.query(
    `INSERT INTO "user"(id,name,email,"emailVerified","updatedAt") VALUES('upgrade-fixture','Upgrade fixture','upgrade@londos.example',true,now())`,
  );
  await migrate(pool, undefined, "006_security_receipts.sql");
  // An X1 proof has no credential/factor generation. The upgrade must require a
  // new challenge while preserving its user and session records.
  await pool.query(`UPDATE "user" SET "twoFactorEnabled"=true WHERE id='upgrade-fixture'`);
  await pool.query(
    `INSERT INTO "twoFactor"(id,secret,"backupCodes","userId",verified) VALUES('upgrade-factor','fictional-encrypted-fixture','fictional-codes','upgrade-fixture',true)`,
  );
  await pool.query(
    `INSERT INTO session(id,token,"expiresAt","updatedAt","userId") VALUES('upgrade-session','fictional-upgrade-token',now()+interval '1 hour',now(),'upgrade-fixture')`,
  );
  await pool.query(
    `INSERT INTO mfa_proofs(session_id,user_id,verified_at,method) VALUES('upgrade-session','upgrade-fixture',now(),'totp')`,
  );
  await Promise.all([migrate(pool), migrate(pool)]);
  expect((await pool.query("SELECT id FROM \"user\" WHERE id='upgrade-fixture'")).rowCount).toBe(1);
  await expect(
    sessionState(pool, { userId: "upgrade-fixture", sessionId: "upgrade-session" }),
  ).rejects.toMatchObject({ code: "mfa_required" });
  accounts = await seed(pool, authentication, directory);
  await seed(pool, authentication, directory);
  // Public handler remains signup-disabled, even though explicit bootstrap seeded accounts.
  authentication = createAuth(pool, coreConfig());
  clients = Object.fromEntries(
    Object.entries(accounts).map(([name, account]) => [name, new Client(authentication, account)]),
  ) as Record<keyof SeedAccounts, Client>;
  actors = {};
  for (const [name, client] of Object.entries(clients)) {
    expect((await client.login()).status).toBe(200);
    actors[name] = await client.actor();
  }
});
afterAll(async () => {
  await pool.end();
  await rm(directory, { recursive: true, force: true });
});

describe("canonical persistence", () => {
  test("fresh/upgrade/repeated/concurrent migrations preserve data and verify checksums", async () => {
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM schema_migrations")).rows[0].count,
    ).toBe(13);
    await migrate(pool);
    expect((await pool.query("SELECT count(*)::int AS count FROM shops")).rows[0].count).toBe(6);
    const changed = join(directory, "changed-migrations");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(changed);
    await writeFile(join(changed, "001_identity.sql"), "-- changed applied SQL\n");
    await expect(migrate(pool, changed)).rejects.toThrow("Applied migration changed");
  });
  test("database rejects cross-merchant departments/products/media/revisions/invoices", async () => {
    const invalid = [
      [
        "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) VALUES($1,$2,$3,'Bad','bad',0)",
        [randomUUID(), seedIds.shopA, seedIds.merchantB],
      ],
      [
        "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,availability) VALUES($1,$2,$3,$4,'product','Bad','bad','UGX','available')",
        [randomUUID(), seedIds.shopB, seedIds.merchantB, "40000000-0000-4000-8000-000000000001"],
      ],
      [
        "INSERT INTO media_assets(id,shop_id,merchant_id,state,storage_key) VALUES($1,$2,$3,'uploaded','bad')",
        [randomUUID(), seedIds.shopA, seedIds.merchantB],
      ],
      [
        "INSERT INTO shop_revisions(id,shop_id,merchant_id,revision,schema_version,design) VALUES($1,$2,$3,1,1,'{}')",
        [randomUUID(), seedIds.shopA, seedIds.merchantB],
      ],
      [
        "INSERT INTO invoices(id,merchant_id,shop_id,currency,amount_minor,period_start,period_end) VALUES($1,$2,$3,'UGX',100,now(),now()+interval '1 month')",
        [randomUUID(), seedIds.merchantB, seedIds.shopA],
      ],
    ] as const;
    for (const [sql, values] of invalid)
      await expect(pool.query(sql, [...values])).rejects.toMatchObject({ code: "23503" });
  });
  test("immutable identity, exact money, pre-shop invoice and append-only ledger", async () => {
    await expect(
      pool.query("UPDATE shops SET id=$2 WHERE id=$1", [seedIds.shopA, randomUUID()]),
    ).rejects.toThrow("immutable");
    const application = randomUUID(),
      invoice = randomUUID();
    await pool.query(
      "INSERT INTO applications(id,merchant_id,applicant_id,state) VALUES($1,$2,$3,'approved')",
      [application, seedIds.merchantA, accounts.ownerA.id],
    );
    await pool.query(
      "INSERT INTO invoices(id,merchant_id,application_id,currency,amount_minor,period_start,period_end) VALUES($1,$2,$3,'UGX','99999999999999999999',now(),now()+interval '1 month')",
      [invoice, seedIds.merchantA, application],
    );
    expect(
      (await pool.query("SELECT amount_minor FROM invoices WHERE id=$1", [invoice])).rows[0]
        .amount_minor,
    ).toBe("99999999999999999999");
    const event = randomUUID();
    await pool.query(
      "INSERT INTO rent_events(id,invoice_id,merchant_id,currency,amount_minor,kind,source,source_reference,actor_id,reason) VALUES($1,$2,$3,'UGX',100,'payment','test',$4,$5,'Fixture only')",
      [event, invoice, seedIds.merchantA, event, accounts.ownerA.id],
    );
    await expect(
      pool.query("UPDATE rent_events SET amount_minor=200 WHERE id=$1", [event]),
    ).rejects.toThrow("append-only");
    await expect(pool.query("DELETE FROM rent_events WHERE id=$1", [event])).rejects.toThrow(
      "append-only",
    );
  });
  test("concurrent unique slugs allocate one record without duplicate identity", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        pool.query(
          "INSERT INTO shops(id,merchant_id,mall_id,name,slug) VALUES($1,$2,$3,'Race','concurrent-slug')",
          [randomUUID(), seedIds.merchantA, seedIds.mallA],
        ),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results)
      if (result.status === "rejected") expect(result.reason.code).toBe("23505");
  });
  test("seed/reset guards reject an unknown or nonlocal database before mutation", async () => {
    const before = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "postgresql://invalid.example/production";
      await expect(requireDevelopmentDatabase(pool)).rejects.toThrow("Development tools");
    } finally {
      process.env.DATABASE_URL = before;
    }
  });
});

describe("tenant and membership boundary", () => {
  test("owners have their own permission matrix, and tenant B cannot guess tenant A IDs", async () => {
    for (const permission of [
      "catalogue",
      "design",
      "publish",
      "finance",
      "sensitive",
      "membership",
    ] as const) {
      await requireShop(pool, actors.ownerA!, seedIds.shopA, permission);
      await expect(
        requireShop(pool, actors.ownerB!, seedIds.shopA, permission),
      ).rejects.toMatchObject({ status: 404 });
    }
    expect(
      (await listShops(pool, actors.ownerB!)).every(
        (shop) => shop.merchant_id === seedIds.merchantB,
      ),
    ).toBe(true);
    await expect(
      changeProfile(pool, actors.ownerB!, seedIds.shopA, { name: "Attack", version: 1 }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(requireOperator(pool, actors.ownerA!, "jobs")).rejects.toMatchObject({
      status: 403,
    });
  });
  test("staff need both explicit action and shop grants, never finance/design/membership by default", async () => {
    await requireShop(pool, actors.staff!, seedIds.shopA, "catalogue");
    for (const permission of ["design", "publish", "finance", "sensitive", "membership"] as const)
      await expect(
        requireShop(pool, actors.staff!, seedIds.shopA, permission),
      ).rejects.toMatchObject({ status: 404 });
    await expect(
      requireShop(pool, actors.staff!, "30000000-0000-4000-8000-000000000003", "catalogue"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      invite(pool, actors.staff!, seedIds.merchantA, {
        email: accounts.invitee.email,
        role: "owner",
        permissions: [],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  test("optimistic profile conflict has no audit/job side effects, winning write commits all three", async () => {
    await queuedOnly();
    const version = (await readShop(pool, actors.ownerA!, seedIds.shopA)).version;
    const result = await Promise.allSettled([
      changeProfile(pool, actors.ownerA!, seedIds.shopA, { name: "Concurrent A", version }),
      changeProfile(pool, actors.ownerA!, seedIds.shopA, { name: "Concurrent B", version }),
    ]);
    expect(result.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM jobs WHERE state='pending' AND kind='shop.profile.changed'",
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM audit_events WHERE action='shop.profile.changed'",
        )
      ).rows[0].count,
    ).toBe(1);
    await expect(pool.query("UPDATE audit_events SET action='tampered'")).rejects.toThrow(
      "append-only",
    );
  });
  test("stale/revoked memberships are checked on every existing session", async () => {
    await changeMembership(pool, actors.ownerA!, seedIds.merchantA, accounts.staff.id, {
      role: "staff",
      permissions: ["catalogue"],
      status: "revoked",
    });
    await expect(readShop(pool, actors.staff!, seedIds.shopA)).rejects.toMatchObject({
      status: 404,
    });
    await changeMembership(pool, actors.ownerA!, seedIds.merchantA, accounts.staff.id, {
      role: "staff",
      permissions: ["catalogue"],
      status: "active",
    });
  });
  test("explicit staff grants cover every allowed action and reject foreign shops or excess grants", async () => {
    const permissions = ["catalogue", "design", "publish", "finance", "sensitive"] as const;
    await changeMembership(pool, actors.ownerA!, seedIds.merchantA, accounts.staff.id, {
      role: "staff",
      status: "active",
      permissions: [...permissions],
    });
    await grantStaffShop(pool, actors.ownerA!, seedIds.merchantA, {
      userId: accounts.staff.id,
      shopId: seedIds.shopA,
      permissions: [...permissions],
    });
    for (const permission of permissions)
      await requireShop(pool, actors.staff!, seedIds.shopA, permission);
    await expect(
      grantStaffShop(pool, actors.ownerA!, seedIds.merchantA, {
        userId: accounts.staff.id,
        shopId: seedIds.shopB,
        permissions: ["catalogue"],
      }),
    ).rejects.toMatchObject({ status: 404 });
    await changeMembership(pool, actors.ownerA!, seedIds.merchantA, accounts.staff.id, {
      role: "staff",
      status: "active",
      permissions: ["catalogue"],
    });
    await expect(
      grantStaffShop(pool, actors.ownerA!, seedIds.merchantA, {
        userId: accounts.staff.id,
        shopId: seedIds.shopA,
        permissions: ["finance"],
      }),
    ).rejects.toMatchObject({ status: 422 });
    await grantStaffShop(pool, actors.ownerA!, seedIds.merchantA, {
      userId: accounts.staff.id,
      shopId: seedIds.shopA,
      permissions: ["catalogue"],
    });
  });
  test("last owner and simultaneous owner removal remain safe in service and database", async () => {
    await expect(
      changeMembership(pool, actors.ownerA!, seedIds.merchantA, accounts.ownerA.id, {
        role: "staff",
        permissions: [],
        status: "active",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      pool.query("UPDATE memberships SET status='revoked' WHERE merchant_id=$1 AND user_id=$2", [
        seedIds.merchantA,
        accounts.ownerA.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await changeMembership(pool, actors.ownerA!, seedIds.merchantA, accounts.staff.id, {
      role: "owner",
      permissions: [],
      status: "active",
    });
    const results = await Promise.allSettled([
      changeMembership(pool, actors.ownerA!, seedIds.merchantA, accounts.ownerA.id, {
        role: "owner",
        permissions: [],
        status: "revoked",
      }),
      changeMembership(pool, actors.staff!, seedIds.merchantA, accounts.staff.id, {
        role: "owner",
        permissions: [],
        status: "revoked",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const remaining = (
      await pool.query(
        "SELECT user_id FROM memberships WHERE merchant_id=$1 AND role='owner' AND status='active'",
        [seedIds.merchantA],
      )
    ).rows[0].user_id;
    await changeMembership(
      pool,
      {
        userId: remaining,
        sessionId:
          remaining === accounts.ownerA.id ? actors.ownerA!.sessionId : actors.staff!.sessionId,
      },
      seedIds.merchantA,
      accounts.ownerA.id,
      { role: "owner", permissions: [], status: "active" },
    );
    await changeMembership(pool, actors.ownerA!, seedIds.merchantA, accounts.staff.id, {
      role: "staff",
      permissions: ["catalogue"],
      status: "active",
    });
  });
  test("invitation binds verified email, expiry, single use, revocation and ownership transfer", async () => {
    const created = await invite(pool, actors.ownerA!, seedIds.merchantA, {
      email: accounts.invitee.email,
      role: "staff",
      permissions: ["catalogue"],
    });
    const job = (
      await pool.query("SELECT payload FROM jobs WHERE dedupe_key=$1", [`invitation:${created.id}`])
    ).rows[0];
    const token = job.payload.token as string;
    await expect(acceptInvitation(pool, actors.ownerB!, token)).rejects.toMatchObject({
      status: 404,
    });
    await acceptInvitation(pool, actors.invitee!, token);
    await expect(acceptInvitation(pool, actors.invitee!, token)).rejects.toMatchObject({
      status: 404,
    });
    await transferOwnership(pool, actors.ownerA!, seedIds.merchantA, accounts.invitee.id);
    await expect(
      requireMerchant(pool, actors.ownerA!, seedIds.merchantA, "membership"),
    ).rejects.toMatchObject({ status: 404 });
    await transferOwnership(pool, actors.invitee!, seedIds.merchantA, accounts.ownerA.id);
    const revoked = await invite(pool, actors.ownerA!, seedIds.merchantA, {
      email: accounts.ownerB.email,
      role: "staff",
      permissions: [],
    });
    const bearer = (
      await pool.query("SELECT payload FROM jobs WHERE dedupe_key=$1", [`invitation:${revoked.id}`])
    ).rows[0].payload.token;
    await revokeInvitation(pool, actors.ownerA!, seedIds.merchantA, revoked.id);
    await expect(acceptInvitation(pool, actors.ownerB!, bearer)).rejects.toMatchObject({
      status: 404,
    });
    const expired = await invite(pool, actors.ownerA!, seedIds.merchantA, {
      email: accounts.ownerB.email,
      role: "staff",
      permissions: [],
    });
    const expiredBearer = (
      await pool.query("SELECT payload FROM jobs WHERE dedupe_key=$1", [`invitation:${expired.id}`])
    ).rows[0].payload.token;
    await pool.query("UPDATE invitations SET expires_at=now()-interval '1 second' WHERE id=$1", [
      expired.id,
    ]);
    await expect(acceptInvitation(pool, actors.ownerB!, expiredBearer)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("authentication and MFA", () => {
  test("unverified accounts cannot sign in, verification works, and TLS cookies are secure", async () => {
    const bootstrap = createAuth(pool, coreConfig(), true),
      email = "verify-test@londos.example",
      password = "A-test-only-verification-password";
    const created = await bootstrap.api.signUpEmail({
      body: { email, password, name: "Verification fixture" },
    });
    const client = new Client(authentication, { id: created.user.id, email, password });
    expect((await client.login()).status).toBe(403);
    expect(
      (
        await client.request("send-verification-email", {
          email,
          callbackURL: `${coreConfig().baseURL}/sign-in`,
        })
      ).status,
    ).toBe(200);
    const job = (
      await pool.query(
        "SELECT payload FROM jobs WHERE payload->>'template'='email-verification' AND payload->>'to'=$1 ORDER BY created_at DESC LIMIT 1",
        [email],
      )
    ).rows[0];
    const verifyUrl = new URL(job.payload.url),
      token = verifyUrl.searchParams.get("token")!;
    expect(
      (
        await client.request(
          `verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(`${coreConfig().baseURL}/sign-in`)}`,
        )
      ).status,
    ).toBe(302);
    const login = await client.login();
    expect(login.status).toBe(200);
    expect(
      login.headers
        .getSetCookie()
        .some((cookie) => cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax")),
    ).toBe(true);
    const tls = createAuth(pool, {
      ...coreConfig(),
      baseURL: "https://localhost:3101",
      secureCookies: true,
    });
    const secure = await tls.api.signInEmail({
      body: { email: accounts.ownerA.email, password: accounts.ownerA.password },
      asResponse: true,
    });
    expect(
      secure.headers
        .getSetCookie()
        .some(
          (cookie) =>
            cookie.includes("Secure") &&
            cookie.includes("HttpOnly") &&
            cookie.includes("SameSite=Lax"),
        ),
    ).toBe(true);
  });
  test("origin, unsupported signup/trusted-device requests and normalized account errors are denied", async () => {
    const forged = new Request(`${coreConfig().baseURL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify({ email: accounts.ownerA.email, password: accounts.ownerA.password }),
    });
    expect(
      (await authenticationRequest(forged, authentication, pool, (r) => r.json())).status,
    ).toBe(403);
    expect(
      (
        await clients.ownerA.request("sign-up/email", {
          email: "new@londos.example",
          password: "not-a-real-password",
        })
      ).status,
    ).toBe(404);
    const unknown = await clients.ownerB.request("sign-in/email", {
      email: "unknown@londos.example",
      password: "not-a-real-password",
    });
    const incorrect = await clients.ownerB.request("sign-in/email", {
      email: accounts.ownerB.email,
      password: "not-a-real-password",
    });
    expect(unknown.status).toBe(incorrect.status);
    expect(await unknown.json()).toEqual(await incorrect.json());
  });
  test("atomic shared rate budget survives concurrent requests", async () => {
    const key = randomUUID();
    const result = await Promise.allSettled(
      Array.from({ length: 20 }, () => consumeBudget(pool, key, 5)),
    );
    expect(result.filter((value) => value.status === "fulfilled")).toHaveLength(5);
    for (const item of result) if (item.status === "rejected") expect(item.reason.status).toBe(429);
  });
  test("real TOTP enrollment/challenge, fresh session proof, mandatory operator MFA and single-use recovery", async () => {
    const operator = clients.operator;
    await expect(requireOperator(pool, actors.operator!, "jobs")).rejects.toMatchObject({
      code: "mfa_required",
    });
    const stalePasswordSession = new Client(authentication, accounts.operator);
    expect((await stalePasswordSession.login()).status).toBe(200);
    const enrollment = await operator.request("two-factor/enable", {
      password: accounts.operator.password,
      method: "totp",
    });
    expect(enrollment.status).toBe(200);
    const data = (await enrollment.json()) as { totpURI: string; backupCodes: string[] };
    await expect(requireOperator(pool, await operator.actor(), "jobs")).rejects.toMatchObject({
      code: "mfa_required",
    });
    const secret = new URL(data.totpURI).searchParams.get("secret")!;
    const code = await generate({ secret });
    const verified = await operator.request("two-factor/verify-totp", { code, trustDevice: false });
    expect(verified.status).toBe(200);
    actors.operator = await operator.actor();
    await requireOperator(pool, actors.operator!, "jobs");
    expect(
      (
        await stalePasswordSession.request("two-factor/get-totp-uri", {
          password: accounts.operator.password,
        })
      ).status,
    ).toBe(403);
    expect((await stalePasswordSession.request("revoke-sessions", {})).status).toBe(403);
    expect(
      (await operator.request("two-factor/verify-totp", { code, trustDevice: false })).status,
    ).toBe(401);
    await requireOperator(pool, actors.operator!, "jobs");
    await expect(requireOperator(pool, actors.operator!, "finance")).rejects.toMatchObject({
      code: "permission_denied",
    });
    await expect(
      requireOperatorShop(pool, actors.operator!, seedIds.shopA, "review"),
    ).rejects.toMatchObject({ status: 404 });
    await pool.query("INSERT INTO operator_shop_scopes(user_id,shop_id) VALUES($1,$2)", [
      accounts.operator.id,
      seedIds.shopA,
    ]);
    await requireOperatorShop(pool, actors.operator!, seedIds.shopA, "review");
    expect(
      (await operator.request("two-factor/disable", { password: accounts.operator.password }))
        .status,
    ).toBe(403);
    await pool.query(
      "UPDATE mfa_proofs SET verified_at=now()-interval '6 minutes' WHERE session_id=$1",
      [actors.operator!.sessionId],
    );
    await expect(requireStepUp(pool, actors.operator!)).rejects.toMatchObject({
      code: "fresh_authentication_required",
    });
    await operator.request("sign-out", {});
    await expect(requireOperator(pool, actors.operator!, "jobs")).rejects.toMatchObject({
      status: 401,
    });
    const login = await operator.login();
    expect((await login.json()).twoFactorRedirect).toBe(true);
    await expect(operator.actor()).rejects.toMatchObject({ status: 401 });
    expect((await operator.request("two-factor/verify-totp", { code: "invalid" })).status).toBe(
      401,
    );
    // Separate factor rate windows are intentionally retained. A backup code is tested on its endpoint.
    expect(
      (
        await operator.request("two-factor/verify-backup-code", {
          code: data.backupCodes[0],
          trustDevice: false,
        })
      ).status,
    ).toBe(200);
    actors.operator = await operator.actor();
    await requireOperator(pool, actors.operator!, "jobs", true);
    await operator.request("sign-out", {});
    await operator.login();
    expect(
      (await operator.request("two-factor/verify-backup-code", { code: data.backupCodes[0] }))
        .status,
    ).toBe(401);
    expect(
      (await operator.request("two-factor/verify-backup-code", { code: data.backupCodes[1] }))
        .status,
    ).toBe(200);
    actors.operator = await operator.actor();
  });
  test("expiry, logout and password reset revoke sessions; recovery tokens are one-use", async () => {
    const client = clients.ownerB,
      old = await client.actor();
    await pool.query("UPDATE session SET \"expiresAt\"=now()-interval '1 second' WHERE id=$1", [
      old.sessionId,
    ]);
    await expect(sessionStateForTest(old)).rejects.toMatchObject({ status: 401 });
    await client.login();
    const current = await client.actor();
    const requested = await client.request("request-password-reset", {
      email: accounts.ownerB.email,
      redirectTo: `${coreConfig().baseURL}/recover`,
    });
    expect(requested.status).toBe(200);
    const payload = (
      await pool.query(
        "SELECT payload FROM jobs WHERE kind='notification.local' AND payload->>'template'='password-reset' AND payload->>'to'=$1 ORDER BY created_at DESC LIMIT 1",
        [accounts.ownerB.email],
      )
    ).rows[0].payload;
    const token = new URL(payload.url).pathname.split("/").at(-1)!;
    const reset = await client.request("reset-password", {
      token,
      newPassword: "Test-only-recovered-password-2026",
    });
    expect(reset.status).toBe(200);
    await expect(sessionStateForTest(current)).rejects.toMatchObject({ status: 401 });
    expect(
      (await client.request("reset-password", { token, newPassword: "Another-test-only-password" }))
        .status,
    ).not.toBe(200);
    accounts.ownerB.password = "Test-only-recovered-password-2026";
    await client.login();
    actors.ownerB = await client.actor();
    await client.request("sign-out", {});
    await expect(client.actor()).rejects.toMatchObject({ status: 401 });
    await client.login();
    actors.ownerB = await client.actor();
  });
});
async function sessionStateForTest(actor: Actor) {
  return requireShop(pool, actor, seedIds.shopB, "catalogue");
}

describe("R1 security regressions", () => {
  async function fixture() {
    // Independent accounts and endpoint-rate windows keep these scenarios isolated.
    await pool.query('DELETE FROM "rateLimit"');
    const email = `review-${randomUUID()}@londos.example`,
      password = `Review-only-${randomUUID()}`;
    const created = await createAuth(pool, coreConfig(), true).api.signUpEmail({
      body: { email, password, name: "R1 fictional account" },
    });
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    const client = new Client(authentication, { id: created.user.id, email, password });
    expect((await client.login()).status).toBe(200);
    return client;
  }
  async function enroll(client: Client) {
    const response = await client.request("two-factor/enable", {
      password: client.account.password,
      method: "totp",
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { totpURI: string; backupCodes: string[] };
    const secret = new URL(data.totpURI).searchParams.get("secret")!;
    expect(
      (await client.request("two-factor/verify-totp", { code: await generate({ secret }) })).status,
    ).toBe(200);
    return data;
  }
  async function resetLink(client: Client) {
    expect(
      (
        await client.request("request-password-reset", {
          email: client.account.email,
          redirectTo: `${coreConfig().baseURL}/recover`,
        })
      ).status,
    ).toBe(200);
    return new URL(
      (
        await pool.query(
          "SELECT payload->>'url' AS url FROM jobs WHERE payload->>'template'='password-reset' AND payload->>'to'=$1 ORDER BY created_at DESC LIMIT 1",
          [client.account.email],
        )
      ).rows[0].url,
    );
  }
  test("the actual password-reset notification link reaches the recovery form safely", async () => {
    const client = await fixture(),
      url = await resetLink(client);
    const result = await client.request(`${url.pathname.replace("/api/auth/", "")}${url.search}`);
    expect(result.status).toBe(302);
    const destination = new URL(result.headers.get("location")!);
    expect(destination.origin).toBe(coreConfig().baseURL);
    expect(destination.pathname).toBe("/recover");
    expect(destination.searchParams.get("token")).toBe(url.pathname.split("/").at(-1));
    url.searchParams.set("callbackURL", "https://attacker.example/steal");
    const forged = await client.request(`${url.pathname.replace("/api/auth/", "")}${url.search}`);
    expect(forged.status).toBe(403);
    expect(forged.headers.get("location")).toBeNull();
  });
  test("replacing an MFA factor cannot retain another session's proof for the old factor", async () => {
    const current = await fixture(),
      first = await enroll(current);
    const retained = new Client(authentication, current.account);
    expect((await (await retained.login()).json()).twoFactorRedirect).toBe(true);
    expect(
      (await retained.request("two-factor/verify-backup-code", { code: first.backupCodes[0] }))
        .status,
    ).toBe(200);
    const oldActor = await retained.actor();
    await requireStepUp(pool, oldActor);
    expect(
      (await current.request("two-factor/disable", { password: current.account.password })).status,
    ).toBe(200);
    await enroll(current);
    expect(await sessionState(pool, await current.actor())).toMatchObject({ mfa_enabled: true });
    await expect(requireStepUp(pool, oldActor)).rejects.toMatchObject({ status: 401 });
  });
  test("password reset revokes a pending MFA challenge created with the previous password", async () => {
    const current = await fixture(),
      factor = await enroll(current);
    const pending = new Client(authentication, current.account);
    expect((await (await pending.login()).json()).twoFactorRedirect).toBe(true);
    const link = await resetLink(current);
    expect(
      (
        await current.request("reset-password", {
          token: link.pathname.split("/").at(-1),
          newPassword: `Changed-review-${randomUUID()}`,
        })
      ).status,
    ).toBe(200);
    const result = await pending.request("two-factor/verify-backup-code", {
      code: factor.backupCodes[0],
    });
    expect(result.status).toBe(401);
    await expect(pending.actor()).rejects.toMatchObject({ status: 401 });
  });
  test("password reset during password verification cannot issue a session from the old password", async () => {
    const current = await fixture(),
      link = await resetLink(current);
    const racingAuth = createAuth(pool, coreConfig()),
      racing = new Client(racingAuth, current.account);
    const context = await racingAuth.$context,
      original = context.password.verify;
    const entered = Promise.withResolvers<void>(),
      resume = Promise.withResolvers<void>();
    context.password.verify = async (...args) => {
      const valid = await original(...args); // Real password verification completes first.
      entered.resolve();
      await resume.promise;
      return valid;
    };
    const attempt = racing.login();
    try {
      await withinDeadline(() => entered.promise, AbortSignal.timeout(5000));
      expect(
        (
          await current.request("reset-password", {
            token: link.pathname.split("/").at(-1),
            newPassword: `Changed-review-${randomUUID()}`,
          })
        ).status,
      ).toBe(200);
      resume.resolve();
      const response = await attempt;
      expect(response.status).toBe(401);
      expect(response.headers.getSetCookie().length).toBe(0);
      await expect(racing.actor()).rejects.toMatchObject({ status: 401 });
      expect(
        (await pool.query('SELECT 1 FROM session WHERE "userId"=$1', [current.account.id]))
          .rowCount,
      ).toBe(0);
    } finally {
      resume.resolve();
      await attempt;
    }
  });
  test("password reset during successful MFA completion cannot restore the old credential's authority", async () => {
    const current = await fixture(),
      factor = await enroll(current),
      link = await resetLink(current);
    const racingAuth = createAuth(pool, coreConfig()),
      racing = new Client(racingAuth, current.account);
    expect((await (await racing.login()).json()).twoFactorRedirect).toBe(true);
    const context = await racingAuth.$context,
      original = context.internalAdapter.createSession;
    const entered = Promise.withResolvers<void>(),
      resume = Promise.withResolvers<void>();
    context.internalAdapter.createSession = async (...args) => {
      // The library has verified/consumed the backup code and login challenge.
      // Suspend only session creation to deterministically reproduce this race.
      entered.resolve();
      await resume.promise;
      return original(...args);
    };
    const attempt = racing.request("two-factor/verify-backup-code", {
      code: factor.backupCodes[0],
    });
    try {
      await withinDeadline(() => entered.promise, AbortSignal.timeout(5000));
      expect(
        (
          await current.request("reset-password", {
            token: link.pathname.split("/").at(-1),
            newPassword: `Changed-review-${randomUUID()}`,
          })
        ).status,
      ).toBe(200);
      resume.resolve();
      const response = await attempt;
      expect(response.status).toBe(401);
      expect(response.headers.getSetCookie().length).toBe(0);
      await expect(racing.actor()).rejects.toMatchObject({ status: 401 });
      expect(
        (await pool.query("SELECT 1 FROM mfa_proofs WHERE user_id=$1", [current.account.id]))
          .rowCount,
      ).toBe(0);
    } finally {
      resume.resolve();
      await attempt;
    }
  });
  test("concurrent use consumes one backup code once and enrolled factor replacement requires removal", async () => {
    const current = await fixture(),
      factor = await enroll(current);
    const one = new Client(authentication, current.account),
      two = new Client(authentication, current.account);
    await one.login();
    await two.login();
    const results = await Promise.all(
      [one, two].map((client) =>
        client.request("two-factor/verify-backup-code", { code: factor.backupCodes[0] }),
      ),
    );
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.filter((result) => [401, 409].includes(result.status))).toHaveLength(1);
    await expect(
      pool.query('UPDATE "twoFactor" SET verified=false,secret=$2 WHERE "userId"=$1', [
        current.account.id,
        "fictional-stale-enrollment",
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await requireStepUp(pool, await current.actor());
  });
  test("money columns reject fractional minor units instead of rounding them", async () => {
    const invoice = randomUUID();
    await pool.query(
      "INSERT INTO invoices(id,merchant_id,shop_id,currency,amount_minor,period_start,period_end) VALUES($1,$2,$3,'UGX',100,now(),now()+interval '1 month')",
      [invoice, seedIds.merchantA, seedIds.shopA],
    );
    const attempts = await Promise.allSettled([
      pool.query("UPDATE products SET price_minor='100.5' WHERE id=$1", [
        "50000000-0000-4000-8000-000000000001",
      ]),
      pool.query(
        "INSERT INTO invoices(id,merchant_id,shop_id,currency,amount_minor,period_start,period_end) VALUES($1,$2,$3,'UGX','100.5',now(),now()+interval '1 month')",
        [randomUUID(), seedIds.merchantA, seedIds.shopA],
      ),
      pool.query(
        "INSERT INTO rent_events(id,invoice_id,merchant_id,currency,amount_minor,kind,source,source_reference,actor_id,reason) VALUES($1,$2,$3,'UGX','100.5','payment','review',$5,$4,'Fictional regression')",
        [randomUUID(), invoice, seedIds.merchantA, accounts.ownerA.id, randomUUID()],
      ),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(0);
    for (const result of attempts)
      if (result.status === "rejected") expect(result.reason.code).toBe("23514");
    for (const amount of ["NaN", "Infinity", "-Infinity", "100000000000000000000", "-0.5"])
      await expect(
        pool.query("UPDATE products SET price_minor=$1 WHERE id=$2", [
          amount,
          "50000000-0000-4000-8000-000000000001",
        ]),
      ).rejects.toMatchObject({ code: "23514" });
  });
  test.each(["revocation", "demotion", "transfer"] as const)(
    "%s of an owner revokes their unaccepted invitations",
    async (operation) => {
      const owner = await fixture(),
        other = await fixture(),
        recipient = await fixture();
      const merchantId = randomUUID(),
        actor = await owner.actor();
      await transaction(pool, async (client) => {
        await client.query("INSERT INTO merchants(id,name) VALUES($1,'R1 fictional merchant')", [
          merchantId,
        ]);
        await client.query(
          "INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'owner')",
          [merchantId, owner.account.id, other.account.id],
        );
      });
      const invitation = await invite(pool, actor, merchantId, {
        email: recipient.account.email,
        role: "owner",
        permissions: [],
      });
      const token = (
        await pool.query("SELECT payload->>'token' AS token FROM jobs WHERE dedupe_key=$1", [
          `invitation:${invitation.id}`,
        ])
      ).rows[0].token;
      if (operation === "transfer")
        await transferOwnership(pool, actor, merchantId, other.account.id);
      else
        await changeMembership(pool, actor, merchantId, owner.account.id, {
          role: operation === "demotion" ? "staff" : "owner",
          status: operation === "revocation" ? "revoked" : "active",
          permissions: [],
        });
      await expect(acceptInvitation(pool, await recipient.actor(), token)).rejects.toMatchObject({
        status: 404,
      });
      expect(
        (
          await pool.query(
            "SELECT revoked_at IS NOT NULL AS revoked FROM invitations WHERE id=$1",
            [invitation.id],
          )
        ).rows[0].revoked,
      ).toBe(true);
      expect(
        (
          await pool.query("SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2", [
            merchantId,
            recipient.account.id,
          ])
        ).rowCount,
      ).toBe(0);
      await changeMembership(pool, await other.actor(), merchantId, owner.account.id, {
        role: "owner",
        status: "active",
        permissions: [],
      });
      await expect(acceptInvitation(pool, await recipient.actor(), token)).rejects.toMatchObject({
        status: 404,
      });
    },
  );
  test.each(["session", "invitation"] as const)(
    "%s expiry is checked after the merchant lock, using current time",
    async (kind) => {
      const client = await fixture(),
        actor = await client.actor();
      const invitation = await invite(pool, actors.ownerA!, seedIds.merchantA, {
        email: client.account.email,
        role: "staff",
        permissions: [],
      });
      const token = (
        await pool.query("SELECT payload->>'token' AS token FROM jobs WHERE dedupe_key=$1", [
          `invitation:${invitation.id}`,
        ])
      ).rows[0].token;
      const blocker = await pool.connect();
      let result: Promise<{ ok: true } | { ok: false; error: unknown }> | undefined;
      try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [seedIds.merchantA]);
        result = acceptInvitation(pool, actor, token).then(
          () => ({ ok: true as const }),
          (error) => ({ ok: false as const, error }),
        );
        await expect
          .poll(
            async () =>
              (
                await pool.query(
                  "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM merchants%'",
                )
              ).rows[0].count,
          )
          .toBeGreaterThan(0);
        if (kind === "session")
          await pool.query(
            "UPDATE session SET \"expiresAt\"=clock_timestamp()+interval '50 milliseconds' WHERE id=$1",
            [actor.sessionId],
          );
        else
          await pool.query(
            "UPDATE invitations SET expires_at=clock_timestamp()+interval '50 milliseconds' WHERE id=$1",
            [invitation.id],
          );
        await pool.query("SELECT pg_sleep(0.1)");
        await blocker.query("COMMIT");
        const completed = await result;
        expect(completed.ok).toBe(false);
        if (!completed.ok)
          expect(completed.error).toMatchObject({ status: kind === "session" ? 401 : 404 });
        expect(
          (
            await pool.query("SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2", [
              seedIds.merchantA,
              client.account.id,
            ])
          ).rowCount,
        ).toBe(0);
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
        await result;
      }
    },
  );
  test("invitation acceptance rechecks the session after waiting for the merchant lock", async () => {
    const client = await fixture(),
      actor = await client.actor();
    const invitation = await invite(pool, actors.ownerA!, seedIds.merchantA, {
      email: client.account.email,
      role: "staff",
      permissions: [],
    });
    const token = (
      await pool.query("SELECT payload->>'token' AS token FROM jobs WHERE dedupe_key=$1", [
        `invitation:${invitation.id}`,
      ])
    ).rows[0].token;
    const blocker = await pool.connect();
    let result: Promise<{ ok: true } | { ok: false; error: unknown }> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [seedIds.merchantA]);
      result = acceptInvitation(pool, actor, token).then(
        () => ({ ok: true as const }),
        (error) => ({ ok: false as const, error }),
      );
      await expect
        .poll(
          async () =>
            (
              await pool.query(
                "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM merchants%'",
              )
            ).rows[0].count,
        )
        .toBeGreaterThan(0);
      expect((await client.request("sign-out", {})).status).toBe(200);
      await blocker.query("COMMIT");
      const completed = await result;
      expect(completed.ok).toBe(false);
      if (!completed.ok) expect(completed.error).toMatchObject({ status: 401 });
      expect(
        (
          await pool.query("SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2", [
            seedIds.merchantA,
            client.account.id,
          ])
        ).rowCount,
      ).toBe(0);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      await result;
    }
  });
});

describe("durable jobs and recovery", () => {
  test("job deadline rejects a stalled adapter, aborted work has no transactional effect", async () => {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(new Error("timeout")), 10);
    await expect(withinDeadline(() => new Promise(() => {}), controller.signal)).rejects.toThrow(
      "timeout",
    );
    clearTimeout(timer);
    await queuedOnly();
    await newJob();
    const job = await mustClaim();
    await expect(handle(pool, job, new LocalNotifications(), controller.signal)).rejects.toThrow(
      "timeout",
    );
    expect((await pool.query("SELECT 1 FROM job_effects WHERE job_id=$1", [job.id])).rowCount).toBe(
      0,
    );
    await fail(pool, job, "timeout");
    expect(
      (await pool.query("SELECT state,last_error FROM jobs WHERE id=$1", [job.id])).rows[0],
    ).toMatchObject({ state: "pending", last_error: "timeout" });
  });
  test("separate producer and worker processes recover after SIGKILL at commit/effect/delivery checkpoints", async () => {
    await queuedOnly();
    const committed = await killAtBoundary("commit");
    expect(
      (await pool.query("SELECT state FROM jobs WHERE id=$1", [committed])).rows[0].state,
    ).toBe("pending");
    const effected = await killAtBoundary("effect");
    expect(effected).toBe(committed);
    expect((await pool.query("SELECT state FROM jobs WHERE id=$1", [effected])).rows[0].state).toBe(
      "running",
    );
    await pool.query("UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [
      effected,
    ]);
    const recovered = await mustClaim();
    await handle(pool, recovered, new LocalNotifications(), new AbortController().signal);
    await acknowledge(pool, recovered);
    expect(
      (
        await pool.query("SELECT count(*)::int AS count FROM job_effects WHERE job_id=$1", [
          committed,
        ])
      ).rows[0].count,
    ).toBe(1);
    await enqueue(pool, {
      kind: "notification.local",
      key: randomUUID(),
      payload: {
        to: accounts.ownerA.email,
        template: "invitation",
        token: "a-test-only-token-of-at-least-32-characters",
      },
    });
    const delivered = await killAtBoundary("effect"),
      original = await readFile(join(directory, `${delivered}.json`), "utf8");
    await pool.query("UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [
      delivered,
    ]);
    const retry = await mustClaim();
    await handle(
      pool,
      retry,
      new LocalNotifications(new LocalPrivateStorage(directory)),
      new AbortController().signal,
    );
    await acknowledge(pool, retry);
    expect(await readFile(join(directory, `${delivered}.json`), "utf8")).toBe(original);
  });
  test("transaction rollback loses neither audit nor domain data and emits no committed job", async () => {
    const key = randomUUID();
    await expect(
      transaction(pool, async (client) => {
        await enqueue(client, { kind: "system.maintenance", key, payload: { tick: "rollback" } });
        throw new Error("forced crash before commit");
      }),
    ).rejects.toThrow("forced crash");
    expect((await pool.query("SELECT id FROM jobs WHERE dedupe_key=$1", [key])).rowCount).toBe(0);
  });
  test("commit-before-dispatch and duplicate enqueue survive independent claim", async () => {
    await queuedOnly();
    const key = randomUUID();
    await transaction(pool, (client) =>
      enqueue(client, {
        kind: "shop.profile.changed",
        key,
        merchantId: seedIds.merchantA,
        shopId: seedIds.shopA,
        payload: { shopId: seedIds.shopA, version: 1 },
      }),
    );
    expect(await enqueue(pool, { kind: "shop.profile.changed", key, payload: {} })).toBeUndefined();
    const job = await mustClaim();
    await handle(
      pool,
      job,
      new LocalNotifications(new LocalPrivateStorage(directory)),
      new AbortController().signal,
    );
    await acknowledge(pool, job);
    expect((await pool.query("SELECT state FROM jobs WHERE id=$1", [job.id])).rows[0].state).toBe(
      "done",
    );
  });
  test("crash after transactional effect before ack reclaims lease without duplicate effect", async () => {
    await queuedOnly();
    await newJob();
    const first = await mustClaim();
    await handle(pool, first, new LocalNotifications(), new AbortController().signal);
    await pool.query("UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [
      first.id,
    ]);
    const second = await mustClaim();
    expect(second.id).toBe(first.id);
    expect(second.lease_token).not.toBe(first.lease_token);
    expect(await acknowledge(pool, first)).toBe(false);
    expect(await heartbeat(pool, first)).toBe(false);
    await handle(pool, second, new LocalNotifications(), new AbortController().signal);
    await acknowledge(pool, second);
    expect(
      (
        await pool.query("SELECT count(*)::int AS count FROM job_effects WHERE job_id=$1", [
          first.id,
        ])
      ).rows[0].count,
    ).toBe(1);
  });
  test("private local delivery before ack is idempotent and never writes to public assets", async () => {
    await queuedOnly();
    await enqueue(pool, {
      kind: "notification.local",
      key: randomUUID(),
      payload: {
        to: accounts.ownerA.email,
        template: "invitation",
        token: "a-test-only-recovery-token-of-32-characters",
      },
    });
    const job = await mustClaim(),
      adapter = new LocalNotifications(new LocalPrivateStorage(directory));
    await handle(pool, job, adapter, new AbortController().signal);
    const file = join(directory, `${job.id}.json`),
      first = await readFile(file, "utf8");
    await handle(pool, job, adapter, new AbortController().signal);
    expect(await readFile(file, "utf8")).toBe(first);
    expect(JSON.parse(first).adapter).toBe("local-private-sink");
    await acknowledge(pool, job);
  });
  test("out-of-order profile work reads latest canonical state and cannot roll projection back", async () => {
    await queuedOnly();
    const current = await readShop(pool, actors.ownerA!, seedIds.shopA);
    const updated = await changeProfile(pool, actors.ownerA!, seedIds.shopA, {
      name: "Newest canonical name",
      version: current.version,
    });
    const newer = await mustClaim();
    await handle(pool, newer, new LocalNotifications(), new AbortController().signal);
    await acknowledge(pool, newer);
    await newJob();
    const older = await mustClaim();
    await handle(pool, older, new LocalNotifications(), new AbortController().signal);
    await acknowledge(pool, older);
    expect(
      (
        await pool.query("SELECT version,name FROM shop_projections WHERE shop_id=$1", [
          seedIds.shopA,
        ])
      ).rows[0],
    ).toMatchObject({ version: updated.version, name: updated.name });
  });
  test("concurrent workers, tenant backpressure, backoff/dead letters and authenticated replay", async () => {
    await queuedOnly();
    await newJob();
    await newJob();
    await enqueue(pool, {
      kind: "system.maintenance",
      key: randomUUID(),
      payload: { tick: "independent-tenant" },
    });
    const claimed = (await Promise.all([claim(pool), claim(pool), claim(pool)])).filter(
      Boolean,
    ) as Job[];
    expect(claimed.filter((job) => job.merchant_id === seedIds.merchantA)).toHaveLength(1);
    expect(claimed.filter((job) => job.merchant_id === null)).toHaveLength(1);
    for (const job of claimed) await acknowledge(pool, job);
    const remaining = await mustClaim();
    await acknowledge(pool, remaining);
    const poisonId = await newJob("unknown.poison", undefined);
    await pool.query("UPDATE jobs SET max_attempts=2 WHERE id=$1", [poisonId]);
    let poison = await mustClaim();
    await expect(
      handle(pool, poison, new LocalNotifications(), new AbortController().signal),
    ).rejects.toThrow("unsupported_job");
    await fail(pool, poison, "unsupported_job");
    expect(await claim(pool)).toBeNull();
    await pool.query("UPDATE jobs SET available_at=now() WHERE id=$1", [poisonId]);
    poison = await mustClaim();
    await fail(pool, poison, "unsupported_job");
    expect((await pool.query("SELECT state FROM jobs WHERE id=$1", [poisonId])).rows[0].state).toBe(
      "dead",
    );
    await expect(replay(pool, actors.ownerA!, poisonId)).rejects.toMatchObject({ status: 403 });
    await replay(pool, actors.operator!, poisonId);
    expect(
      (await pool.query("SELECT state,attempts FROM jobs WHERE id=$1", [poisonId])).rows[0],
    ).toEqual({ state: "pending", attempts: 0 });
  });
  test("overlapping scheduler instances create one tick and durable job", async () => {
    const now = new Date("2030-01-01T00:00:00Z");
    const results = await Promise.all([
      schedule(pool, now),
      schedule(pool, now),
      schedule(pool, now),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      (await pool.query("SELECT id FROM jobs WHERE dedupe_key='maintenance:2030-01-01T00:00'"))
        .rowCount,
    ).toBe(1);
  });
});
