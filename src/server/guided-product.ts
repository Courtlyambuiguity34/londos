import type { Pool } from "pg";
import { z } from "zod";
import {
  productInput,
  catalogueAccess,
  catalogueLock,
  mutateProduct,
  readCatalogue,
} from "./catalogue";
import { transaction } from "./db/pool";
import type { Actor } from "./security/authorization";
import { AccessError } from "./security/errors";

export const guidedProductInput = productInput
  .extend({ productId: z.uuid().nullable().default(null) })
  .strict();
export async function readGuidedProduct(pool: Pool, actor: Actor, shopId: string, id?: string) {
  await catalogueAccess(pool, actor, shopId);
  const catalogue = await readCatalogue(pool, actor, shopId);
  if (!id) return { catalogue, product: null };
  const product = (
    await pool.query(
      `SELECT q.id,q.name,q.slug,q.kind,q.description,q.currency,q.price_minor::text,q.availability,q.department_id,q.position,q.version,
      CASE WHEN EXISTS(SELECT 1 FROM media_assets a WHERE a.id=pm.asset_id AND a.shop_id=q.shop_id AND a.merchant_id=q.merchant_id AND a.state='ready' AND a.created_by IS NOT NULL AND a.alt<>'' AND a.width>0 AND a.height>0 AND (SELECT count(*) FROM media_blobs b WHERE b.asset_id=a.id AND b.variant IN ('thumbnail','card','display'))=3) THEN pm.asset_id ELSE NULL END AS media_id
    FROM products q LEFT JOIN product_media pm ON pm.product_id=q.id WHERE q.id=$1 AND q.shop_id=$2 AND q.deleted_at IS NULL`,
      [z.uuid().parse(id), shopId],
    )
  ).rows[0];
  if (!product) throw new AccessError(404, "resource_unavailable");
  return { catalogue, product };
}
export async function saveGuidedProduct(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.input<typeof guidedProductInput>,
) {
  const { productId, ...value } = guidedProductInput.parse(input);
  return transaction(pool, async (client) => {
    await catalogueLock(client, actor, shopId);
    if (value.kind === "product" && value.availability !== "archived" && !value.mediaId)
      throw new AccessError(422, "product_photo_required");
    if (
      value.mediaId &&
      !(
        await client.query(
          `SELECT 1 FROM media_assets a WHERE a.id=$1 AND a.shop_id=$2 AND a.state='ready' AND a.created_by IS NOT NULL AND a.alt<>'' AND a.width>0 AND a.height>0 AND (SELECT count(*) FROM media_blobs b WHERE b.asset_id=a.id AND b.variant IN ('thumbnail','card','display'))=3`,
          [value.mediaId, shopId],
        )
      ).rowCount
    )
      throw new AccessError(422, "photo_not_ready");
    return mutateProduct(client, actor, shopId, productId, value);
  });
}
