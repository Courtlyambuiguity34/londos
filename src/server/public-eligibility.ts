import type { Pool, PoolClient } from "pg";

// SQL aliases are fixed by server-owned queries, never supplied by a client.
// Due/grace retain browsing; closure/moderation override design independently.
export const eligibleStates =
  "p.state='active' AND t.state IN ('active','due','grace') AND m.state='clear' AND coalesce(o.paused,false)=false";
export const eligibilityJoins =
  "JOIN shop_publication p ON p.shop_id=s.id JOIN tenancies t ON t.shop_id=s.id JOIN shop_moderation m ON m.shop_id=s.id LEFT JOIN shop_operations o ON o.shop_id=s.id";
export async function eligibleShop(db: Pool | PoolClient, shopId: string) {
  return Boolean(
    (
      await db.query(
        `SELECT 1 FROM shops s ${eligibilityJoins} WHERE s.id=$1 AND ${eligibleStates}`,
        [shopId],
      )
    ).rowCount,
  );
}
