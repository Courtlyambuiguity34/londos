import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  catalogueConfirmation,
  catalogueHistoryCommand,
  type CatalogueKind,
  type CatalogueSnapshot,
} from "../modules/catalogue-history";
import { transaction } from "./db/pool";
import {
  catalogueLock,
  departmentInput,
  productInput,
  mutateDepartment,
  mutateProduct,
} from "./catalogue";
import {
  catalogueSnapshot,
  journalChanges,
  snapshotRow,
  type CatalogueChange,
} from "./catalogue-journal";
import { requireShop, type Actor } from "./security/authorization";
import { AccessError } from "./security/errors";
import { audit } from "./security/audit";

const page = z.coerce.number().int().min(0).max(1000000);
export async function readCatalogueHistory(
  pool: Pool,
  actor: Actor,
  shopId: string,
  offset = 0,
  deletedOffset = 0,
) {
  page.parse(offset);
  page.parse(deletedOffset);
  return transaction(pool, async (db) => {
    await requireShop(db, actor, shopId, "catalogue");
    const history = (
      await db.query(
        `SELECT h.*,u.name AS actor_name,
      CASE WHEN h.entity_kind='product' THEN p.version ELSE d.version END AS current_version,
      CASE WHEN h.entity_kind='product' THEN p.deleted_at IS NOT NULL ELSE d.deleted_at IS NOT NULL END AS deleted
      FROM catalogue_history h LEFT JOIN products p ON h.entity_kind='product' AND p.id=h.entity_id AND p.shop_id=h.shop_id
      LEFT JOIN departments d ON h.entity_kind='department' AND d.id=h.entity_id AND d.shop_id=h.shop_id
      LEFT JOIN "user" u ON u.id=h.actor_id WHERE h.shop_id=$1 AND h.expires_at>clock_timestamp()
      ORDER BY h.created_at DESC,h.id DESC LIMIT 21 OFFSET $2`,
        [shopId, offset],
      )
    ).rows;
    const deleted = (
      await db.query(
        `SELECT * FROM (
      SELECT id,'department'::text AS kind,name,version,deleted_at,deleted_at+interval '30 days' AS recover_until FROM departments
       WHERE shop_id=$1 AND deleted_at>clock_timestamp()-interval '30 days' AND purged_at IS NULL
      UNION ALL
      SELECT id,'product'::text AS kind,name,version,deleted_at,deleted_at+interval '30 days' AS recover_until FROM products
       WHERE shop_id=$1 AND deleted_at>clock_timestamp()-interval '30 days' AND purged_at IS NULL
      ) b ORDER BY deleted_at DESC,kind,id LIMIT 21 OFFSET $2`,
        [shopId, deletedOffset],
      )
    ).rows;
    await requireShop(db, actor, shopId, "catalogue");
    return {
      history: history.slice(0, 20),
      deleted: deleted.slice(0, 20),
      hasMore: history.length > 20,
      hasMoreDeleted: deleted.length > 20,
      offset,
      deletedOffset,
    };
  });
}

