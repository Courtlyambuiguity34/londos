import type { Pool } from "pg";
export async function requireDevelopmentDatabase(pool: Pool) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.LONDOS_LOCAL_ADAPTERS !== "true" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^londos_(development|test_[a-z0-9_]+)$/.test(url.pathname.slice(1))
  )
    throw new Error(
      "Development tools require explicit local adapters and a loopback londos_development/londos_test_* database.",
    );
  const result = await pool.query("SELECT current_database() AS name");
  if (result.rows[0].name !== url.pathname.slice(1)) throw new Error("Database identity mismatch.");
}
