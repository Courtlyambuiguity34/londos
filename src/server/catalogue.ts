import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import { requireShop, requireOperatorShop, type Actor } from "./security/authorization";
import { audit } from "./security/audit";
import { AccessError } from "./security/errors";
import { catalogueSnapshot, journalChanges } from "./catalogue-journal";
import { catalogueFilters } from "../modules/catalogue-tools";
import { shopPhotoHealth } from "./shop-photo-health";

const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(80);
export const departmentInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug,
    position: z.number().int().min(0).max(1000000),
    archived: z.boolean(),
    version: z.number().int().min(0),
  })
  .strict();
export const productInput = z
  .object({
    departmentId: z.uuid(),
    kind: z.enum(["product", "service"]),
    name: z.string().trim().min(1).max(160),
    slug,
    description: z.string().trim().max(2000),
    currency: z.enum(["UGX", "USD", "KES", "EUR", "GBP"]),
    priceMinor: z
      .string()
      .regex(/^(0|[1-9][0-9]{0,19})$/)
      .nullable(),
    availability: z.enum(["available", "unavailable", "archived"]),
    position: z.number().int().min(0).max(1000000),
    mediaId: z.uuid().nullable(),
    version: z.number().int().min(0),
  })
  .strict();
export async function catalogueAccess(
  db: Pool | PoolClient,
  actor: Actor,
  shopId: string,
  permission: "catalogue" | "sensitive" = "catalogue",
  operator: "support" | "recovery" | null = null,
) {
  try {
    return await requireShop(db, actor, shopId, permission);
  } catch (error) {
    if (!(error instanceof AccessError) || error.status !== 404 || !operator) throw error;
    if (
      !(
        await db.query("SELECT 1 FROM operator_grants WHERE user_id=$1 AND permission=$2", [
          actor.userId,
          operator,
        ])
      ).rowCount
    )
      throw error;
    return requireOperatorShop(db, actor, shopId, operator);
  }
}
export async function catalogueLock(client: PoolClient, actor: Actor, shopId: string) {
  const shop = await requireShop(client, actor, shopId, "catalogue");
  await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [shop.merchant_id]);
  await requireShop(client, actor, shopId, "catalogue");
  return shop;
}
export async function readCatalogue(
  pool: Pool,
  actor: Actor,
  shopId: string,
  offset = 0,
  input: z.input<typeof catalogueFilters> = {},
) {
  await catalogueAccess(pool, actor, shopId, "catalogue", "support");
  const page = z.number().int().min(0).max(1000000).parse(offset);
  const filters = catalogueFilters.parse(input);
  const departments = (
    await pool.query(
      "SELECT id,name,slug,position,archived,version FROM departments WHERE shop_id=$1 AND deleted_at IS NULL ORDER BY position,id LIMIT 100",
      [shopId],
    )
  ).rows;
  const products = (
    await pool.query(
      `SELECT p.id,p.department_id,p.kind,p.name,p.slug,p.description,p.currency,p.price_minor::text,p.availability,p.position,p.version,pm.asset_id AS media_id FROM products p LEFT JOIN product_media pm ON pm.product_id=p.id WHERE p.shop_id=$1 AND p.deleted_at IS NULL
       AND ($3::text='' OR strpos(lower(p.name),lower($3))>0)
       AND ($4::uuid IS NULL OR p.department_id=$4)
       AND ($5::text='all' OR p.availability=$5)
       ORDER BY p.position,p.id LIMIT 21 OFFSET $2`,
      [shopId, page, filters.query, filters.departmentId, filters.availability],
    )
  ).rows;
  return {
    departments,
    products: products.slice(0, 20),
    offset: page,
    hasMore: products.length > 20,
    photoHealth: await shopPhotoHealth(pool, shopId),
    nextProductPosition: (
      await pool.query(
        "SELECT least(1000000,coalesce(max(position),-1)+1)::int AS position FROM products WHERE shop_id=$1 AND deleted_at IS NULL",
        [shopId],
      )
    ).rows[0].position as number,
  };
}
export async function saveDepartment(
  pool: Pool,
  actor: Actor,
  shopId: string,
  id: string | null,
  input: z.infer<typeof departmentInput>,
) {
  const v = departmentInput.parse(input);
  try {
    return await transaction(pool, (client) => mutateDepartment(client, actor, shopId, id, v));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      if ((error as { constraint?: string }).constraint === "department_name_unique")
        throw new AccessError(409, "department_name_in_use");
      throw new AccessError(409, "slug_in_use");
    }
    throw error;
  }
}

