import type { Pool } from "pg";
import { z } from "zod";
import type { Job } from "./queue";
import { transaction } from "../db/pool";
import { localLifecycle } from "../lifecycle-common";
import { syncTenancy } from "../rent";

export async function handleRentTick(pool: Pool, job: Job, signal: AbortSignal, now?: Date) {
  localLifecycle();
  const payload = z.object({ shopId: z.uuid() }).strict().parse(job.payload);
  if (payload.shopId !== job.shop_id || !job.merchant_id || job.schema_version !== 1)
    throw new Error("unsupported_job");
  await transaction(pool, async (client) => {
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [job.merchant_id]);
    if (
      !(
        await client.query("SELECT 1 FROM rent_contracts WHERE shop_id=$1 AND merchant_id=$2", [
          job.shop_id,
          job.merchant_id,
        ])
      ).rowCount
    )
      throw new Error("unsupported_job");
    const owned = await client.query(
      "SELECT id FROM jobs WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>clock_timestamp() FOR UPDATE",
      [job.id, job.lease_token],
    );
    if (!owned.rowCount) throw new Error("lease_lost");
    if (
      !(
        await client.query(
          "INSERT INTO job_effects(job_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING job_id",
          [job.id],
        )
      ).rowCount
    )
      return;
    // The trusted worker clock and canonical ledger determine state; old payloads
    // cannot carry a stale paid-through date or override moderation/publication.
    await syncTenancy(client, payload.shopId, now ?? new Date());
    signal.throwIfAborted();
  });
}
