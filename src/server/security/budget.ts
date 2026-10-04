import type { Pool } from "pg";
import { AccessError } from "./errors";
export async function consumeBudget(pool: Pool, key: string, limit: number) {
  const result = await pool.query(
    `INSERT INTO request_budgets(key,window_id,count) VALUES($1,floor(extract(epoch FROM now())/60)::bigint,1)
    ON CONFLICT(key,window_id) DO UPDATE SET count=request_budgets.count+1 WHERE request_budgets.count<$2 RETURNING count`,
    [key, limit],
  );
  if (!result.rowCount) throw new AccessError(429, "rate_limit_exceeded");
}
