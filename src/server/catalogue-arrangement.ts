import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { z } from "zod";
import { catalogueMove } from "../modules/catalogue-tools";
import { transaction } from "./db/pool";
import { catalogueLock } from "./catalogue";
import { catalogueSnapshot, journalChanges, snapshotRow } from "./catalogue-journal";
import type { Actor } from "./security/authorization";
import { AccessError } from "./security/errors";
import { audit } from "./security/audit";

// The merchant lock serialises saves/recovery/reordering. Re-read the full
// department order so page boundaries and equal legacy positions stay correct.
export async function moveCatalogueItem(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.input<typeof catalogueMove>,
) {
  const value = catalogueMove.parse(input);
  return transaction(pool, async (client) => {
    const shop = await catalogueLock(client, actor, shopId);
    const current = await catalogueSnapshot(client, value.kind, shopId, value.id);
    if (!current || current.deletedAt) throw new AccessError(404, "resource_unavailable");
    if (current.data.version !== value.version) throw new AccessError(409, "stale_version");
    if (
      value.kind === "department" ? current.data.archived : current.data.availability === "archived"
    )
      throw new AccessError(422, "arrangement_requires_active_item");
    const rows = (
      await client.query<Record<string, unknown>>(
        value.kind === "department"
          ? "SELECT d.* FROM departments d WHERE d.shop_id=$1 AND d.deleted_at IS NULL AND d.archived=false ORDER BY d.position,d.id"
          : "SELECT q.*,pm.asset_id AS media_id FROM products q LEFT JOIN product_media pm ON pm.product_id=q.id JOIN departments d ON d.id=q.department_id AND d.shop_id=q.shop_id WHERE q.shop_id=$1 AND q.department_id=$2 AND q.deleted_at IS NULL AND q.availability<>'archived' AND d.archived=false AND d.deleted_at IS NULL ORDER BY q.position,q.id",
        value.kind === "department" ? [shopId] : [shopId, current.data.departmentId],
      )
    ).rows;
    const index = rows.findIndex((row) => row.id === value.id),
      next = index + (value.direction === "up" ? -1 : 1);
    if (index < 0) throw new AccessError(404, "resource_unavailable");
    if (next < 0 || next >= rows.length) return { moved: false };
    [rows[index], rows[next]] = [rows[next]!, rows[index]!];
    const changes = rows.flatMap((row, index) =>
      Number(row.position) === (index + 1) * 10
        ? []
        : [{ id: row.id as string, position: (index + 1) * 10 }],
    );
    const table = value.kind === "department" ? "departments" : "products";
    const updated = (
      await client.query<Record<string, unknown>>(
        `UPDATE ${table} item SET position=change.position,version=item.version+1
       FROM jsonb_to_recordset($1::jsonb) AS change(id uuid,position integer)
       WHERE item.id=change.id AND item.shop_id=$2 AND item.deleted_at IS NULL RETURNING item.*`,
        [JSON.stringify(changes), shopId],
      )
    ).rows;
    const before = new Map(rows.map((row) => [row.id, row])),
      batch = randomUUID();
    await journalChanges(
      client,
      actor,
      shopId,
      shop.merchant_id,
      updated.map((row) => ({
        kind: value.kind,
        id: row.id as string,
        action: "updated",
        batch,
        before: snapshotRow(before.get(row.id)!, value.kind),
        after: snapshotRow({ ...row, media_id: before.get(row.id)?.media_id }, value.kind),
      })),
    );
    await audit(client, actor, "catalogue.order.changed", value.id, shop.merchant_id, {
      kind: value.kind,
      direction: value.direction,
      changed: updated.length,
    });
    return { moved: true };
  });
}