export async function mutateDepartment(
  client: PoolClient,
  actor: Actor,
  shopId: string,
  id: string | null,
  input: z.infer<typeof departmentInput>,
  options: { restore?: boolean; action?: "restored" | "reverted" } = {},
) {
  const v = departmentInput.parse(input);
  try {
    const shop = await catalogueLock(client, actor, shopId);
    const previous = id ? await catalogueSnapshot(client, "department", shopId, id) : null;
    if (id && !previous) throw new AccessError(404, "resource_unavailable");
    if (previous?.deletedAt && !options.restore)
      throw new AccessError(409, "catalogue_item_deleted");
    if (!id && v.version !== 0) throw new AccessError(409, "stale_version");
    if (
      (
        await client.query(
          "SELECT 1 FROM departments WHERE shop_id=$1 AND name_key=catalogue_department_name_key($2) AND deleted_at IS NULL AND ($3::uuid IS NULL OR id<>$3)",
          [shopId, v.name, id],
        )
      ).rowCount
    )
      throw new AccessError(409, "department_name_in_use");

    if (
      !id &&
      (
        await client.query(
          "SELECT count(*)::int AS count FROM departments WHERE shop_id=$1 AND deleted_at IS NULL",
          [shopId],
        )
      ).rows[0].count >= 100
    )
      throw new AccessError(422, "department_limit");
    if (id) {
      const old = await client.query("SELECT version FROM departments WHERE id=$1 AND shop_id=$2", [
        id,
        shopId,
      ]);
      if (!old.rowCount) throw new AccessError(404, "resource_unavailable");
      if (old.rows[0].version !== v.version) throw new AccessError(409, "stale_version");
      if (
        v.archived &&
        (
          await client.query(
            "SELECT 1 FROM products WHERE department_id=$1 AND deleted_at IS NULL AND availability<>'archived' LIMIT 1",
            [id],
          )
        ).rowCount
      )
        throw new AccessError(409, "department_contains_products");
    }
    const target = id ?? randomUUID();
    const result = id
      ? await client.query(
          "UPDATE departments SET name=$3,slug=$4,position=$5,archived=$6,deleted_at=NULL,deletion_batch=NULL,purged_at=NULL,version=version+1 WHERE id=$1 AND shop_id=$2 AND version=$7 AND (deleted_at IS NULL OR ($8::boolean AND purged_at IS NULL AND deleted_at>clock_timestamp()-interval '30 days')) RETURNING id,name,version",
          [
            target,
            shopId,
            v.name,
            v.slug,
            v.position,
            v.archived,
            v.version,
            options.restore ?? false,
          ],
        )
      : await client.query(
          "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position,archived) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,version",
          [target, shopId, shop.merchant_id, v.name, v.slug, v.position, v.archived],
        );
    if (!result.rowCount) throw new AccessError(409, "stale_version");
    await audit(client, actor, "catalogue.department.saved", target, shop.merchant_id, {
      version: result.rows[0].version,
    });
    await journalChanges(client, actor, shopId, shop.merchant_id, [
      {
        kind: "department",
        id: target,
        action: options.action ?? (id ? "updated" : "created"),
        before: previous,
        after: (await catalogueSnapshot(client, "department", shopId, target))!,
      },
    ]);
    return result.rows[0];
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      if ((error as { constraint?: string }).constraint === "department_name_unique")
        throw new AccessError(409, "department_name_in_use");
      throw new AccessError(409, "slug_in_use");
    }
    throw error;
  }
}

