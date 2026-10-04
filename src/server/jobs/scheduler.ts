import { transaction } from "../db/pool";
import { enqueue } from "./enqueue";
import type { Pool } from "pg";
export async function schedule(pool: Pool, now = new Date()) {
  const tick = now.toISOString().slice(0, 16);
  return transaction(pool, async (client) => {
    const result = await client.query(
      "INSERT INTO scheduler_ticks(tick) VALUES($1) ON CONFLICT DO NOTHING RETURNING tick",
      [tick],
    );
    if (result.rowCount)
      await enqueue(client, {
        kind: "system.maintenance",
        key: `maintenance:${tick}`,
        payload: { tick },
      });
    return Boolean(result.rowCount);
  });
}
