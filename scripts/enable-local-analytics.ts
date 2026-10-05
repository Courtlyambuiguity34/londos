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
    throw Error("Apply current migrations first");
  const accounts = JSON.parse(
    await readFile(".local/development-accounts.json", "utf8"),
  ) as SeedAccounts;
  if (
    !(
      await pool.query(
        "SELECT 1 FROM \"user\" u JOIN operator_grants g ON g.user_id=u.id WHERE u.id=$1 AND u.email=$2 AND g.permission='review'",
        [accounts.operator.id, "operator@londos.example"],
      )
    ).rowCount
  )
    throw Error("Fictional operator mismatch");
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'analytics') ON CONFLICT DO NOTHING",
    [accounts.operator.id],
  );
  console.log(
    "The verified fictional operator can read local pilot aggregates after native fresh MFA. Credentials/default seed grants are preserved. Capture requires explicit LONDOS_PILOT_ANALYTICS=true in database mode; live analytics remains disabled.",
  );
} catch {
  console.error(
    "Local analytics setup failed; no credentials printed. Check private identity, migrations and development database.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
