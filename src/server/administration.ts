import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import { localLifecycle, reasonInput, currentVersion } from "./lifecycle-common";
import { audit } from "./security/audit";
import {
  requireOperator,
  requireShop,
  requireMerchant,
  type Actor,
} from "./security/authorization";
import { AccessError } from "./security/errors";

export const addressInput = z
  .object({
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .min(3)
      .max(80)
      .refine((value) => !z.uuid().safeParse(value).success),
    version: z.number().int().positive(),
    reason: reasonInput,
    confirm: z.literal(true),
  })
  .strict();
export const claimOperationsInput = z
  .object({ reason: reasonInput, confirm: z.literal(true) })
  .strict();
export const operationsInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("move"),
      mallId: z.uuid(),
      version: z.number().int().positive(),
      reason: reasonInput,
      confirm: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.enum(["pause", "resume"]),
      version: z.number().int().positive(),
      reason: reasonInput,
      confirm: z.literal(true),
    })
    .strict(),
]);
const pageInput = z.number().int().min(0).max(500);
export async function changeAddress(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof addressInput>,
) {
  localLifecycle();
  const v = addressInput.parse(input);
  try {
    return await transaction(pool, async (client) => {
      const first = await requireShop(client, actor, shopId, "sensitive");
      await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
      const current = await requireShop(client, actor, shopId, "sensitive");
      await requireMerchant(client, actor, current.merchant_id, "membership");
      currentVersion(current.version, v.version);
      const row = (
        await client.query(
          "UPDATE shops SET slug=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,slug,version",
          [shopId, v.slug],
        )
      ).rows[0];
      await audit(client, actor, "shop.address.changed", shopId, current.merchant_id, {
        from: current.slug,
        to: v.slug,
        reason: v.reason,
      });
      return row as { id: string; slug: string; version: number };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new AccessError(409, "address_unavailable");
    throw error;
  }
}
async function notSelf(client: Pool | PoolClient, actor: Actor, merchantId: string) {
  if (
    (
      await client.query(
        "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND status='active'",
        [merchantId, actor.userId],
      )
    ).rowCount
  )
    throw new AccessError(403, "conflict_of_interest");
}
export async function operationsAccess(
  db: Pool | PoolClient,
  actor: Actor,
  shopId: string,
  fresh = false,
) {
  localLifecycle();
  await requireOperator(db, actor, "operations", fresh);
  const shop = (
    await db.query(
      "SELECT s.id,s.merchant_id FROM shops s JOIN operator_operations_scopes sc ON sc.shop_id=s.id AND sc.user_id=$2 WHERE s.id=$1",
      [shopId, actor.userId],
    )
  ).rows[0] as { id: string; merchant_id: string } | undefined;
  if (!shop) throw new AccessError(404, "resource_unavailable");
  await notSelf(db, actor, shop.merchant_id);
  return shop;
}
export type OperationsView = {
  shop: {
    id: string;
    merchant_id: string;
    name: string;
    slug: string;
    version: number;
    mall_id: string;
    mall_name: string;
    publication: string;
    tenancy: string;
    moderation: string;
    paused: boolean;
  };
  history: { action: string; created_at: Date | string; details: { reason?: string } }[];
};
export async function claimOperations(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof claimOperationsInput>,
) {
  localLifecycle();
  const v = claimOperationsInput.parse(input);
  return transaction(pool, async (client) => {
    await requireOperator(client, actor, "operations", true);
    const first = (await client.query("SELECT merchant_id FROM shops WHERE id=$1", [shopId]))
      .rows[0];
    if (!first) throw new AccessError(404, "resource_unavailable");
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
    await requireOperator(client, actor, "operations", true);
    await notSelf(client, actor, first.merchant_id);
    const scope = await client.query(
      "INSERT INTO operator_operations_scopes(user_id,shop_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING shop_id",
      [actor.userId, shopId],
    );
    if (scope.rowCount)
      await audit(client, actor, "shop.operations.claimed", shopId, first.merchant_id, {
        reason: v.reason,
      });
    return { shopId };
  });
}
export async function mallOccupancy(pool: Pool, actor: Actor, page = 0) {
  pageInput.parse(page);
  await requireOperator(pool, actor, "operations");
  return (
    await pool.query(
      "SELECT m.id,m.name,m.planning_capacity,count(s.id)::int AS occupied,count(s.id) FILTER(WHERE p.state='active')::int AS published FROM malls m LEFT JOIN shops s ON s.mall_id=m.id LEFT JOIN shop_publication p ON p.shop_id=s.id GROUP BY m.id ORDER BY m.created_at,m.id LIMIT 20 OFFSET $1",
      [page * 20],
    )
  ).rows as {
    id: string;
    name: string;
    planning_capacity: number;
    occupied: number;
    published: number;
  }[];
}
export async function operationsQueue(pool: Pool, actor: Actor, page = 0) {
  pageInput.parse(page);
  await requireOperator(pool, actor, "operations");
  return (
    await pool.query(
      "SELECT s.id,s.name,s.slug,t.state AS tenancy,coalesce(o.paused,false) AS paused,EXISTS(SELECT 1 FROM operator_operations_scopes sc WHERE sc.shop_id=s.id AND sc.user_id=$1) AS claimed FROM shops s JOIN tenancies t ON t.shop_id=s.id LEFT JOIN shop_operations o ON o.shop_id=s.id WHERE NOT EXISTS(SELECT 1 FROM memberships g WHERE g.merchant_id=s.merchant_id AND g.user_id=$1 AND g.status='active') ORDER BY s.created_at DESC,s.id LIMIT 20 OFFSET $2",
      [actor.userId, page * 20],
    )
  ).rows as {
    id: string;
    name: string;
    slug: string;
    tenancy: string;
    paused: boolean;
    claimed: boolean;
  }[];
}
export async function readOperations(
  pool: Pool,
  actor: Actor,
  shopId: string,
): Promise<OperationsView> {
  return transaction(pool, async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await operationsAccess(client, actor, shopId);
    const shop = (
      await client.query(
        "SELECT s.id,s.merchant_id,s.name,s.slug,s.version,s.mall_id,ml.name AS mall_name,p.state AS publication,t.state AS tenancy,m.state AS moderation,coalesce(o.paused,false) AS paused FROM shops s JOIN malls ml ON ml.id=s.mall_id JOIN shop_publication p ON p.shop_id=s.id JOIN tenancies t ON t.shop_id=s.id JOIN shop_moderation m ON m.shop_id=s.id LEFT JOIN shop_operations o ON o.shop_id=s.id WHERE s.id=$1",
        [shopId],
      )
    ).rows[0];
    const history = (
      await client.query(
        "SELECT action,created_at,details FROM audit_events WHERE merchant_id=$1 AND resource_id=$2 AND action LIKE 'shop.operations.%' ORDER BY created_at DESC,id DESC LIMIT 20",
        [shop.merchant_id, shopId],
      )
    ).rows;
    return { shop, history };
  });
}
export async function commandOperations(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof operationsInput>,
) {
  const v = operationsInput.parse(input);
  return transaction(pool, async (client) => {
    const first = await operationsAccess(client, actor, shopId, true);
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
    if (v.action === "move")
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('londos:mall-capacity',0))",
      );
    await operationsAccess(client, actor, shopId, true);
    const shop = (await client.query("SELECT version,mall_id FROM shops WHERE id=$1", [shopId]))
      .rows[0];
    currentVersion(shop.version, v.version);
    if (v.action === "move") {
      const mall = (
        await client.query("SELECT id,planning_capacity FROM malls WHERE id=$1 FOR UPDATE", [
          v.mallId,
        ])
      ).rows[0];
      if (!mall) throw new AccessError(404, "resource_unavailable");
      if (
        shop.mall_id !== mall.id &&
        (await client.query("SELECT count(*)::int AS n FROM shops WHERE mall_id=$1", [mall.id]))
          .rows[0].n >= mall.planning_capacity
      )
        throw new AccessError(409, "mall_at_capacity");
      await client.query("UPDATE shops SET mall_id=$2 WHERE id=$1", [shopId, mall.id]);
    } else {
      await client.query(
        "INSERT INTO shop_operations(shop_id,merchant_id,paused,reason,changed_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(shop_id) DO UPDATE SET paused=excluded.paused,reason=excluded.reason,changed_by=excluded.changed_by,changed_at=now()",
        [shopId, first.merchant_id, v.action === "pause", v.reason, actor.userId],
      );
    }
    const row = (
      await client.query(
        "UPDATE shops SET version=version+1,updated_at=now() WHERE id=$1 RETURNING version",
        [shopId],
      )
    ).rows[0];
    await audit(client, actor, `shop.operations.${v.action}`, shopId, first.merchant_id, {
      reason: v.reason,
      ...(v.action === "move" ? { from: shop.mall_id, to: v.mallId } : {}),
    });
    // A target mall lock can wait after the earlier merchant/capacity checks.
    await operationsAccess(client, actor, shopId, true);
    return { version: row.version as number };
  });
}
export async function rentExceptions(pool: Pool, actor: Actor, page = 0) {
  pageInput.parse(page);
  await requireOperator(pool, actor, "finance");
  return (
    await pool.query(
      "SELECT i.id,rs.reference,i.currency,i.amount_minor::text,coalesce(c.credit,0)::text AS credited_minor,a.business_name,rs.finalized FROM invoices i JOIN rent_invoice_state rs ON rs.invoice_id=i.id JOIN applications a ON a.id=i.application_id JOIN operator_application_scopes sc ON sc.application_id=a.id AND sc.user_id=$1 AND sc.permission='finance' LEFT JOIN LATERAL(SELECT sum(e.amount_minor) AS credit FROM rent_events e WHERE e.invoice_id=i.id)c ON true WHERE coalesce(c.credit,0)<i.amount_minor AND NOT EXISTS(SELECT 1 FROM memberships g WHERE g.merchant_id=i.merchant_id AND g.user_id=$1 AND g.status='active') ORDER BY rs.finalized DESC,i.created_at,i.id LIMIT 20 OFFSET $2",
      [actor.userId, page * 20],
    )
  ).rows as {
    id: string;
    reference: string;
    currency: string;
    amount_minor: string;
    credited_minor: string;
    business_name: string;
    finalized: boolean;
  }[];
}
