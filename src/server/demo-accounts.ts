import type { Pool } from "pg";
import { z } from "zod";
import { coreConfig } from "./config";
import { transaction } from "./db/pool";
import { requireOperator, type Actor } from "./security/authorization";
import { AccessError } from "./security/errors";
import { audit } from "./security/audit";
import { currentVersion } from "./lifecycle-common";

export const retireDemoInput = z
  .object({
    version: z.number().int().positive(),
    reason: z.string().trim().min(5).max(500),
    confirm: z.literal(true),
  })
  .strict();
const cursor = z.string().min(1).max(128).nullable();
function local() {
  if (!coreConfig().localAdapters) throw new AccessError(403, "development_accounts_only");
}
export type DemoAccount = {
  user_id: string;
  label: string;
  shop_id: string;
  shop_name: string;
  version: number;
  retired_at: Date | null;
};
export async function readDemoAccounts(pool: Pool, actor: Actor, after: string | null = null) {
  local();
  cursor.parse(after);
  return transaction(pool, async (db) => {
    await requireOperator(db, actor, "operations", true);
    await db.query("SET LOCAL statement_timeout='2000ms'");
    const rows = (
      await db.query(
        "SELECT d.user_id,d.label,d.shop_id,s.name AS shop_name,d.version,d.retired_at FROM demo_accounts d JOIN shops s ON s.id=d.shop_id AND s.merchant_id=d.merchant_id WHERE d.user_id>$1 ORDER BY d.user_id LIMIT 21",
        [after ?? ""],
      )
    ).rows as DemoAccount[];
    await requireOperator(db, actor, "operations", true);
    return {
      accounts: rows.slice(0, 20),
      nextAfter: rows.length > 20 ? rows[19]!.user_id : null,
      evidenceKind: "demonstration-only" as const,
    };
  });
}
export async function retireDemoAccount(
  pool: Pool,
  actor: Actor,
  userId: string,
  input: z.infer<typeof retireDemoInput>,
) {
  local();
  z.string().min(1).max(128).parse(userId);
  const v = retireDemoInput.parse(input);
  return transaction(pool, async (db) => {
    await db.query("SET LOCAL statement_timeout='5000ms'");
    await requireOperator(db, actor, "operations", true);
    const first = (
      await db.query("SELECT merchant_id FROM demo_accounts WHERE user_id=$1", [userId])
    ).rows[0];
    if (!first) throw new AccessError(404, "resource_unavailable");
    await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
    // Freeze both operator and target identity before the final authorization check.
    await db.query('SELECT id FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [
      [actor.userId, userId],
    ]);
    await requireOperator(db, actor, "operations", true);
    const account = (
      await db.query("SELECT * FROM demo_accounts WHERE user_id=$1 FOR UPDATE", [userId])
    ).rows[0];
    if (
      actor.userId === userId ||
      (
        await db.query(
          "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND status='active'",
          [account.merchant_id, actor.userId],
        )
      ).rowCount
    )
      throw new AccessError(403, "conflict_of_interest");
    if (account.retired_at) return { retired: true, version: account.version as number };
    currentVersion(account.version, v.version);
    await db.query(
      'UPDATE "user" SET demo_retired=true,"emailVerified"=false,auth_epoch=gen_random_uuid() WHERE id=$1',
      [userId],
    );
    await db.query('DELETE FROM session WHERE "userId"=$1', [userId]);
    await db.query("DELETE FROM verification WHERE value=$1 AND identifier LIKE '2fa-%'", [userId]);
    // Preserve the last-owner invariant and business ownership history. The
    // retired identity cannot obtain a usable session; staff grants are revoked.
    await db.query("UPDATE memberships SET status='revoked' WHERE user_id=$1 AND role='staff'", [
      userId,
    ]);
    // Preserve records and obligations; close every shop owned by the demo merchant.
    await db.query(
      "UPDATE shop_publication p SET state='archived',version=p.version+1 FROM shops s WHERE s.id=p.shop_id AND s.merchant_id=$1 AND p.state<>'archived'",
      [account.merchant_id],
    );
    await db.query("UPDATE shops SET version=version+1,updated_at=now() WHERE merchant_id=$1", [
      account.merchant_id,
    ]);
    const result = (
      await db.query(
        "UPDATE demo_accounts SET retired_at=clock_timestamp(),version=version+1 WHERE user_id=$1 RETURNING version",
        [userId],
      )
    ).rows[0];
    await audit(db, actor, "demo.account.retired", userId, account.merchant_id, {
      reason: v.reason,
      cohortId: account.cohort_id,
    });
    return { retired: true, version: result.version as number };
  });
}
