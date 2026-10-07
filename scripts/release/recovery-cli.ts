import { readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { recoveryKey, seal, unseal } from "./crypto";
import { captureRecoveryAuthority, admitRestoredCluster } from "./recovery";

// Deliberately does not load .env.local or start web/worker. The operator selects
// an isolated cluster and separately supplied current authority/key custody.
const [command, input, output] = process.argv.slice(2);
let pool: Pool | undefined;
try {
  if (!process.env.LONDOS_RECOVERY_KEY_FILE) throw new Error("key_not_configured");
  const key = await recoveryKey(process.env.LONDOS_RECOVERY_KEY_FILE);
  if (command === "seal" || command === "unseal") {
    if (!input || !output) throw new Error("input_and_output_required");
    await (command === "seal" ? seal : unseal)(input, output, key);
  } else if (command === "capture" || command === "admit") {
    if (!input || !process.env.DATABASE_URL || process.env.LONDOS_RECOVERY_FENCED !== "true")
      throw new Error("explicit_fenced_database_required");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000,
    });
    if (command === "capture") {
      await writeFile(input, JSON.stringify(await captureRecoveryAuthority(pool, key)), {
        flag: "wx",
        mode: 0o600,
      });
    } else await admitRestoredCluster(pool, JSON.parse(await readFile(input, "utf8")), key);
  } else throw new Error("unsupported_command");
  console.log(
    JSON.stringify({
      event: "recovery.command",
      command,
      result: "passed",
      admissionOpensTraffic: false,
    }),
  );
} catch {
  console.error(
    JSON.stringify({ event: "recovery.command", result: "failed", accessMustRemainIsolated: true }),
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
