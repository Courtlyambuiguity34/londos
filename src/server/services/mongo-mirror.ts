import type { Db } from "mongodb";
import type { Pool } from "pg";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eligibilityJoins, eligibleStates } from "../public-eligibility";
import type { CloudinaryPublicCopy } from "./cloudinary";
const shopIds = z
  .array(z.uuid())
  .min(1)
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length);
type ShopCopy = {
  _id: string;
  format: "londos-public-copy-v1";
  copiedAt: string;
  generation: string;
  shop: { id: string; name: string; slug: string; category: string; tagline: string };
  departments: { id: string; name: string; slug: string }[];
  products: {
    id: string;
    department_id: string;
    name: string;
    slug: string;
    kind: string;
    currency: string;
    price_minor: string | null;
    availability: string;
  }[];
  images: Awaited<ReturnType<CloudinaryPublicCopy["upload"]>>[];
  authority: "PostgreSQL remains canonical; this copy is not a migration or automatic failover";
};
export async function copyPublicCatalogue(
  pool: Pool,
  mongo: Db,
  ids: string[],
  images: Pick<CloudinaryPublicCopy, "upload">,
  signal: AbortSignal,
) {
  shopIds.parse(ids);
  const db = await pool.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await db.query("SET LOCAL statement_timeout='2000ms'");
    const captures: { document: ShopCopy; assets: { id: string; bytes: Buffer }[] }[] = [];
    for (const id of ids) {
      signal.throwIfAborted();
      const shop = (
        await db.query(
          `SELECT s.id,s.name,s.slug,s.category,s.tagline FROM shops s ${eligibilityJoins} JOIN shop_designs sd ON sd.shop_id=s.id AND sd.published_id IS NOT NULL WHERE s.id=$1 AND ${eligibleStates}`,
          [id],
        )
      ).rows[0];
      if (!shop) throw new Error("public_shop_unavailable");
      const departments = (
        await db.query(
          "SELECT id,name,slug FROM departments WHERE shop_id=$1 AND archived=false ORDER BY id LIMIT 51",
          [id],
        )
      ).rows;
      const products = (
        await db.query(
          "SELECT p.id,p.department_id,p.name,p.slug,p.kind,p.currency,p.price_minor::text,p.availability FROM products p JOIN departments d ON d.id=p.department_id AND d.shop_id=p.shop_id AND d.archived=false WHERE p.shop_id=$1 AND p.availability<>'archived' ORDER BY p.id LIMIT 1001",
          [id],
        )
      ).rows;
      const assets = (
        await db.query(
          "SELECT DISTINCT a.id,b.bytes FROM products p JOIN product_media pm ON pm.product_id=p.id AND pm.shop_id=p.shop_id JOIN media_assets a ON a.id=pm.asset_id AND a.shop_id=p.shop_id JOIN media_blobs b ON b.asset_id=a.id AND b.variant='display' JOIN departments d ON d.id=p.department_id AND d.archived=false WHERE p.shop_id=$1 AND p.availability<>'archived' AND a.state='ready' AND a.created_by IS NOT NULL ORDER BY a.id LIMIT 101",
          [id],
        )
      ).rows as { id: string; bytes: Buffer }[];
      if (departments.length > 50 || products.length > 1000 || assets.length > 100)
        throw new Error("public_copy_budget_exceeded");
      captures.push({
        document: {
          _id: id,
          format: "londos-public-copy-v1",
          copiedAt: new Date().toISOString(),
          generation: randomUUID(),
          shop,
          departments,
          products,
          images: [],
          authority:
            "PostgreSQL remains canonical; this copy is not a migration or automatic failover",
        },
        assets,
      });
    }
    await db.query("COMMIT");
    // No external call holds a PostgreSQL snapshot or exports evidence/account/customer data.
    for (const capture of captures) {
      for (const a of capture.assets) {
        signal.throwIfAborted();
        capture.document.images.push(await images.upload(a.id, a.bytes, signal));
      }
      signal.throwIfAborted();
      // Recheck current eligibility immediately before copying the publicly visible data.
      const publicNow = await pool.query(
        `SELECT s.id FROM shops s ${eligibilityJoins} WHERE s.id=$1 AND ${eligibleStates}`,
        [capture.document._id],
      );
      if (!publicNow.rowCount) throw new Error("public_shop_changed");
      await mongo
        .collection<ShopCopy>("londos_public_copies")
        .replaceOne({ _id: capture.document._id }, capture.document, { upsert: true });
    }
    return {
      copiedShops: captures.length,
      products: captures.reduce((n, c) => n + c.document.products.length, 0),
      images: captures.reduce((n, c) => n + c.document.images.length, 0),
      canonicalDatabase: "postgresql",
      migrationPerformed: false,
      automaticFailover: false,
    };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}
export async function readPublicCopy(pool: Pool, mongo: Db, id: string) {
  z.uuid().parse(id);
  const current = await pool.query(
    `SELECT s.id FROM shops s ${eligibilityJoins} WHERE s.id=$1 AND ${eligibleStates}`,
    [id],
  );
  if (!current.rowCount) throw new Error("public_shop_unavailable");
  const copy = await mongo.collection<ShopCopy>("londos_public_copies").findOne({ _id: id });
  if (!copy) throw new Error("public_copy_unavailable");
  return copy;
}
