import type { Pool, PoolClient } from "pg";
import type { Auth } from "./auth";
import { AccessError } from "./errors";

type Queryable = Pool | PoolClient;
export type Actor = Readonly<{ userId: string; sessionId: string }>;
export type MerchantPermission =
  "catalogue" | "design" | "publish" | "finance" | "sensitive" | "membership";
export type OperatorPermission =
  "support" | "review" | "finance" | "moderation" | "recovery" | "jobs" | "operations";
export async function resolveActor(authentication: Auth, headers: Headers): Promise<Actor> {
  const result = await authentication.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
  if (!result || !result.user.emailVerified) throw new AccessError(401, "authentication_required");
  return { userId: result.user.id, sessionId: result.session.id };
}
export async function sessionState(db: Queryable, actor: Actor, allowUnverifiedMfa = false) {
  const result = await db.query(
    `SELECT s."createdAt" AS created_at,u.email,u."twoFactorEnabled" AS mfa_enabled,p.verified_at
    FROM session s JOIN "user" u ON u.id=s."userId"
    LEFT JOIN mfa_proofs p ON p.session_id=s.id AND p.user_id=u.id AND p.auth_epoch=u.auth_epoch
    WHERE s.id=$1 AND s."userId"=$2 AND s."expiresAt">clock_timestamp() AND u."emailVerified"=true`,
    [actor.sessionId, actor.userId],
  );
  if (!result.rows[0]) throw new AccessError(401, "authentication_required");
  if (result.rows[0].mfa_enabled && !result.rows[0].verified_at && !allowUnverifiedMfa)
    throw new AccessError(403, "mfa_required");
  return result.rows[0] as {
    created_at: Date;
    email: string;
    mfa_enabled: boolean;
    verified_at: Date | null;
  };
}
export async function requireStepUp(db: Queryable, actor: Actor) {
  const session = await sessionState(db, actor);
  const time = session.mfa_enabled ? session.verified_at : session.created_at;
  if (!time || Date.now() - time.getTime() > 300_000)
    throw new AccessError(403, "fresh_authentication_required");
}
export async function requireMerchant(
  db: Queryable,
  actor: Actor,
  merchantId: string,
  permission: MerchantPermission,
) {
  await sessionState(db, actor);
  const result = await db.query(
    "SELECT role,permissions FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND status='active'",
    [merchantId, actor.userId],
  );
  const membership = result.rows[0] as { role: string; permissions: string[] } | undefined;
  if (
    !membership ||
    (membership.role !== "owner" &&
      (permission === "membership" || !membership.permissions.includes(permission)))
  )
    throw new AccessError(404, "resource_unavailable");
  if (["membership", "sensitive"].includes(permission)) await requireStepUp(db, actor);
}
export async function requireShop(
  db: Queryable,
  actor: Actor,
  shopId: string,
  permission: MerchantPermission,
) {
  await sessionState(db, actor);
  const result = await db.query(
    "SELECT id,merchant_id,name,slug,version,category,tagline FROM shops WHERE id=$1",
    [shopId],
  );
  const shop = result.rows[0] as
    | {
        id: string;
        merchant_id: string;
        name: string;
        slug: string;
        version: number;
        category: string;
        tagline: string;
      }
    | undefined;
  if (!shop) throw new AccessError(404, "resource_unavailable");
  await requireMerchant(db, actor, shop.merchant_id, permission);
  const membership = (
    await db.query(
      "SELECT role FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND status='active'",
      [shop.merchant_id, actor.userId],
    )
  ).rows[0];
  if (
    membership?.role !== "owner" &&
    !(
      await db.query(
        "SELECT 1 FROM staff_shop_grants WHERE merchant_id=$1 AND user_id=$2 AND shop_id=$3 AND $4=ANY(permissions)",
        [shop.merchant_id, actor.userId, shopId, permission],
      )
    ).rowCount
  )
    throw new AccessError(404, "resource_unavailable");
  return shop;
}
export async function requireOperatorShop(
  db: Queryable,
  actor: Actor,
  shopId: string,
  permission: OperatorPermission,
) {
  await requireOperator(db, actor, permission);
  const result = await db.query(
    "SELECT s.id,s.merchant_id FROM shops s JOIN operator_shop_scopes scope ON scope.shop_id=s.id WHERE s.id=$1 AND scope.user_id=$2",
    [shopId, actor.userId],
  );
  if (!result.rowCount) throw new AccessError(404, "resource_unavailable");
  return result.rows[0] as { id: string; merchant_id: string };
}
export async function requireOperator(
  db: Queryable,
  actor: Actor,
  permission: OperatorPermission,
  fresh = false,
) {
  const session = await sessionState(db, actor);
  if (!session.mfa_enabled || !session.verified_at) throw new AccessError(403, "mfa_required");
  if (
    !(
      await db.query("SELECT 1 FROM operator_grants WHERE user_id=$1 AND permission=$2", [
        actor.userId,
        permission,
      ])
    ).rowCount
  )
    throw new AccessError(403, "permission_denied");
  if (fresh) await requireStepUp(db, actor);
}
