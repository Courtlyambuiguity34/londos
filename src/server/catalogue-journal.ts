import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Actor } from "./security/authorization";
import type { CatalogueKind, CatalogueSnapshot } from "../modules/catalogue-history";

export function snapshotRow(row: Record<string, unknown>, kind: CatalogueKind): CatalogueSnapshot {
  const data =
    kind === "department"
      ? {
          name: row.name as string,
          slug: row.slug,
          position: row.position,
          archived: row.archived,
          version: row.version as number,
        }
      : {
          name: row.name as string,
          slug: row.slug,
          departmentId: row.department_id,
          kind: row.kind,
          description: row.description,
          currency: row.currency,
          priceMinor: row.price_minor,
          availability: row.availability,
          position: row.position,
          mediaId: row.media_id ?? null,
          version: row.version as number,
        };
  const timestamp = (value: unknown) =>
    value instanceof Date ? value.toISOString() : value ? String(value) : null;
  return {
    data,
    deletedAt: timestamp(row.deleted_at),
    deletionBatch: row.deletion_batch as string | null,
    purgedAt: timestamp(row.purged_at),
  };
}
export async function catalogueSnapshot(
  db: PoolClient,
  kind: CatalogueKind,
  shopId: string,
  id: string,
) {
  const rows =
    kind === "department"
      ? await db.query("SELECT * FROM departments WHERE shop_id=$1 AND id=$2", [shopId, id])
      : await db.query(
          "SELECT p.*,pm.asset_id AS media_id FROM products p LEFT JOIN product_media pm ON pm.product_id=p.id WHERE p.shop_id=$1 AND p.id=$2",
          [shopId, id],
        );
  return rows.rows[0] ? snapshotRow(rows.rows[0], kind) : null;
}
export type CatalogueChange = {
  kind: CatalogueKind;
  id: string;
  action: string;
  before: CatalogueSnapshot | null;
  after: CatalogueSnapshot;
  batch?: string;
};
export async function journalChanges(
  db: PoolClient,
  actor: Actor,
  shopId: string,
  merchantId: string,
  changes: CatalogueChange[],
) {
  if (!changes.length) return;
  await db.query(
    `INSERT INTO catalogue_history(id,shop_id,merchant_id,entity_kind,entity_id,action,actor_id,batch_id,before_state,after_state)
    SELECT x.id,$2,$3,x.kind,x.entity_id,x.action,$4,x.batch,x.before_state,x.after_state
    FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,kind text,entity_id uuid,action text,batch uuid,before_state jsonb,after_state jsonb)`,
    [
      JSON.stringify(
        changes.map((change) => ({
          id: randomUUID(),
          kind: change.kind,
          entity_id: change.id,
          action: change.action,
          batch: change.batch ?? null,
          before_state: change.before,
          after_state: change.after,
        })),
      ),
      shopId,
      merchantId,
      actor.userId,
    ],
  );
}
