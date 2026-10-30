import type { Pool } from "pg";
import { requireOperator, type Actor } from "./security/authorization";
export async function applicationReviewSummary(pool: Pool, actor: Actor) {
  await requireOperator(pool, actor, "review");
  return (
    await pool.query(
      `SELECT count(*) FILTER(WHERE state='submitted')::int AS submitted,count(*) FILTER(WHERE state='reviewing')::int AS reviewing,count(*) FILTER(WHERE state='needs_information')::int AS waiting,min(submitted_at) FILTER(WHERE state='submitted') AS oldest FROM applications WHERE state IN ('submitted','reviewing','needs_information')`,
    )
  ).rows[0] as { submitted: number; reviewing: number; waiting: number; oldest: Date | null };
}
