import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, afterAll, test, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { migrate } from "../../src/server/db/migrate";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { bootstrapAccounts } from "../../src/server/bootstrap-accounts";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { resolveActor, requireOperator } from "../../src/server/security/authorization";
const parent = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool;
const env = {
  LONDOS_BOOTSTRAP_ADMIN_NAME: "Test landlord",
  LONDOS_BOOTSTRAP_ADMIN_EMAIL: "bootstrap-admin@londos.invalid",
  LONDOS_BOOTSTRAP_ADMIN_PASSWORD: "Long-unique-test-only-password-admin",
  LONDOS_BOOTSTRAP_SHOPKEEPER_NAME: "Test merchant",
  LONDOS_BOOTSTRAP_SHOPKEEPER_EMAIL: "bootstrap-shop@londos.invalid",
  LONDOS_BOOTSTRAP_SHOPKEEPER_PASSWORD: "Long-unique-test-only-password-shop",
};
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${name}`;
  pool = new Pool({ connectionString: url.href, max: 3 });
  await migrate(pool);
});
afterAll(async () => {
  await pool?.end();
  await parent.query(`DROP DATABASE IF EXISTS ${name}`);
  await parent.end();
});
test("bootstrap is opt-in, atomic, refuses existing identities and never revives grants on restart", async () => {
  expect(await bootstrapAccounts(pool, {})).toEqual({ created: 0 });
  await expect(
    bootstrapAccounts(pool, { LONDOS_BOOTSTRAP_ADMIN_EMAIL: "incomplete@londos.invalid" }),
  ).rejects.toThrow("bootstrap_credentials_invalid");
  const existing = randomUUID();
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,\'Existing\',$2,true)',
    [existing, env.LONDOS_BOOTSTRAP_ADMIN_EMAIL],
  );
  await expect(bootstrapAccounts(pool, env)).rejects.toThrow("bootstrap_existing_identity_refused");
  expect((await pool.query("SELECT 1 FROM operator_grants")).rowCount).toBe(0);
  await pool.query('DELETE FROM "user" WHERE id=$1', [existing]);
  const results = await Promise.all([bootstrapAccounts(pool, env), bootstrapAccounts(pool, env)]);
  expect(results.reduce((n, r) => n + r.created, 0)).toBe(2);
  const users = (await pool.query('SELECT id,email,"emailVerified" FROM "user" ORDER BY email'))
    .rows;
  expect(users).toHaveLength(2);
  expect(users.every((u) => !u.emailVerified)).toBe(true);
  const admin = users.find((u) => u.email === env.LONDOS_BOOTSTRAP_ADMIN_EMAIL)!,
    shop = users.find((u) => u.email === env.LONDOS_BOOTSTRAP_SHOPKEEPER_EMAIL)!;
  expect(
    (await pool.query("SELECT 1 FROM operator_grants WHERE user_id=$1", [admin.id])).rowCount,
  ).toBe(10);
  expect(
    (await pool.query("SELECT 1 FROM operator_grants WHERE user_id=$1", [shop.id])).rowCount,
  ).toBe(0);
  expect((await pool.query("SELECT state FROM shop_publication")).rows).toEqual([
    { state: "unpublished" },
  ]);
  expect((await pool.query("SELECT 1 FROM rent_events")).rowCount).toBe(0);
  expect(
    (await pool.query("SELECT 1 FROM jobs WHERE payload->>'template'='email-verification'"))
      .rowCount,
  ).toBe(2);
  const auth = createAuth(pool, coreConfig());
  const signIn = (email: string, password: string) =>
    auth.handler(
      new Request(`${coreConfig().baseURL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { origin: coreConfig().baseURL, "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );
  expect(
    (await signIn(env.LONDOS_BOOTSTRAP_ADMIN_EMAIL, env.LONDOS_BOOTSTRAP_ADMIN_PASSWORD)).status,
  ).toBe(403);
  const verification = (
    await pool.query("SELECT payload->>'url' AS url FROM jobs WHERE payload->>'to'=$1", [
      env.LONDOS_BOOTSTRAP_ADMIN_EMAIL,
    ])
  ).rows[0].url;
  const verified = await auth.handler(new Request(verification));
  expect(verified.status).toBe(302);
  const login = await signIn(env.LONDOS_BOOTSTRAP_ADMIN_EMAIL, env.LONDOS_BOOTSTRAP_ADMIN_PASSWORD);
  expect(login.status).toBe(200);
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const actor = await resolveActor(auth, new Headers({ cookie }));
  await expect(requireOperator(pool, actor, "operations")).rejects.toMatchObject({
    code: "mfa_required",
  });
  const password = (await pool.query('SELECT password FROM account WHERE "userId"=$1', [admin.id]))
    .rows[0].password;
  await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='finance'", [
    admin.id,
  ]);
  expect(
    await bootstrapAccounts(pool, {
      ...env,
      LONDOS_BOOTSTRAP_ADMIN_PASSWORD: "Changed-ignored-test-only-password",
    }),
  ).toEqual({ created: 0 });
  expect(
    (await pool.query('SELECT password FROM account WHERE "userId"=$1', [admin.id])).rows[0]
      .password,
  ).toBe(password);
  expect(
    (
      await pool.query("SELECT 1 FROM operator_grants WHERE user_id=$1 AND permission='finance'", [
        admin.id,
      ])
    ).rowCount,
  ).toBe(0);
});

test("packaged bootstrap entry runs safely with existing receipts", async () => {
  const result = await promisify(execFile)(
    process.execPath,
    ["scripts/release-entry.mjs", "bootstrap"],
    { env: { ...process.env, ...env, DATABASE_URL: pool.options.connectionString! } },
  );
  expect(result.stdout).toContain('"event":"bootstrap.complete"');
  expect(result.stdout).toContain('"created":0');
  expect(result.stdout).not.toContain(env.LONDOS_BOOTSTRAP_ADMIN_EMAIL);
  expect(result.stdout).not.toContain(env.LONDOS_BOOTSTRAP_ADMIN_PASSWORD);
});