export async function deleteCatalogueItem(
  pool: Pool,
  actor: Actor,
  shopId: string,
  kind: CatalogueKind,
  id: string,
  input: unknown,
) {
  const command = catalogueConfirmation.parse(input);
  return transaction(pool, async (db) => {
    const shop = await catalogueLock(db, actor, shopId),
      before = await catalogueSnapshot(db, kind, shopId, id);
    if (!before) throw new AccessError(404, "resource_unavailable");
    if (before.data.version !== command.version) throw new AccessError(409, "stale_version");
    if (before.deletedAt) throw new AccessError(409, "catalogue_item_deleted");
    const now = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date,
      batch = randomUUID();
    const children =
      kind === "department"
        ? (
            await db.query(
              "SELECT p.*,pm.asset_id AS media_id FROM products p LEFT JOIN product_media pm ON pm.product_id=p.id WHERE p.shop_id=$1 AND p.department_id=$2 AND p.deleted_at IS NULL ORDER BY p.id",
              [shopId, id],
            )
          ).rows
        : [];
    if (kind === "department") {
      await db.query(
        "UPDATE products SET availability='archived',deleted_at=$3,deletion_batch=$4,version=version+1 WHERE shop_id=$1 AND department_id=$2 AND deleted_at IS NULL",
        [shopId, id, now, batch],
      );
      await db.query(
        "UPDATE departments SET archived=true,deleted_at=$3,deletion_batch=$4,version=version+1 WHERE shop_id=$1 AND id=$2",
        [shopId, id, now, batch],
      );
    } else
      await db.query(
        "UPDATE products SET availability='archived',deleted_at=$3,deletion_batch=$4,version=version+1 WHERE shop_id=$1 AND id=$2",
        [shopId, id, now, batch],
      );
    const changes: CatalogueChange[] = children.map((row) => {
      const prior = snapshotRow(row, "product");
      return {
        kind: "product",
        id: row.id,
        action: "deleted",
        batch,
        before: prior,
        after: {
          ...prior,
          data: { ...prior.data, availability: "archived", version: prior.data.version + 1 },
          deletedAt: now.toISOString(),
          deletionBatch: batch,
        },
      };
    });
    const after = (await catalogueSnapshot(db, kind, shopId, id))!;
    changes.push({ kind, id, action: "deleted", batch, before, after });
    await journalChanges(db, actor, shopId, shop.merchant_id, changes);
    await audit(db, actor, `catalogue.${kind}.deleted`, id, shop.merchant_id, {
      version: after.data.version,
      affected: changes.length,
    });
    return {
      version: after.data.version,
      affected: changes.length,
      recoverUntil: new Date(now.getTime() + 30 * 86400000).toISOString(),
    };
  });
}
async function recoverable(
  db: PoolClient,
  kind: CatalogueKind,
  shopId: string,
  id: string,
  version: number,
) {
  const current = await catalogueSnapshot(db, kind, shopId, id);
  if (!current) throw new AccessError(404, "resource_unavailable");
  if (current.data.version !== version) throw new AccessError(409, "stale_version");
  const table = kind === "department" ? "departments" : "products";
  if (
    !(
      await db.query(
        `SELECT 1 FROM ${table} WHERE shop_id=$1 AND id=$2 AND deleted_at>clock_timestamp()-interval '30 days' AND purged_at IS NULL`,
        [shopId, id],
      )
    ).rowCount
  )
    throw new AccessError(409, "recovery_expired");
  const record = (
    await db.query(
      "SELECT before_state FROM catalogue_history WHERE shop_id=$1 AND entity_kind=$2 AND entity_id=$3 AND action='deleted' AND batch_id=$4 AND expires_at>clock_timestamp() ORDER BY created_at DESC LIMIT 1",
      [shopId, kind, id, current.deletionBatch],
    )
  ).rows[0];
  if (!record?.before_state || record.before_state.deletedAt)
    throw new AccessError(409, "recovery_unavailable");
  return { current, previous: record.before_state as CatalogueSnapshot };
}
async function checkImages(db: PoolClient, shopId: string, snapshots: CatalogueSnapshot[]) {
  const ids = [
    ...new Set(
      snapshots.map((s) => s.data.mediaId).filter((id): id is string => typeof id === "string"),
    ),
  ];
  if (
    ids.length &&
    (
      await db.query(
        "SELECT id FROM media_assets WHERE shop_id=$1 AND id=ANY($2::uuid[]) AND state='ready' AND alt<>''",
        [shopId, ids],
      )
    ).rowCount !== ids.length
  )
    throw new AccessError(409, "recovery_image_unavailable");
}
async function restoreItem(
  db: PoolClient,
  actor: Actor,
  shopId: string,
  kind: CatalogueKind,
  id: string,
  version: number,
) {
  const shop = await catalogueLock(db, actor, shopId),
    { current, previous } = await recoverable(db, kind, shopId, id, version);
  if (kind === "product") {
    const value = productInput.parse({ ...previous.data, version });
    if (
      !(
        await db.query(
          "SELECT 1 FROM departments WHERE shop_id=$1 AND id=$2 AND deleted_at IS NULL AND archived=false",
          [shopId, value.departmentId],
        )
      ).rowCount
    )
      throw new AccessError(409, "restore_department_first");
    if (
      (
        await db.query(
          "SELECT count(*)::int AS n FROM products WHERE shop_id=$1 AND deleted_at IS NULL",
          [shopId],
        )
      ).rows[0].n >= 10000
    )
      throw new AccessError(409, "product_limit");
    await checkImages(db, shopId, [previous]);
    return mutateProduct(db, actor, shopId, id, value, { restore: true, action: "restored" });
  }
  if (
    (
      await db.query(
        "SELECT count(*)::int AS n FROM departments WHERE shop_id=$1 AND deleted_at IS NULL",
        [shopId],
      )
    ).rows[0].n >= 100
  )
    throw new AccessError(409, "department_limit");
  const children = (
    await db.query(
      `SELECT p.*,pm.asset_id AS media_id,h.before_state,
    p.deleted_at>clock_timestamp()-interval '30 days' AND p.purged_at IS NULL AS recoverable
    FROM products p LEFT JOIN product_media pm ON pm.product_id=p.id
    LEFT JOIN LATERAL(SELECT before_state FROM catalogue_history WHERE shop_id=p.shop_id AND entity_kind='product' AND entity_id=p.id AND action='deleted' AND batch_id=p.deletion_batch AND expires_at>clock_timestamp() ORDER BY created_at DESC LIMIT 1) h ON true
    WHERE p.shop_id=$1 AND p.department_id=$2 AND p.deletion_batch=$3 ORDER BY p.id`,
      [shopId, id, current.deletionBatch],
    )
  ).rows;
  if (children.some((row) => !row.recoverable || !row.before_state || row.before_state.deletedAt))
    throw new AccessError(409, "recovery_unavailable");
  if (
    (
      await db.query(
        "SELECT count(*)::int AS n FROM products WHERE shop_id=$1 AND deleted_at IS NULL",
        [shopId],
      )
    ).rows[0].n +
      children.length >
    10000
  )
    throw new AccessError(409, "product_limit");
  const values = children.map((row) => ({
    id: row.id,
    version: row.version,
    availability: productInput.parse(row.before_state.data).availability,
  }));
  await checkImages(
    db,
    shopId,
    children.map((row) => row.before_state),
  );
  const result = await mutateDepartment(
    db,
    actor,
    shopId,
    id,
    departmentInput.parse({ ...previous.data, version }),
    { restore: true, action: "restored" },
  );
  if (values.length) {
    const updated = await db.query(
      `UPDATE products p SET availability=x.availability,deleted_at=NULL,deletion_batch=NULL,purged_at=NULL,version=p.version+1
      FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,version integer,availability text)
      WHERE p.id=x.id AND p.version=x.version AND p.shop_id=$2 AND p.deletion_batch=$3 AND p.purged_at IS NULL AND p.deleted_at>clock_timestamp()-interval '30 days' RETURNING p.id`,
      [JSON.stringify(values), shopId, current.deletionBatch],
    );
    if (updated.rowCount !== values.length) throw new AccessError(409, "stale_version");
    await journalChanges(
      db,
      actor,
      shopId,
      shop.merchant_id,
      children.map((row, index) => {
        const prior = snapshotRow(row, "product");
        return {
          kind: "product",
          id: row.id,
          action: "restored",
          batch: current.deletionBatch!,
          before: prior,
          after: {
            ...prior,
            data: {
              ...prior.data,
              availability: values[index]!.availability,
              version: prior.data.version + 1,
            },
            deletedAt: null,
            deletionBatch: null,
            purgedAt: null,
          },
        };
      }),
    );
  }
  await audit(db, actor, "catalogue.department.restored", id, shop.merchant_id, {
    version: result.version,
    affected: children.length + 1,
  });
  return { ...result, affected: children.length + 1 };
}
export async function catalogueHistoryAction(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: unknown,
) {
  const command = catalogueHistoryCommand.parse(input);
  return transaction(pool, async (db) => {
    await catalogueLock(db, actor, shopId);
    if (command.action === "restore")
      return restoreItem(db, actor, shopId, command.kind, command.id, command.version);
    const row = (
      await db.query(
        "SELECT * FROM catalogue_history WHERE shop_id=$1 AND id=$2 AND expires_at>clock_timestamp()",
        [shopId, command.historyId],
      )
    ).rows[0];
    if (!row) throw new AccessError(404, "recovery_unavailable");
    if (
      !row.before_state ||
      row.before_state.deletedAt ||
      !["updated", "reverted", "renamed"].includes(row.action)
    )
      throw new AccessError(409, "revert_unavailable");
    const current = await catalogueSnapshot(db, row.entity_kind, shopId, row.entity_id);
    if (!current) throw new AccessError(404, "resource_unavailable");
    if (current.deletedAt) throw new AccessError(409, "restore_from_bin_first");
    const value = { ...row.before_state.data, version: command.version };
    return row.entity_kind === "department"
      ? mutateDepartment(db, actor, shopId, row.entity_id, departmentInput.parse(value), {
          action: "reverted",
        })
      : mutateProduct(db, actor, shopId, row.entity_id, productInput.parse(value), {
          action: "reverted",
        });
  });
}

