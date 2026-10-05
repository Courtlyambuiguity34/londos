import "server-only";
import { coreConfigured, coreConfig } from "./config";
import { database } from "./db/pool";
import { requiredMigration } from "./db/schema-contract";
export async function readiness() {
  if (!coreConfigured())
    return {
      ready: true,
      mode: "fixture-preview",
      database: false,
      authentication: false,
      worker: "not-configured",
      financialOperations: false,
      liveNotifications: false,
    };
  try {
    const config = coreConfig();
    const db = database();
    const migrations = await db.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
      requiredMigration,
    ]);
    if (!migrations.rowCount || !config.localAdapters) throw new Error("Core is incomplete");
    const worker = await db.query(
      "SELECT EXISTS(SELECT 1 FROM worker_heartbeats WHERE state='running' AND seen_at>now()-interval '30 seconds') AS ready",
    );
    return {
      ready: true,
      mode: "development-core",
      database: true,
      authentication: true,
      worker: worker.rows[0].ready ? "ready" : "offline",
      financialOperations: false,
      liveNotifications: false,
    };
  } catch {
    return {
      ready: false,
      mode: "development-core",
      database: false,
      authentication: false,
      worker: "unknown",
      financialOperations: false,
      liveNotifications: false,
    };
  }
}
