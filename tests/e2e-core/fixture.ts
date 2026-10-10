import { expect, test as base, type Page } from "@playwright/test";
import { Pool } from "pg";

export const test = base.extend<{ resetSignInBudgets: void }>({
  resetSignInBudgets: [
    async ({ browserName }, use) => {
      void browserName;
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
      try {
        // Every browser scenario gets a clean fictional sign-in budget. The
        // application rate limiter itself remains enabled and is still tested.
        await pool.query("DELETE FROM request_budgets WHERE key LIKE 'auth:/sign-in/email:%'");
        await pool.query('DELETE FROM "rateLimit"');
      } finally {
        await pool.end();
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
export type { Page };
