import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import { requireMerchant, sessionState, type Actor } from "./security/authorization";
import {
  invite,
  revokeInvitation,
  changeMembership,
  transferOwnership,
  grantStaffShop,
  invitationInput,
  membershipChange,
  staffShopInput,
} from "./security/memberships";

const commandBase = { version: z.number().int().positive(), confirm: z.literal(true) };
export const teamCommandInput = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("invite"), value: invitationInput }).strict(),
  z
    .object({
      ...commandBase,
      action: z.literal("membership"),
      userId: z.string().min(1).max(128),
      value: membershipChange,
    })
    .strict(),
  z
    .object({ ...commandBase, action: z.literal("revoke_invitation"), invitationId: z.uuid() })
    .strict(),
  z.object({ ...commandBase, action: z.literal("staff_shop"), value: staffShopInput }).strict(),
  z
    .object({ ...commandBase, action: z.literal("transfer"), userId: z.string().min(1).max(128) })
    .strict(),
]);
export type TeamView = {
  merchant: { id: string; name: string; version: number };
  members: {
    user_id: string;
    email: string;
    name: string;
    role: "owner" | "staff";
    permissions: string[];
    status: "active" | "revoked";
  }[];
  invitations: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
    expires_at: Date | string;
  }[];
  shops: { id: string; name: string }[];
  grants: { user_id: string; shop_id: string; permissions: string[] }[];
  page: number;
  next: boolean;
};
export async function ownedMerchants(pool: Pool, actor: Actor, page = 0) {
  z.number().int().min(0).max(500).parse(page);
  await sessionState(pool, actor);
  return (
    await pool.query(
      "SELECT m.id,m.name,m.version FROM merchants m JOIN memberships g ON g.merchant_id=m.id WHERE g.user_id=$1 AND g.role='owner' AND g.status='active' ORDER BY m.name,m.id LIMIT 20 OFFSET $2",
      [actor.userId, page * 20],
    )
  ).rows as TeamView["merchant"][];
}
export async function readTeam(
  pool: Pool,
  actor: Actor,
  merchantId: string,
  page = 0,
): Promise<TeamView> {
  z.number().int().min(0).max(500).parse(page);
  return transaction(pool, async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await requireMerchant(client, actor, merchantId, "membership");
    const merchant = (
      await client.query("SELECT id,name,version FROM merchants WHERE id=$1", [merchantId])
    ).rows[0];
    const members = (
      await client.query(
        'SELECT m.user_id,u.email,u.name,m.role,m.permissions,m.status FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.merchant_id=$1 ORDER BY m.created_at,m.user_id LIMIT 21 OFFSET $2',
        [merchantId, page * 20],
      )
    ).rows;
    const invitations = (
      await client.query(
        "SELECT id,email,role,permissions,expires_at FROM invitations WHERE merchant_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp() ORDER BY created_at,id LIMIT 21 OFFSET $2",
        [merchantId, page * 20],
      )
    ).rows;
    const shops = (
      await client.query(
        "SELECT id,name FROM shops WHERE merchant_id=$1 ORDER BY name,id LIMIT 21 OFFSET $2",
        [merchantId, page * 20],
      )
    ).rows;
    const grants = (
      await client.query(
        "SELECT user_id,shop_id,permissions FROM staff_shop_grants WHERE merchant_id=$1 AND user_id=ANY($2::text[]) AND shop_id=ANY($3::uuid[])",
        [
          merchantId,
          members.slice(0, 20).map((m) => m.user_id),
          shops.slice(0, 20).map((s) => s.id),
        ],
      )
    ).rows;
    return {
      merchant,
      members: members.slice(0, 20),
      invitations: invitations.slice(0, 20),
      shops: shops.slice(0, 20),
      grants,
      page,
      next: [members, invitations, shops].some((rows) => rows.length > 20),
    };
  });
}
export async function teamCommand(
  pool: Pool,
  actor: Actor,
  merchantId: string,
  input: z.infer<typeof teamCommandInput>,
) {
  const v = teamCommandInput.parse(input);
  switch (v.action) {
    case "invite":
      return invite(pool, actor, merchantId, v.value, v.version);
    case "membership":
      await changeMembership(pool, actor, merchantId, v.userId, v.value, v.version);
      break;
    case "revoke_invitation":
      await revokeInvitation(pool, actor, merchantId, v.invitationId, v.version);
      break;
    case "staff_shop":
      await grantStaffShop(pool, actor, merchantId, v.value, v.version);
      break;
    case "transfer":
      await transferOwnership(pool, actor, merchantId, v.userId, v.version);
      break;
  }
  return { status: "updated" };
}
