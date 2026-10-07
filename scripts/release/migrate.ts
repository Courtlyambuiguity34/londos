import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { migrate } from "../../src/server/db/migrate";
import { provisionRuntimeRoles } from "./roles";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
});
try {
  if (!process.env.DATABASE_URL) throw new Error("Migration credentials required");
  await migrate(pool);
  if (process.env.LONDOS_RUNTIME_PASSWORDS_FILE) {
    const passwords: unknown = JSON.parse(
      await readFile(process.env.LONDOS_RUNTIME_PASSWORDS_FILE, "utf8"),
    );
    if (
      !passwords ||
      typeof passwords !== "object" ||
      Object.keys(passwords).sort().join(",") !== "monitor,web,worker"
    )
      throw new Error("Invalid role credentials");
    await provisionRuntimeRoles(
      pool,
      passwords as { web: string; worker: string; monitor: string },
    );
  }
  console.log(JSON.stringify({ event: "release.migration", result: "passed" }));
} catch {
  console.error(JSON.stringify({ event: "release.migration", result: "failed" }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
