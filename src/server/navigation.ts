import "server-only";
import { headers } from "next/headers";
import { coreConfigured } from "./config";
import { database } from "./db/pool";
import { auth } from "./security/auth";
import { resolveActor, sessionState } from "./security/authorization";
import { AccessError } from "./security/errors";

export type WorkspaceAccess = { shopkeeper: boolean; landlord: boolean };
export async function workspaceAccess(): Promise<WorkspaceAccess> {
  if (!coreConfigured()) return {shopkeeper:false,landlord:false};
  const requestHeaders = await headers();
  if (!requestHeaders.get("cookie")) return {shopkeeper:false,landlord:false};
  try {
    const actor = await resolveActor(auth(), requestHeaders);
    const pool = database();
    await sessionState(pool, actor, true);
    // Membership is read per request, never taken from client flags or cached role cookies.
    const [membership,grants] = await Promise.all([
      pool.query("SELECT 1 FROM memberships WHERE user_id=$1 AND status='active' AND role IN ('owner','staff') LIMIT 1",[actor.userId]),
      pool.query("SELECT 1 FROM operator_grants WHERE user_id=$1 LIMIT 1",[actor.userId]),
    ]);
    return {shopkeeper:Boolean(membership.rowCount),landlord:Boolean(grants.rowCount)};
  } catch (error) {
    if (error instanceof AccessError) return {shopkeeper:false,landlord:false};
    throw error;
  }
}

export async function showShopkeeperNavigation(){return (await workspaceAccess()).shopkeeper;}
export async function requestPathname(){const value=(await headers()).get("x-londos-pathname")??"";return value.startsWith("/")?value:"";}
export function isShopkeeperPath(p:string){return p==="/shopkeeper"||p.startsWith("/shopkeeper/");}
export function isLandlordPath(p:string){return p==="/landlord"||p.startsWith("/landlord/");}
export function isWorkspacePath(p:string){return isShopkeeperPath(p)||isLandlordPath(p);}
