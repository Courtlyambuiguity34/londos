import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { operationalAlerts, operationalSnapshot, type BackupReceipt } from "./monitor";

const command = process.argv[2];
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 3000,
  statement_timeout: 2000,
});
try {
  if (command === "worker-health") {
    const id = (
      await readFile(process.env.LONDOS_WORKER_ID_FILE ?? "/tmp/londos-worker-id", "utf8")
    ).trim();
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("worker_identity_unavailable");
    if (
      !(
        await pool.query(
          "SELECT 1 FROM worker_heartbeats WHERE worker_id=$1 AND state='running' AND seen_at>clock_timestamp()-interval '30 seconds'",
          [id],
        )
      ).rowCount
    )
      throw new Error("worker_not_ready");
  } else if (command === "monitor") {
    const snapshot = await operationalSnapshot(pool);
    let backup: BackupReceipt | null = null;
    if (process.env.LONDOS_BACKUP_RECEIPT_FILE) {
      try {
        backup = JSON.parse(
          await readFile(process.env.LONDOS_BACKUP_RECEIPT_FILE, "utf8"),
        ) as BackupReceipt;
      } catch {
        /* Missing/unreadable/malformed receipt must alert. */
      }
    }
    const started = performance.now();
    let ready = false;
    try {
      const result = await fetch(
        process.env.LONDOS_HEALTH_URL ?? "http://127.0.0.1:3000/api/ready",
        { signal: AbortSignal.timeout(5000), redirect: "error" },
      );
      const body = await result.json();
      ready =
        result.ok && body.ready === true && body.database === true && body.authentication === true;
    } catch {
      /* Readiness failures are an alert, never silently healthy. */
    }
    const latencyMs = Math.round(performance.now() - started);
    const alerts = operationalAlerts(snapshot, ready, latencyMs, backup);
    console.log(
      JSON.stringify({
        event: "operations.snapshot",
        time: new Date().toISOString(),
        snapshot,
        latencyMs,
        alerts,
        recipient: process.env.LONDOS_ALERT_RECIPIENT ?? "unassigned",
        delivery: "stdout-only",
        externalStorageBandwidthAndProviderBills: "unavailable",
      }),
    );
    if (alerts.length) process.exitCode = 2;
  } else throw new Error("unknown_operations_command");
} catch {
  console.error(JSON.stringify({ event: "operations.failed", code: "capability_unavailable" }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
