import { transaction } from "../db/pool";
import { enqueue } from "./enqueue";
import type { Pool } from "pg";
import { scheduleCommunications } from "../communications";
export async function schedule(pool: Pool, now = new Date()) {
  const tick = now.toISOString().slice(0, 16);
  return transaction(pool, async (client) => {
    const result = await client.query(
      "INSERT INTO scheduler_ticks(tick) VALUES($1) ON CONFLICT DO NOTHING RETURNING tick",
      [tick],
    );
    if (result.rowCount) {
      await enqueue(client, {
        kind: "system.maintenance",
        key: `maintenance:${tick}`,
        payload: { tick },
      });
      const due = (
        await client.query(
          "SELECT shop_id,merchant_id FROM rent_contracts WHERE next_check_at<=$1 ORDER BY next_check_at,shop_id LIMIT 100",
          [now],
        )
      ).rows;
      for (const contract of due)
        await enqueue(client, {
          kind: "rent.tick",
          key: `rent:${contract.shop_id}:${tick}`,
          merchantId: contract.merchant_id,
          shopId: contract.shop_id,
          payload: { shopId: contract.shop_id },
        });
      await scheduleCommunications(client, now);
    }
    return Boolean(result.rowCount);
  });
}
