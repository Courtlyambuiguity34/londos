import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "../db/pool";
import { enqueue } from "../jobs/enqueue";
import { audit } from "./audit";
import { requireMerchant, requireStepUp, sessionState, type Actor } from "./authorization";
import { AccessError } from "./errors";

const grants = z.array(z.enum(["catalogue", "design", "publish", "finance", "sensitive"])).max(5);
export const membershipChange = z
  .object({
    role: z.enum(["owner", "staff"]),
    permissions: grants,
    status: z.enum(["active", "revoked"]),
  })
  .strict();
export const invitationInput = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((email) => email.toLowerCase()),
    role: z.enum(["owner", "staff"]),
    permissions: grants,
  })
  .strict();
function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function changeMembership(
  pool: Pool,
  actor: Actor,
  merchantId: string,
  userId: string,
  input: z.infer<typeof membershipChange>,
) {
  const value = membershipChange.parse(input);
  return transaction(pool, async (client) => {
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchantId]);
    await requireMerchant(client, actor, merchantId, "membership");
    const target = (
      await client.query(
        "SELECT role,status FROM memberships WHERE merchant_id=$1 AND user_id=$2",
        [merchantId, userId],
      )
    ).rows[0];
    if (!target) throw new AccessError(404, "resource_unavailable");
    if (
      target.role === "owner" &&
      target.status === "active" &&
      (value.role !== "owner" || value.status !== "active")
    ) {
      const count = await client.query(
        "SELECT count(*)::int AS count FROM memberships WHERE merchant_id=$1 AND role='owner' AND status='active'",
        [merchantId],
      );
      if (count.rows[0].count <= 1) throw new AccessError(409, "last_owner_required");
    }
    await client.query(
      "UPDATE memberships SET role=$3,permissions=$4,status=$5 WHERE merchant_id=$1 AND user_id=$2",
      [merchantId, userId, value.role, value.permissions, value.status],
    );
    await audit(client, actor, "membership.changed", userId, merchantId, {
      role: value.role,
      status: value.status,
      permissions: value.permissions,
    });
    await enqueue(client, {
      kind: "security.membership.changed",
      key: `membership:${randomUUID()}`,
      merchantId,
      payload: { userId },
    });
  });
}
export async function invite(
  pool: Pool,
  actor: Actor,
  merchantId: string,
  input: z.infer<typeof invitationInput>,
) {
  const value = invitationInput.parse(input);
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  await transaction(pool, async (client) => {
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchantId]);
    await requireMerchant(client, actor, merchantId, "membership");
    await client.query(
      "INSERT INTO invitations(id,merchant_id,email,token_hash,role,permissions,expires_at,invited_by) VALUES($1,$2,$3,$4,$5,$6,now()+interval '48 hours',$7)",
      [id, merchantId, value.email, tokenHash(token), value.role, value.permissions, actor.userId],
    );
    await audit(client, actor, "membership.invited", id, merchantId, {
      role: value.role,
      permissions: value.permissions,
    });
    await enqueue(client, {
      kind: "notification.local",
      key: `invitation:${id}`,
      merchantId,
      payload: { to: value.email, template: "invitation", token },
    });
  });
  return { id }; // The bearer token is delivered only through the notification adapter.
}
export async function acceptInvitation(pool: Pool, actor: Actor, token: string) {
  if (token.length < 32 || token.length > 128) throw new AccessError(404, "invitation_unavailable");
  return transaction(pool, async (client) => {
    await requireStepUp(client, actor);
    const lookup = (
      await client.query("SELECT merchant_id FROM invitations WHERE token_hash=$1", [
        tokenHash(token),
      ])
    ).rows[0];
    if (!lookup) throw new AccessError(404, "invitation_unavailable");
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [lookup.merchant_id]);
    // The session may have expired or been revoked while this transaction waited.
    const session = await sessionState(client, actor);
    await requireStepUp(client, actor);
    const invitation = (
      await client.query(
        "SELECT * FROM invitations WHERE token_hash=$1 AND email=$2 AND expires_at>clock_timestamp() AND accepted_at IS NULL AND revoked_at IS NULL FOR UPDATE",
        [tokenHash(token), session.email.toLowerCase()],
      )
    ).rows[0];
    if (!invitation) throw new AccessError(404, "invitation_unavailable");
    const existing = await client.query(
      "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2",
      [invitation.merchant_id, actor.userId],
    );
    if (existing.rowCount) throw new AccessError(409, "membership_already_exists");
    await client.query(
      "INSERT INTO memberships(merchant_id,user_id,role,permissions) VALUES($1,$2,$3,$4)",
      [invitation.merchant_id, actor.userId, invitation.role, invitation.permissions],
    );
    await client.query("UPDATE invitations SET accepted_at=now() WHERE id=$1", [invitation.id]);
    await audit(
      client,
      actor,
      "membership.invitation.accepted",
      invitation.id,
      invitation.merchant_id,
    );
    await enqueue(client, {
      kind: "security.membership.changed",
      key: `invitation-accepted:${invitation.id}`,
      merchantId: invitation.merchant_id,
      payload: { userId: actor.userId },
    });
  });
}
export async function revokeInvitation(
  pool: Pool,
  actor: Actor,
  merchantId: string,
  invitationId: string,
) {
  return transaction(pool, async (client) => {
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchantId]);
    await requireMerchant(client, actor, merchantId, "membership");
    const result = await client.query(
      "UPDATE invitations SET revoked_at=now() WHERE id=$1 AND merchant_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id",
      [invitationId, merchantId],
    );
    if (!result.rowCount) throw new AccessError(404, "invitation_unavailable");
    await audit(client, actor, "membership.invitation.revoked", invitationId, merchantId);
  });
}
export async function transferOwnership(
  pool: Pool,
  actor: Actor,
  merchantId: string,
  targetUserId: string,
) {
  return transaction(pool, async (client) => {
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchantId]);
    await requireMerchant(client, actor, merchantId, "membership");
    if (targetUserId === actor.userId) throw new AccessError(422, "different_owner_required");
    const target = await client.query(
      "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND status='active'",
      [merchantId, targetUserId],
    );
    if (!target.rowCount) throw new AccessError(404, "resource_unavailable");
    await client.query(
      "UPDATE memberships SET role=CASE WHEN user_id=$2 THEN 'owner' ELSE 'staff' END,permissions='{}' WHERE merchant_id=$1 AND user_id=ANY($3::text[])",
      [merchantId, targetUserId, [targetUserId, actor.userId]],
    );
    await audit(client, actor, "membership.ownership.transferred", targetUserId, merchantId);
    await enqueue(client, {
      kind: "security.membership.changed",
      key: `ownership:${randomUUID()}`,
      merchantId,
      payload: { userId: targetUserId },
    });
  });
}
export const staffShopInput = z
  .object({ userId: z.string().min(1).max(128), shopId: z.uuid(), permissions: grants })
  .strict();
