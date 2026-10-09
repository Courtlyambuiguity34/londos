import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { z } from "zod";
import type { Auth } from "../security/auth";
import { transaction } from "./pool";
import { requireDevelopmentDatabase } from "./development";

export const demoCohortId = "d1300000-0000-4000-8000-000000000000";
export const demoMallId = "d1300000-0000-4000-8000-000000000001";
const stored = z
  .array(
    z
      .object({
        id: z.string().min(1).max(128),
        email: z.email(),
        password: z.string().min(32).max(128),
      })
      .strict(),
  )
  .max(20);
export async function seedDemonstration(
  pool: Pool,
  authentication: Auth,
  count = 12,
  directory = resolve(".local"),
) {
  await requireDevelopmentDatabase(pool);
  z.number().int().min(10).max(20).parse(count);
  await mkdir(directory, { mode: 0o700, recursive: true });
  const file = resolve(directory, "demonstration-accounts.json");
  let accounts: z.infer<typeof stored> = [];
  try {
    const info = await lstat(file);
    if (!info.isFile() || (info.mode & 0o077) !== 0)
      throw new Error("Demo credentials require a private regular file");
    accounts = stored.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
  const categories = ["fashion", "electronics", "beauty", "food", "home", "services"];
  for (let index = 1; index <= count; index++) {
    const suffix = String(index).padStart(2, "0"),
      email = `demo${suffix}@londos.invalid`,
      label = `Fictional pilot merchant ${suffix}`;
    let account = accounts.find((a) => a.email === email);
    const existing = (await pool.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0];
    if (existing) {
      if (!account || account.id !== existing.id)
        throw new Error("Existing demonstration credentials must be recovered, not overwritten");
    } else {
      if (account)
        throw new Error("Stored demonstration identity is missing; investigate before reseeding");
      const password = randomBytes(32).toString("base64url");
      const result = await authentication.api.signUpEmail({
        body: { email, password, name: label },
      });
      account = { id: result.user.id, email, password };
      accounts.push(account);
      await writeFile(file, JSON.stringify(accounts, null, 2), { flag: "w", mode: 0o600 });
    }
    const userId = account.id,
      tail = String(index).padStart(12, "0"),
      merchantId = `d1310000-0000-4000-8000-${tail}`,
      shopId = `d1320000-0000-4000-8000-${tail}`;
    await transaction(pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('londos:demo-seed',0))");
      if (
        (
          await db.query(
            "SELECT 1 FROM demo_accounts WHERE user_id=$1 AND retired_at IS NOT NULL",
            [userId],
          )
        ).rowCount
      )
        return;
      await db.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1 AND demo_retired=false', [
        userId,
      ]);
      await db.query(
        "INSERT INTO malls(id,name,planning_capacity) VALUES($1,'Fictional pilot demonstration',20) ON CONFLICT DO NOTHING",
        [demoMallId],
      );
      await db.query("INSERT INTO merchants(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING", [
        merchantId,
        label,
      ]);
      await db.query(
        "INSERT INTO memberships(merchant_id,user_id,role,permissions) VALUES($1,$2,'owner','{}') ON CONFLICT DO NOTHING",
        [merchantId, userId],
      );
      await db.query(
        "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category,tagline) VALUES($1,$2,$3,$4,$5,$6,'Demonstration only — no real business') ON CONFLICT DO NOTHING",
        [
          shopId,
          merchantId,
          demoMallId,
          `Demo ${suffix} shop`,
          `fictional-pilot-${suffix}`,
          categories[(index - 1) % categories.length],
        ],
      );
      await db.query(
        "INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished') ON CONFLICT DO NOTHING",
        [shopId],
      );
      await db.query(
        "INSERT INTO tenancies(shop_id,state) VALUES($1,'pending') ON CONFLICT DO NOTHING",
        [shopId],
      );
      await db.query(
        "INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear') ON CONFLICT DO NOTHING",
        [shopId],
      );
      await db.query(
        "INSERT INTO demo_accounts(user_id,cohort_id,merchant_id,shop_id,label) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [userId, demoCohortId, merchantId, shopId, label],
      );
    });
  }
  return {
    cohortId: demoCohortId,
    registered: (
      await pool.query("SELECT count(*)::int AS count FROM demo_accounts WHERE cohort_id=$1", [
        demoCohortId,
      ])
    ).rows[0].count as number,
    credentialsFile: file,
    evidenceKind: "demonstration-only",
    realMerchants: 0,
    financialCreditsCreated: 0,
  };
}
