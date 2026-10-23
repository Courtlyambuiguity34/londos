import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { coreConfig } from "./config";
import { requireMerchant, requireOperator, type Actor } from "./security/authorization";
import { AccessError } from "./security/errors";
import { enqueue } from "./jobs/enqueue";

export const developmentPolicyId = "90000000-0000-4000-8000-000000000001";
export const reasonInput = z.string().trim().min(5).max(500);
export function localLifecycle() {
  if (!coreConfig().localAdapters) throw new AccessError(403, "local_lifecycle_only");
}
export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export type Application = {
  id: string;
  merchant_id: string;
  applicant_id: string;
  state: string;
  version: number;
  business_name: string;
  category: string;
  location: string;
  description: string;
  phone: string;
  review_reason: string;
  policy_id: string | null;
  provisioned_shop_id: string | null;
};
export async function applicationAccess(
  db: Pool | PoolClient,
  actor: Actor,
  id: string,
  mode: "owner" | "review" | "finance",
) {
  // Read-only application access uses the same scoped membership and operator checks
  // in both hosted and local environments. Mutations retain their own lifecycle gates.
  z.uuid().parse(id);
  if (mode !== "owner") await requireOperator(db, actor, mode);
  const row = (
    await db.query(
      "SELECT id,merchant_id,applicant_id,state,version,business_name,category,location,description,phone,review_reason,policy_id,provisioned_shop_id FROM applications WHERE id=$1",
      [id],
    )
  ).rows[0] as Application | undefined;
  if (!row) throw new AccessError(404, "resource_unavailable");
  if (mode === "owner") {
    await requireMerchant(db, actor, row.merchant_id, "catalogue");
    if (
      !(
        await db.query(
          "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND role='owner' AND status='active'",
          [row.merchant_id, actor.userId],
        )
      ).rowCount
    )
      throw new AccessError(404, "resource_unavailable");
  } else {
    await requireOperator(db, actor, mode);
    if (
      !(
        await db.query(
          "SELECT 1 FROM operator_application_scopes WHERE application_id=$1 AND user_id=$2 AND permission=$3",
          [id, actor.userId, mode],
        )
      ).rowCount
    )
      throw new AccessError(404, "resource_unavailable");
    if (
      (
        await db.query(
          "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND status='active'",
          [row.merchant_id, actor.userId],
        )
      ).rowCount
    )
      throw new AccessError(403, "conflict_of_interest");
  }
  return row;
}
export async function applicationLock(
  db: PoolClient,
  actor: Actor,
  id: string,
  mode: "owner" | "review" | "finance",
) {
  const initial = await applicationAccess(db, actor, id, mode);
  await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [initial.merchant_id]);
  return applicationAccess(db, actor, id, mode);
}
export function currentVersion(actual: number, expected: number) {
  if (actual !== expected) throw new AccessError(409, "stale_version");
}
export async function notifyOwners(
  db: PoolClient,
  merchantId: string,
  key: string,
  payload: Record<string, unknown>,
) {
  const owners = (
    await db.query(
      "SELECT u.email FROM memberships m JOIN \"user\" u ON u.id=m.user_id WHERE m.merchant_id=$1 AND m.role='owner' AND m.status='active' ORDER BY u.id LIMIT 11",
      [merchantId],
    )
  ).rows as { email: string }[];
  if (owners.length > 10) throw new AccessError(409, "notification_recipient_limit");
  for (const owner of owners)
    await enqueue(db, {
      kind: "notification.local",
      key: `${key}:${owner.email}`,
      merchantId,
      payload: { ...payload, to: owner.email },
    });
}
