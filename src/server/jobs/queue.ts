import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { transaction } from "../db/pool";
import { audit } from "../security/audit";
import { requireOperator, type Actor } from "../security/authorization";
import { AccessError } from "../security/errors";
export type Job = {
  id: string;
  merchant_id: string | null;
  shop_id: string | null;
  kind: string;
  schema_version: number;
  payload: Record<string, unknown>;
  lease_token: string;
  attempts: number;
  max_attempts: number;
};

export async function claim(pool: Pool, leaseSeconds = 30): Promise<Job | null> {
  try {
    return await transaction(pool, async (client) => {
      await client.query(`UPDATE jobs SET state=CASE WHEN attempts>=max_attempts THEN 'dead' ELSE 'pending' END,
        lease_token=NULL,lease_until=NULL,last_error='lease_expired' WHERE state='running' AND lease_until<now()`);
      const result = await client.query(
        `WITH candidate AS (SELECT j.id FROM jobs j WHERE state='pending' AND available_at<=now()
        AND attempts<max_attempts AND (merchant_id IS NULL OR NOT EXISTS (SELECT 1 FROM jobs active WHERE active.merchant_id=j.merchant_id AND active.state='running'))
        ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE jobs SET state='running',attempts=attempts+1,lease_token=$1,lease_until=now()+$2*interval '1 second'
        FROM candidate WHERE jobs.id=candidate.id RETURNING jobs.*`,
        [randomUUID(), leaseSeconds],
      );
      return (result.rows[0] as Job | undefined) ?? null;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return null;
    throw error;
  }
}
export async function heartbeat(pool: Pool, job: Job, leaseSeconds = 30) {
  return Boolean(
    (
      await pool.query(
        "UPDATE jobs SET lease_until=now()+$3*interval '1 second' WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now()",
        [job.id, job.lease_token, leaseSeconds],
      )
    ).rowCount,
  );
}
export async function acknowledge(pool: Pool, job: Job) {
  return Boolean(
    (
      await pool.query(
        "UPDATE jobs SET state='done',completed_at=now(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now()",
        [job.id, job.lease_token],
      )
    ).rowCount,
  );
}
export async function fail(
  pool: Pool,
  job: Job,
  code: "handler_failed" | "unsupported_job" | "timeout",
) {
  await pool.query(
    `UPDATE jobs SET state=CASE WHEN attempts>=max_attempts THEN 'dead' ELSE 'pending' END,
    available_at=now()+LEAST(300,power(2,attempts))*interval '1 second',lease_token=NULL,lease_until=NULL,last_error=$3
    WHERE id=$1 AND lease_token=$2 AND state='running'`,
    [job.id, job.lease_token, code],
  );
}
export async function replay(pool: Pool, actor: Actor, jobId: string) {
  return transaction(pool, async (client) => {
    await requireOperator(client, actor, "jobs", true);
    const job = (
      await client.query(
        "SELECT id,merchant_id FROM jobs WHERE id=$1 AND state='dead' FOR UPDATE",
        [jobId],
      )
    ).rows[0];
    if (!job) throw new AccessError(409, "only_dead_jobs_can_replay");
    await client.query(
      "UPDATE jobs SET state='pending',attempts=0,available_at=now(),last_error=NULL WHERE id=$1",
      [jobId],
    );
    await audit(client, actor, "job.replayed", jobId, job.merchant_id ?? undefined);
  });
}
