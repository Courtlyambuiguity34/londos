import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { loadLocalEnv } from "./local-env";
import { requireDevelopmentDatabase } from "../src/server/db/development";
import { requiredMigration } from "../src/server/db/schema-contract";
import type { SeedAccounts } from "../src/server/db/seed";
loadLocalEnv();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await requireDevelopmentDatabase(pool);
  if (
    !(await pool.query("SELECT 1 FROM schema_migrations WHERE name=$1", [requiredMigration]))
      .rowCount
  )
    throw new Error("Apply current migrations first.");
  const accounts = JSON.parse(
    await readFile(".local/development-accounts.json", "utf8"),
  ) as SeedAccounts;
  const existing = await pool.query(
    "SELECT 1 FROM \"user\" u JOIN operator_grants g ON g.user_id=u.id WHERE u.id=$1 AND u.email=$2 AND g.permission='review'",
    [accounts.operator.id, "operator@londos.example"],
  );
  if (!existing.rowCount)
    throw new Error("Fictional review operator identity does not match; no grant changed.");
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'operations') ON CONFLICT DO NOTHING",
    [accounts.operator.id],
  );
  console.log(
    "The existing fictional review operator can now claim scoped development shop operations after native MFA. Live collection remains disabled.",
  );
} catch {
  console.error(
    "Local operations setup failed; no credentials printed. Check local identity, migrations and the private account file.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