export async function grantStaffShop(
  pool: Pool,
  actor: Actor,
  merchantId: string,
  input: z.infer<typeof staffShopInput>,
) {
  const value = staffShopInput.parse(input);
  return transaction(pool, async (client) => {
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchantId]);
    await requireMerchant(client, actor, merchantId, "membership");
    const target = (
      await client.query(
        "SELECT permissions FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND status='active' AND role='staff'",
        [merchantId, value.userId],
      )
    ).rows[0] as { permissions: string[] } | undefined;
    if (
      !target ||
      !(
        await client.query("SELECT 1 FROM shops WHERE id=$1 AND merchant_id=$2", [
          value.shopId,
          merchantId,
        ])
      ).rowCount
    )
      throw new AccessError(404, "resource_unavailable");
    if (value.permissions.some((permission) => !target.permissions.includes(permission)))
      throw new AccessError(422, "grant_exceeds_membership");
    await client.query(
      "INSERT INTO staff_shop_grants(merchant_id,user_id,shop_id,permissions) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,shop_id) DO UPDATE SET permissions=excluded.permissions",
      [merchantId, value.userId, value.shopId, value.permissions],
    );
    await audit(client, actor, "membership.shop.granted", value.shopId, merchantId, {
      userId: value.userId,
      permissions: value.permissions,
    });
    await enqueue(client, {
      kind: "security.membership.changed",
      key: `staff-shop:${randomUUID()}`,
      merchantId,
      payload: { userId: value.userId },
    });
  });
}
