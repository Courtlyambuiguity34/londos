import { afterAll, beforeAll, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { migrate } from "../../src/server/db/migrate";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { seed, seedIds } from "../../src/server/db/seed";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { resolveActor, type Actor } from "../../src/server/security/authorization";
import { readTeam, teamCommand } from "../../src/server/team";

const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool, directory: string, owner: Actor, foreign: Actor, staffId: string;
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  pool = new Pool({ connectionString: url.toString(), max: 3 });
  directory = await mkdtemp(join(tmpdir(), "londos-team-pages-"));
  await migrate(pool);
  const auth = createAuth(pool, coreConfig(), true),
    accounts = await seed(pool, auth, directory);
  staffId = accounts.staff.id;
  for (const key of ["ownerA", "ownerB"] as const) {
    const response = await auth.handler(
      new Request(`${coreConfig().baseURL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { origin: coreConfig().baseURL, "content-type": "application/json" },
        body: JSON.stringify({ email: accounts[key].email, password: accounts[key].password }),
      }),
    );
    expect(response.status).toBe(200);
    const actor = await resolveActor(
      auth,
      new Headers({
        cookie: response.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; "),
      }),
    );
    if (key === "ownerA") owner = actor;
    else foreign = actor;
  }
  const existingShops = (
    await pool.query("SELECT count(*)::int AS n FROM shops WHERE merchant_id=$1", [
      seedIds.merchantA,
    ])
  ).rows[0].n;
  for (let index = 0; index < 21 - existingShops; index++)
    await pool.query("INSERT INTO shops(id,merchant_id,mall_id,name,slug) VALUES($1,$2,$3,$4,$5)", [
      randomUUID(),
      seedIds.merchantA,
      seedIds.mallA,
      `Pagination shop ${String(index).padStart(2, "0")}`,
      `pagination-${randomUUID()}`,
    ]);
});
afterAll(async () => {
  await pool?.end();
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!(await parent.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1", [name])).rowCount)
      break;
    await delay(20);
  }
  await parent.query(`DROP DATABASE IF EXISTS ${name}`);
  await parent.end();
  await rm(directory, { recursive: true, force: true });
  process.env.DATABASE_URL = parentURL;
});

test("independent shop pagination keeps staff selectable and grants the last shop with current merchant version", async () => {
  const view = await readTeam(pool, owner, seedIds.merchantA, 0, { shopsPage: 1 });
  expect(view.shops).toHaveLength(1);
  expect(view.members.map((member) => member.user_id)).toContain(staffId);
  expect(view.pagination).toMatchObject({ members: { page: 0 }, shops: { page: 1, next: false } });
  await teamCommand(pool, owner, seedIds.merchantA, {
    action: "staff_shop",
    version: view.merchant.version,
    confirm: true,
    value: { userId: staffId, shopId: view.shops[0]!.id, permissions: ["catalogue"] },
  });
  const updated = await readTeam(pool, owner, seedIds.merchantA, 0, { shopsPage: 1 });
  expect(updated.grants).toContainEqual({
    user_id: staffId,
    shop_id: view.shops[0]!.id,
    permissions: ["catalogue"],
  });
  expect(updated.merchant.version).toBe(view.merchant.version + 1);
});

test("independent pages remain bounded and retain owner, tenant and fresh-session boundaries", async () => {
  const legacy = await readTeam(pool, owner, seedIds.merchantA, 1);
  expect(legacy.members).toEqual([]);
  expect(legacy.shops).toHaveLength(1);
  await expect(
    readTeam(pool, owner, seedIds.merchantA, 0, { shopsPage: 501 }),
  ).rejects.toMatchObject({ name: "ZodError" });
  await expect(
    readTeam(pool, owner, seedIds.merchantA, 0, { membersPage: -1 }),
  ).rejects.toMatchObject({ name: "ZodError" });
  await expect(
    readTeam(pool, foreign, seedIds.merchantA, 0, { shopsPage: 1 }),
  ).rejects.toMatchObject({ status: 404 });
  await pool.query(
    "UPDATE session SET \"createdAt\"=clock_timestamp()-interval '6 minutes' WHERE id=$1",
    [owner.sessionId],
  );
  try {
    await expect(
      readTeam(pool, owner, seedIds.merchantA, 0, { shopsPage: 1 }),
    ).rejects.toMatchObject({ status: 403, code: "fresh_authentication_required" });
  } finally {
    await pool.query('UPDATE session SET "createdAt"=clock_timestamp() WHERE id=$1', [
      owner.sessionId,
    ]);
  }
});

test("invitation pagination advances independently without emptying members or changing the shop selection", async () => {
  for (let index = 0; index < 21; index++)
    await pool.query(
      "INSERT INTO invitations(id,merchant_id,email,token_hash,role,permissions,expires_at,invited_by) VALUES($1,$2,$3,$4,'staff',ARRAY['catalogue'],clock_timestamp()+interval '48 hours',$5)",
      [
        randomUUID(),
        seedIds.merchantA,
        `pages-${index}@londos.invalid`,
        `fictional-hash-${randomUUID()}`,
        owner.userId,
      ],
    );
  const first = await readTeam(pool, owner, seedIds.merchantA);
  expect(first.invitations).toHaveLength(20);
  expect(first.pagination.invitations.next).toBe(true);
  const later = await readTeam(pool, owner, seedIds.merchantA, 0, { invitationsPage: 1 });
  expect(later.invitations).toHaveLength(1);
  expect(later.members).toEqual(first.members);
  expect(later.shops).toEqual(first.shops);
  expect(first.invitations.map((invitation) => invitation.id)).not.toContain(
    later.invitations[0]!.id,
  );
  expect(later.pagination).toMatchObject({
    members: { page: 0 },
    shops: { page: 0 },
    invitations: { page: 1, next: false },
  });
});
