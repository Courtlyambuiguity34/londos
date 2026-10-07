import type { Pool } from "pg";

export type BackupReceipt = { completedAt: string; verified: boolean; independentCopy: boolean };
export function operationalAlerts(
  snapshot: Record<string, unknown>,
  ready: boolean,
  latencyMs: number,
  backup: BackupReceipt | null,
  now = Date.now(),
) {
  const alerts: { code: string; severity: "critical" | "warning"; runbook: string }[] = [];
  const add = (code: string, severity: "critical" | "warning", runbook: string) =>
    alerts.push({ code, severity, runbook });
  if (!ready) add("web_not_ready", "critical", "database-outage");
  if (Number(snapshot.healthy_workers) < 1) add("worker_offline", "critical", "worker-backlog");
  if (Number(snapshot.oldest_job_seconds) > 60) add("queue_age", "warning", "worker-backlog");
  if (Number(snapshot.dead_jobs) > 0) add("dead_jobs", "warning", "worker-backlog");
  if (Number(snapshot.projection_lag) > 0) add("projection_lag", "warning", "worker-backlog");
  if (Number(snapshot.database_bytes) > 10 * 1024 ** 3)
    add("database_storage", "warning", "media-outage");
  if (Number(snapshot.media_bytes) > 5 * 1024 ** 3) add("media_storage", "warning", "media-outage");
  if (Number(snapshot.failed_media) > 0) add("failed_media", "warning", "media-outage");
  if (Number(snapshot.partial_invoices) > 0)
    add("rent_exceptions", "warning", "rent-reconciliation");
  if (Number(snapshot.auth_budget_pressure) > 0)
    add("auth_pressure", "warning", "credential-compromise");
  if (Number(snapshot.database_connections) >= 70)
    add("database_connections", "warning", "database-outage");
  if (latencyMs > 1000) add("web_probe_latency", "warning", "database-outage");
  const age = backup ? now - Date.parse(backup.completedAt) : NaN;
  if (backup?.verified !== true || !Number.isFinite(age) || age < -60000 || age > 86400000)
    add("backup_missing_or_stale", "critical", "backup-restore");
  if (backup?.independentCopy !== true)
    add("independent_backup_unverified", "critical", "backup-restore");
  return alerts;
}

export async function operationalSnapshot(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout='2s'");
    const row = (await client.query("SELECT * FROM londos_operations.snapshot")).rows[0];
    await client.query("COMMIT");
    return row as Record<string, unknown>;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
