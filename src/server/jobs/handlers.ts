import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "../db/pool";
import type { Job } from "./queue";
import type { NotificationAdapter } from "./adapters";

export async function handle(
  pool: Pool,
  job: Job,
  notifications: NotificationAdapter,
  signal: AbortSignal,
) {
  if (job.schema_version !== 1) throw new Error("unsupported_job");
  signal.throwIfAborted();
  if (job.kind === "privacy.erase") {
    const { handlePrivacyErasure } = await import("../privacy");
    await handlePrivacyErasure(pool, job, signal);
    return;
  }
  if (job.kind === "rent.tick") {
    const { handleRentTick } = await import("./rent");
    await handleRentTick(pool, job, signal);
    return;
  }
  if (job.kind === "media.process") {
    const { processMedia } = await import("../media");
    await processMedia(pool, job, signal);
    return;
  }
  if (job.kind === "notification.local") {
    if (job.payload.template === "application-review-queue") {
      const { reviewAlertAllowed } = await import("../operator-review-alerts");
      if (!(await reviewAlertAllowed(pool, job.payload))) return;
    }
    await notifications.deliver(job.id, job.payload, signal, { leaseToken: job.lease_token });
    return;
  }
  if (
    !["shop.profile.changed", "security.membership.changed", "system.maintenance"].includes(
      job.kind,
    )
  )
    throw new Error("unsupported_job");
  await transaction(pool, async (client) => {
    // Fence a stale worker before its transactional effect.
    const owned = await client.query(
      "SELECT id FROM jobs WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now() FOR UPDATE",
      [job.id, job.lease_token],
    );
    if (!owned.rowCount) throw new Error("lease_lost");
    const inserted = await client.query(
      "INSERT INTO job_effects(job_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING job_id",
      [job.id],
    );
    if (!inserted.rowCount) return;
    if (job.kind === "shop.profile.changed") {
      const payload = z
        .object({ shopId: z.uuid(), version: z.number().int().positive() })
        .strict()
        .parse(job.payload);
      if (payload.shopId !== job.shop_id || !job.merchant_id) throw new Error("unsupported_job");
      // Read canonical state; never publish stale values from an event payload.
      await client.query(
        `INSERT INTO shop_projections(shop_id,version,name)
        SELECT id,version,name FROM shops WHERE id=$1 AND merchant_id=$2 AND version>=$3
        ON CONFLICT(shop_id) DO UPDATE SET version=excluded.version,name=excluded.name,updated_at=now()
        WHERE shop_projections.version<excluded.version`,
        [payload.shopId, job.merchant_id, payload.version],
      );
    } else if (job.kind === "security.membership.changed") {
      z.object({ userId: z.string().min(1).max(128) })
        .strict()
        .parse(job.payload);
      // Membership enforcement already reads canonical state; notification is advisory.
    } else {
      z.object({ tick: z.string().max(40) })
        .strict()
        .parse(job.payload);
      await client.query("DELETE FROM worker_heartbeats WHERE seen_at<now()-interval '7 days'");
      await client.query(
        "DELETE FROM request_budgets WHERE window_id<floor(extract(epoch FROM now())/60)::bigint-120",
      );
      await client.query("DELETE FROM mfa_code_receipts WHERE expires_at<now()");
      const { cleanupMedia } = await import("../media");
      await cleanupMedia(client);
      const { cleanupCatalogueHistory } = await import("../catalogue-recovery");
      await cleanupCatalogueHistory(client);
      const { cleanupPilotMetrics } = await import("../analytics");
      await cleanupPilotMetrics(client);
      const { cleanupAssistantRequests } = await import("../ai-design/service");
      await cleanupAssistantRequests(client);
    }
    signal.throwIfAborted();
  });
}
