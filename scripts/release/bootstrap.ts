import { Pool } from "pg";
import { bootstrapAccounts } from "../../src/server/bootstrap-accounts";
import { coreConfig } from "../../src/server/config";
import { failureCategory } from "../../src/server/diagnostics";

let pool: Pool | undefined;
try {
  pool = new Pool({
    connectionString: coreConfig().databaseUrl,
    max: 2,
    connectionTimeoutMillis: 5000,
  });
  pool.on("error", () => {
    console.error(JSON.stringify({ event: "bootstrap.database_connection_lost" }));
    process.exitCode = 1;
  });
  const result = await bootstrapAccounts(pool);
  console.log(JSON.stringify({ event: "bootstrap.complete", ...result }));
} catch (error) {
  const known = new Set([
    "bootstrap_credentials_invalid",
    "bootstrap_accounts_must_be_distinct",
    "bootstrap_email_configuration_required",
    "bootstrap_existing_identity_refused",
    "bootstrap_existing_operator_refused",
  ]);
  const category =
    error instanceof Error && known.has(error.message) ? error.message : failureCategory(error);
  console.error(JSON.stringify({ event: "bootstrap.failed", category }));
  process.exitCode = 1;
} finally {
  await pool?.end();
}
