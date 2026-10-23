import type { Pool } from "pg";
import { z } from "zod";
import { sessionState, type Actor } from "./security/authorization";
import { AccessError } from "./security/errors";

/** A deliberately read-only projection. Evidence, contact details, reviewer identity,
 * payment data and other merchants' records are never returned. */
export async function ownedApplicationStatus(db: Pool, actor: Actor, id: string) {
  const applicationId = z.uuid().parse(id);
  await sessionState(db, actor);
  const result = await db.query(
    `SELECT a.id, a.business_name, a.state, a.provisioned_shop_id
       FROM applications a
       WHERE a.id=$1
         AND EXISTS (
           SELECT 1 FROM memberships m
           WHERE m.merchant_id=a.merchant_id
             AND m.user_id=$2
             AND m.role='owner'
             AND m.status='active'
         )`,
    [applicationId, actor.userId],
  );
  if (!result.rowCount) throw new AccessError(404, "resource_unavailable");
  return result.rows[0] as {
    id: string;
    business_name: string;
    state: string;
    provisioned_shop_id: string | null;
  };
}
