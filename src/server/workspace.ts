import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import { enqueue } from "./jobs/enqueue";
import { audit } from "./security/audit";
import { requireShop, sessionState, type Actor } from "./security/authorization";
import { AccessError } from "./security/errors";
import { categorySlug } from "./discovery";

export const profileChange = z
  .object({
    name: z.string().trim().min(1).max(120),
    version: z.number().int().positive(),
    category: categorySlug.optional(),
    tagline: z.string().trim().max(160).optional(),
  })
  .strict();
export async function listShops(pool: Pool, actor: Actor) {
  await sessionState(pool, actor);
  return (
    await pool.query(
      `SELECT s.id,s.merchant_id,s.name,s.slug,s.version,m.role FROM shops s
    JOIN memberships m ON m.merchant_id=s.merchant_id WHERE m.user_id=$1 AND m.status='active'
    AND (m.role='owner' OR ('catalogue'=ANY(m.permissions) AND EXISTS(SELECT 1 FROM staff_shop_grants g WHERE g.user_id=m.user_id AND g.shop_id=s.id AND 'catalogue'=ANY(g.permissions)))) ORDER BY s.name,s.id LIMIT 100`,
      [actor.userId],
    )
  ).rows;
}
export async function readShop(pool: Pool, actor: Actor, shopId: string) {
  return requireShop(pool, actor, shopId, "catalogue");
}
export async function changeProfile(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof profileChange>,
) {
  const value = profileChange.parse(input);
  return transaction(pool, async (client) => {
    const shop = await requireShop(client, actor, shopId, "catalogue");
    // Membership mutations use the same merchant lock: revocation cannot race a write.
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [shop.merchant_id]);
    await requireShop(client, actor, shopId, "catalogue");
    const result = await client.query(
      "UPDATE shops SET name=$3,version=version+1,updated_at=now(),category=coalesce($5,category),tagline=coalesce($6,tagline) WHERE id=$1 AND merchant_id=$2 AND version=$4 RETURNING id,name,version",
      [
        shopId,
        shop.merchant_id,
        value.name,
        value.version,
        value.category ?? null,
        value.tagline ?? null,
      ],
    );
    if (!result.rowCount) throw new AccessError(409, "stale_version");
    const updated = result.rows[0] as { id: string; name: string; version: number };
    await audit(client, actor, "shop.profile.changed", shopId, shop.merchant_id, {
      version: updated.version,
    });
    await enqueue(client, {
      kind: "shop.profile.changed",
      key: `shop-profile:${shopId}:${updated.version}`,
      merchantId: shop.merchant_id,
      shopId,
      payload: { shopId, version: updated.version },
    });
    return updated;
  });
}
