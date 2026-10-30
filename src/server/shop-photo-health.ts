import type { Pool, PoolClient } from "pg";

export type PhotoHealth = {
  products: number;
  pictured: number;
  missingProductCount: number;
  missingProducts: { id: string; name: string }[];
  missingDepartments: { id: string; name: string }[];
};
// Internal reader: callers must authorise the shop before using this summary.
export async function shopPhotoHealth(db: Pool | PoolClient, shopId: string): Promise<PhotoHealth> {
  const row = (
    await db.query(
      `WITH items AS (
    SELECT q.id,q.name,q.kind,q.department_id,EXISTS(
      SELECT 1 FROM product_media pm JOIN media_assets a ON a.id=pm.asset_id AND a.shop_id=q.shop_id AND a.merchant_id=q.merchant_id
      WHERE pm.product_id=q.id AND pm.shop_id=q.shop_id AND a.state='ready' AND a.created_by IS NOT NULL AND a.alt<>'' AND a.width>0 AND a.height>0
      AND (SELECT count(*) FROM media_blobs b WHERE b.asset_id=a.id AND b.variant IN ('thumbnail','card','display'))=3
    ) AS pictured FROM products q JOIN departments d ON d.id=q.department_id AND d.shop_id=q.shop_id
    WHERE q.shop_id=$1 AND q.deleted_at IS NULL AND q.availability<>'archived' AND d.archived=false AND d.deleted_at IS NULL
  ) SELECT (SELECT count(*)::int FROM items) AS products,
    (SELECT count(*)::int FROM items WHERE pictured) AS pictured,
    (SELECT count(*)::int FROM items WHERE kind='product' AND NOT pictured) AS "missingProductCount",
    coalesce((SELECT json_agg(x) FROM (SELECT id,name FROM items WHERE kind='product' AND NOT pictured ORDER BY name,id LIMIT 8) x),'[]') AS "missingProducts",
    coalesce((SELECT json_agg(x) FROM (SELECT d.id,d.name FROM departments d WHERE d.shop_id=$1 AND d.archived=false AND d.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM items i WHERE i.department_id=d.id AND i.pictured) ORDER BY d.position,d.id LIMIT 100) x),'[]') AS "missingDepartments"`,
      [shopId],
    )
  ).rows[0];
  return row as PhotoHealth;
}