// A bounded maintenance pass. Keep immutable identity stubs for enquiries and
// other references, but erase catalogue details, links and recovery snapshots.
export async function cleanupCatalogueHistory(db: PoolClient) {
  await db.query(
    "DELETE FROM catalogue_history WHERE id IN (SELECT id FROM catalogue_history WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT 1000 FOR UPDATE SKIP LOCKED)",
  );
  const expired = (
    await db.query(
      "SELECT id FROM products WHERE deleted_at<=clock_timestamp()-interval '30 days' AND purged_at IS NULL ORDER BY deleted_at,id LIMIT 200 FOR UPDATE SKIP LOCKED",
    )
  ).rows.map((row) => row.id);
  if (expired.length) {
    await db.query("DELETE FROM product_media WHERE product_id=ANY($1::uuid[])", [expired]);
    await db.query(
      "UPDATE products SET name='Deleted product',slug='deleted-'||replace(id::text,'-',''),description='',price_minor=NULL,purged_at=clock_timestamp(),version=version+1 WHERE id=ANY($1::uuid[])",
      [expired],
    );
  }
  await db.query(
    "UPDATE departments SET name='Deleted department',slug='deleted-'||replace(id::text,'-',''),purged_at=clock_timestamp(),version=version+1 WHERE id IN(SELECT id FROM departments WHERE deleted_at<=clock_timestamp()-interval '30 days' AND purged_at IS NULL ORDER BY deleted_at,id LIMIT 200 FOR UPDATE SKIP LOCKED)",
  );
}
