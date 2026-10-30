import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import { requireOperator, type Actor } from "./security/authorization";
import { AccessError } from "./security/errors";
import { audit } from "./security/audit";
import { enqueue } from "./jobs/enqueue";
export const reviewAlertInput = z
  .object({ enabled: z.boolean(), version: z.number().int().nonnegative() })
  .strict();
export async function readReviewAlerts(pool: Pool, actor: Actor) {
  await requireOperator(pool, actor, "review");
  return (
    (
      await pool.query("SELECT enabled,version FROM operator_review_alerts WHERE user_id=$1", [
        actor.userId,
      ])
    ).rows[0] ?? { enabled: false, version: 0 }
  );
}
export async function setReviewAlerts(
  pool: Pool,
  actor: Actor,
  input: z.input<typeof reviewAlertInput>,
) {
  const value = reviewAlertInput.parse(input);
  return transaction(pool, async (client) => {
    await requireOperator(client, actor, "review", true);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `review-alert:${actor.userId}`,
    ]);
    const previous = (
      await client.query("SELECT version FROM operator_review_alerts WHERE user_id=$1", [
        actor.userId,
      ])
    ).rows[0];
    if ((previous?.version ?? 0) !== value.version) throw new AccessError(409, "stale_version");
    const result = (
      await client.query(
        "INSERT INTO operator_review_alerts(user_id,enabled) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,version=operator_review_alerts.version+1,updated_at=now() RETURNING enabled,version",
        [actor.userId, value.enabled],
      )
    ).rows[0];
    await audit(client, actor, "operator.review-alerts.changed", actor.userId, undefined, {
      enabled: value.enabled,
    });
    return result;
  });
}
export async function notifyReviewQueue(
  client: PoolClient,
  applicationId: string,
  version: number,
) {
  const recipients = (
    await client.query(
      'SELECT u.id,u.email FROM operator_review_alerts n JOIN "user" u ON u.id=n.user_id JOIN operator_grants g ON g.user_id=u.id AND g.permission=\'review\' WHERE n.enabled AND u."emailVerified"=true ORDER BY u.id',
    )
  ).rows;
  for (const user of recipients)
    await enqueue(client, {
      kind: "notification.local",
      key: `review-queue:${applicationId}:${version}:${user.id}`,
      payload: {
        template: "application-review-queue",
        operatorId: user.id,
        applicationId,
        to: user.email,
      },
    });
}
export async function reviewAlertAllowed(pool: Pool, payload: Record<string, unknown>) {
  if (typeof payload.operatorId !== "string" || typeof payload.to !== "string") return false;
  return Boolean(
    (
      await pool.query(
        'SELECT 1 FROM operator_review_alerts n JOIN operator_grants g ON g.user_id=n.user_id AND g.permission=\'review\' JOIN "user" u ON u.id=n.user_id WHERE n.user_id=$1 AND n.enabled AND u.email=$2 AND u."emailVerified"=true',
        [payload.operatorId, payload.to],
      )
    ).rowCount,
  );
}
