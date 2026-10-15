import "server-only";
import { headers } from "next/headers";
import { coreConfigured } from "./config";
import { database } from "./db/pool";
import { auth } from "./security/auth";
import { resolveActor, sessionState } from "./security/authorization";
import { AccessError } from "./security/errors";

export async function showShopkeeperNavigation(): Promise<boolean> {
  if (!coreConfigured()) return false;
  const requestHeaders = await headers();
  if (!requestHeaders.get("cookie")) return false;
  try {
    const actor = await resolveActor(auth(), requestHeaders);
    const pool = database();
    await sessionState(pool, actor);
    // Membership is read per request, never taken from client flags or cached role cookies.
    const membership = await pool.query(
      "SELECT 1 FROM memberships WHERE user_id=$1 AND status='active' AND role IN ('owner','staff') LIMIT 1",
      [actor.userId],
    );
    return Boolean(membership.rowCount);
  } catch (error) {
    if (error instanceof AccessError) return false;
    throw error;
  }
}
