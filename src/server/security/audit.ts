import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Actor } from "./authorization";

export async function audit(
  client: PoolClient,
  actor: Actor,
  action: string,
  resourceId: string,
  merchantId?: string,
  details: Record<string, unknown> = {},
) {
  await client.query(
    "INSERT INTO audit_events(id,merchant_id,actor_id,action,resource_id,details) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), merchantId ?? null, actor.userId, action, resourceId, JSON.stringify(details)],
  );
}
