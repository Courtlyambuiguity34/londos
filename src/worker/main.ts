import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { loadLocalEnv } from "../../scripts/local-env";
import { coreConfig } from "../server/config";
import { database } from "../server/db/pool";
import { LocalNotifications } from "../server/jobs/adapters";
import { claim, acknowledge, heartbeat, fail } from "../server/jobs/queue";
import { handle } from "../server/jobs/handlers";
import { schedule } from "../server/jobs/scheduler";
import { withinDeadline } from "../server/jobs/deadline";
loadLocalEnv();
if (!coreConfig().localAdapters) throw new Error("Live worker adapters are not configured.");
const pool = database(),
  workerId = randomUUID(),
  notifications = new LocalNotifications();
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
function log(event: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, workerId, ...detail }));
}
log("worker.started", { adapters: "local-private-sink" });
pool.on("error", () => log("database.connection.lost"));
try {
  while (!stopping) {
    await pool.query(
      "INSERT INTO worker_heartbeats(worker_id,seen_at,state) VALUES($1,now(),'running') ON CONFLICT(worker_id) DO UPDATE SET seen_at=now(),state='running'",
      [workerId],
    );
    await schedule(pool);
    const job = await claim(pool);
    if (!job) {
      await setTimeout(500);
      continue;
    }
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(new Error("timeout")), 20_000);
    const pulse = globalThis.setInterval(() => {
      void heartbeat(pool, job)
        .then((owned) => {
          if (!owned) controller.abort(new Error("lease_lost"));
        })
        .catch(() => controller.abort(new Error("heartbeat_failed")));
    }, 5_000);
    try {
      await withinDeadline((signal) => handle(pool, job, notifications, signal), controller.signal);
      if (await acknowledge(pool, job)) log("job.done", { jobId: job.id, kind: job.kind });
    } catch (error) {
      const code = controller.signal.aborted
        ? "timeout"
        : error instanceof Error && error.message === "unsupported_job"
          ? "unsupported_job"
          : "handler_failed";
      await fail(pool, job, code);
      log("job.failed", { jobId: job.id, code }); // Never include payloads, credentials or provider errors.
    } finally {
      globalThis.clearTimeout(timeout);
      globalThis.clearInterval(pulse);
    }
  }
} catch {
  log("worker.failed", { code: "core_unavailable" });
  process.exitCode = 1;
} finally {
  await pool
    .query("UPDATE worker_heartbeats SET seen_at=now(),state='stopped' WHERE worker_id=$1", [
      workerId,
    ])
    .catch(() => log("worker.heartbeat.unavailable"));
  await pool.end();
  log("worker.stopped");
}
