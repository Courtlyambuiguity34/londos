import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "pg";
import type { Auth } from "../security/auth";
import { transaction } from "./pool";
import { requireDevelopmentDatabase } from "./development";
export const seedIds = {
  mallA: "10000000-0000-4000-8000-000000000001",
  mallB: "10000000-0000-4000-8000-000000000002",
  merchantA: "20000000-0000-4000-8000-000000000001",
  merchantB: "20000000-0000-4000-8000-000000000002",
  shopA: "30000000-0000-4000-8000-000000000001",
  shopB: "30000000-0000-4000-8000-000000000002",
};
export type SeedAccounts = Record<
  "ownerA" | "ownerB" | "staff" | "operator" | "invitee",
  { id: string; email: string; password: string }
>;
export async function seed(
  pool: Pool,
  authentication: Auth,
  directory = resolve(".local"),
): Promise<SeedAccounts> {
  await requireDevelopmentDatabase(pool);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = resolve(directory, "development-accounts.json");
  let accounts: SeedAccounts;
  try {
    accounts = JSON.parse(await readFile(file, "utf8")) as SeedAccounts;
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
    accounts = {} as SeedAccounts;
  }
  for (const name of ["ownerA", "ownerB", "staff", "operator", "invitee"] as const) {
    const email = `${name.toLowerCase()}@londos.example`;
    const existing = (await pool.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0];
    if (existing) {
      if (!accounts[name] || accounts[name].id !== existing.id)
        throw new Error(
          "Seed identity exists without its private local account file; recover explicitly instead of overwriting credentials.",
        );
      continue;
    }
    const password = randomBytes(24).toString("base64url");
    const result = await authentication.api.signUpEmail({
      body: { email, password, name: `Fictional ${name}` },
    });
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [result.user.id]);
    accounts[name] = { id: result.user.id, email, password };
    await writeFile(file, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  }
  await transaction(pool, async (client) => {
    await client.query(
      "INSERT INTO malls(id,name) VALUES($1,'Demo mall — central'),($2,'Demo mall — north') ON CONFLICT DO NOTHING",
      [seedIds.mallA, seedIds.mallB],
    );
    await client.query(
      "INSERT INTO merchants(id,name) VALUES($1,'Fictional Annette Merchant'),($2,'Fictional Merchant B') ON CONFLICT DO NOTHING",
      [seedIds.merchantA, seedIds.merchantB],
    );
    await client.query(
      "INSERT INTO memberships(merchant_id,user_id,role,permissions) VALUES($1,$3,'owner','{}'),($2,$4,'owner','{}'),($1,$5,'staff',ARRAY['catalogue']) ON CONFLICT DO NOTHING",
      [
        seedIds.merchantA,
        seedIds.merchantB,
        accounts.ownerA.id,
        accounts.ownerB.id,
        accounts.staff.id,
      ],
    );
    await client.query(
      "INSERT INTO operator_grants(user_id,permission) VALUES($1,'review'),($1,'jobs') ON CONFLICT DO NOTHING",
      [accounts.operator.id],
    );
    const states = [
      ["Annette Fashion House", "annette-fashion-house", "active", "active", "clear"],
      ["Merchant B Studio", "merchant-b-studio", "active", "active", "clear"],
      ["Unpublished Demo", "unpublished-demo", "unpublished", "pending", "clear"],
      ["Grace Demo", "grace-demo", "active", "grace", "clear"],
      ["Closed Demo", "closed-demo", "temporarily_closed", "closed", "clear"],
      ["Suspended Demo", "suspended-demo", "active", "active", "suspended"],
    ];
    for (const [index, row] of states.entries()) {
      const shopId = `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      const merchantId = index === 1 ? seedIds.merchantB : seedIds.merchantA;
      await client.query(
        "INSERT INTO shops(id,merchant_id,mall_id,name,slug) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [shopId, merchantId, index === 1 ? seedIds.mallB : seedIds.mallA, row[0], row[1]],
      );
      await client.query(
        "INSERT INTO shop_publication(shop_id,state) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [shopId, row[2]],
      );
      await client.query(
        "INSERT INTO tenancies(shop_id,state) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [shopId, row[3]],
      );
      await client.query(
        "INSERT INTO shop_moderation(shop_id,state) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [shopId, row[4]],
      );
    }
    for (const [index, name] of ["Dresses", "Shoes", "Handbags", "New Arrivals"].entries()) {
      const departmentId = `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      await client.query(
        "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [
          departmentId,
          seedIds.shopA,
          seedIds.merchantA,
          name,
          name.toLowerCase().replaceAll(" ", "-"),
          index,
        ],
      );
      await client.query(
        "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,price_minor,availability) VALUES($1,$2,$3,$4,'product',$5,$6,'UGX',$7,'available') ON CONFLICT DO NOTHING",
        [
          `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          seedIds.shopA,
          seedIds.merchantA,
          departmentId,
          `Fictional ${name} sample`,
          `sample-${index + 1}`,
          String(45000 + index * 10000),
        ],
      );
    }
    await client.query(
      "INSERT INTO staff_shop_grants(merchant_id,user_id,shop_id,permissions) VALUES($1,$2,$3,ARRAY['catalogue']) ON CONFLICT DO NOTHING",
      [seedIds.merchantA, accounts.staff.id, seedIds.shopA],
    );
  });
  return accounts;
}
