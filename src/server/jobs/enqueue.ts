import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export async function enqueue(
  client: Pool | PoolClient,
  job: {
    kind: string;
    key: string;
    payload: Record<string, unknown>;
    merchantId?: string;
    shopId?: string;
    availableAt?: Date;
  },
) {
  const result = await client.query(
    "INSERT INTO jobs(id,merchant_id,shop_id,kind,dedupe_key,payload,available_at) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7,now())) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id",
    [
      randomUUID(),
      job.merchantId ?? null,
      job.shopId ?? null,
      job.kind,
      job.key,
      JSON.stringify(job.payload),
      job.availableAt ?? null,
    ],
  );
  return result.rows[0]?.id as string | undefined;
}