export async function saveProduct(
  pool: Pool,
  actor: Actor,
  shopId: string,
  id: string | null,
  input: z.infer<typeof productInput>,
) {
  const v = productInput.parse(input);
  try {
    return await transaction(pool, (client) => mutateProduct(client, actor, shopId, id, v));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      if ((error as { constraint?: string }).constraint === "department_name_unique")
        throw new AccessError(409, "department_name_in_use");
      throw new AccessError(409, "slug_in_use");
    }
    throw error;
  }
}

export async function mutateProduct(
  client: PoolClient,
  actor: Actor,
  shopId: string,
  id: string | null,
  input: z.infer<typeof productInput>,
  options: { restore?: boolean; action?: "restored" | "reverted" } = {},
) {
  const v = productInput.parse(input);
  try {
    const shop = await catalogueLock(client, actor, shopId);
    const previous = id ? await catalogueSnapshot(client, "product", shopId, id) : null;
    if (id && !previous) throw new AccessError(404, "resource_unavailable");
    if (previous?.deletedAt && !options.restore)
      throw new AccessError(409, "catalogue_item_deleted");
    if (!id && v.version !== 0) throw new AccessError(409, "stale_version");
    if (
      !id &&
      (
        await client.query(
          "SELECT count(*)::int AS count FROM products WHERE shop_id=$1 AND deleted_at IS NULL",
          [shopId],
        )
      ).rows[0].count >= 10000
    )
      throw new AccessError(422, "product_limit");
    if (
      !(
        await client.query(
          "SELECT 1 FROM departments WHERE id=$1 AND shop_id=$2 AND archived=false AND deleted_at IS NULL",
          [v.departmentId, shopId],
        )
      ).rowCount
    )
      throw new AccessError(404, "resource_unavailable");
    if (
      v.mediaId &&
      !(
        await client.query(
          "SELECT 1 FROM media_assets WHERE id=$1 AND shop_id=$2 AND state='ready' AND alt<>''",
          [v.mediaId, shopId],
        )
      ).rowCount
    )
      throw new AccessError(404, "resource_unavailable");
    if (id) {
      const old = await client.query("SELECT version FROM products WHERE id=$1 AND shop_id=$2", [
        id,
        shopId,
      ]);
      if (!old.rowCount) throw new AccessError(404, "resource_unavailable");
      if (old.rows[0].version !== v.version) throw new AccessError(409, "stale_version");
    }
    const target = id ?? randomUUID();
    const values = [
      target,
      shopId,
      shop.merchant_id,
      v.departmentId,
      v.kind,
      v.name,
      v.slug,
      v.description,
      v.currency,
      v.priceMinor,
      v.availability,
      v.position,
    ];
    const result = id
      ? await client.query(
          "UPDATE products SET department_id=$4,kind=$5,name=$6,slug=$7,description=$8,currency=$9,price_minor=$10,availability=$11,position=$12,deleted_at=NULL,deletion_batch=NULL,purged_at=NULL,version=version+1 WHERE id=$1 AND shop_id=$2 AND merchant_id=$3 AND version=$13 AND (deleted_at IS NULL OR ($14::boolean AND purged_at IS NULL AND deleted_at>clock_timestamp()-interval '30 days')) RETURNING id,name,version",
          [...values, v.version, options.restore ?? false],
        )
      : await client.query(
          "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,description,currency,price_minor,availability,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,name,version",
          values,
        );
    if (!result.rowCount) throw new AccessError(409, "stale_version");
    await client.query("DELETE FROM product_media WHERE product_id=$1", [target]);
    if (v.mediaId)
      await client.query(
        "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id) VALUES($1,$2,$3,$4)",
        [target, v.mediaId, shopId, shop.merchant_id],
      );
    await audit(client, actor, "catalogue.product.saved", target, shop.merchant_id, {
      version: result.rows[0].version,
    });
    await journalChanges(client, actor, shopId, shop.merchant_id, [
      {
        kind: "product",
        id: target,
        action: options.action ?? (id ? "updated" : "created"),
        before: previous,
        after: (await catalogueSnapshot(client, "product", shopId, target))!,
      },
    ]);
    return result.rows[0];
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      if ((error as { constraint?: string }).constraint === "department_name_unique")
        throw new AccessError(409, "department_name_in_use");
      throw new AccessError(409, "slug_in_use");
    }
    throw error;
  }
}
