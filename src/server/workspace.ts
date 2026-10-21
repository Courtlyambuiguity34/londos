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

export async function readSetup(pool: Pool, actor: Actor, shopId: string) {
  return transaction(pool, async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const shop = await requireShop(client, actor, shopId, "catalogue");
    const row = (
      await client.query(
        "SELECT g.role,p.state AS publication,t.state AS tenancy,m.state AS moderation,coalesce(o.paused,false) AS paused,EXISTS(SELECT 1 FROM departments d WHERE d.shop_id=s.id AND d.archived=false) AS departments,EXISTS(SELECT 1 FROM products q WHERE q.shop_id=s.id AND q.availability<>'archived') AS products,(SELECT count(*)::int FROM (SELECT q.id FROM products q JOIN departments d ON d.id=q.department_id AND d.shop_id=q.shop_id WHERE q.shop_id=s.id AND q.availability<>'archived' AND d.archived=false LIMIT 3) ready) AS product_count,EXISTS(SELECT 1 FROM shop_contacts c WHERE c.shop_id=s.id AND (c.phone<>'' OR c.whatsapp<>'' OR c.website<>'' OR c.enquiries_enabled)) AS contacts,EXISTS(SELECT 1 FROM shop_designs sd WHERE sd.shop_id=s.id AND sd.draft_id IS NOT NULL) AS design FROM shops s JOIN memberships g ON g.merchant_id=s.merchant_id AND g.user_id=$2 AND g.status='active' JOIN shop_publication p ON p.shop_id=s.id JOIN tenancies t ON t.shop_id=s.id JOIN shop_moderation m ON m.shop_id=s.id LEFT JOIN shop_operations o ON o.shop_id=s.id WHERE s.id=$1",
        [shopId, actor.userId],
      )
    ).rows[0] as {
      role: string;
      publication: string;
      tenancy: string;
      moderation: string;
      paused: boolean;
      departments: boolean;
      products: boolean;
      product_count: number;
      contacts: boolean;
      design: boolean;
    };
    return { ...row, shop };
  });
}
