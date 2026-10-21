import type { Pool } from "pg";
import { requireOperator, type Actor } from "../security/authorization";
import { cloudinarySettings, mongoSettings, redisSettings } from "./config";
import { brevoSettings } from "../jobs/brevo";

type ServiceStatus = {
  name: string;
  status: "disabled" | "configured" | "warning";
  message: string;
};
// A static allowlist of messages: no URLs, credentials, validation issues or raw errors.
export function serviceConfigurationStatus(): ServiceStatus[] {
  const result: ServiceStatus[] = [];
  const check = (name: string, flag: string, validate: () => unknown, configured: string) => {
    const enabled = process.env[flag] ?? "false";
    if (enabled === "false")
      result.push({
        name,
        status: "disabled",
        message: "Optional service disabled. PostgreSQL workflows remain available.",
      });
    else if (enabled !== "true")
      result.push({
        name,
        status: "warning",
        message: "Use the literal true or false in secure environment settings.",
      });
    else {
      try {
        validate();
        result.push({ name, status: "configured", message: configured });
      } catch {
        result.push({
          name,
          status: "warning",
          message:
            "Enabled service has missing or invalid credentials/settings. Correct them in secure environment settings and restart.",
        });
      }
    }
  };
  check(
    "MongoDB",
    "LONDOS_MONGODB_ENABLED",
    mongoSettings,
    "Public catalogue copy configured. Run mongo:verify to check the connection; PostgreSQL remains authoritative.",
  );
  check(
    "Cloudinary",
    "LONDOS_CLOUDINARY_ENABLED",
    cloudinarySettings,
    "Public image copy configured. Run services -- check to verify provider access.",
  );
  if (
    process.env.LONDOS_MONGODB_ENABLED === "true" &&
    process.env.LONDOS_CLOUDINARY_ENABLED !== "true"
  )
    result.push({
      name: "Public image linkage",
      status: "warning",
      message:
        "MongoDB can be verified independently. Copying a public catalogue with images requires Cloudinary to be enabled and configured.",
    });
  check(
    "Redis",
    "LONDOS_REDIS_ENABLED",
    redisSettings,
    "Optional connection check configured. Durable jobs and subscriptions use PostgreSQL; Redis is not required.",
  );
  if (process.env.LONDOS_LOCAL_ADAPTERS === "true")
    result.push({
      name: "Email",
      status: "configured",
      message: "Development notifications use the private local sink. No live email is sent.",
    });
  else {
    try {
      brevoSettings();
      result.push({
        name: "Brevo",
        status: "configured",
        message:
          "Provider configured. Run email:verify; sender verification and inbox delivery still require testing.",
      });
    } catch {
      result.push({
        name: "Brevo",
        status: "warning",
        message:
          "Remote email needs the Brevo API key and verified sender settings. Remote authentication fails closed while unavailable.",
      });
    }
  }
  if (
    (process.env.LONDOS_DATABASE_ENGINE ?? "postgresql") !== "postgresql" ||
    (process.env.LONDOS_MONGODB_MIGRATION_ENABLED !== undefined &&
      process.env.LONDOS_MONGODB_MIGRATION_ENABLED !== "false")
  )
    result.push({
      name: "Database authority",
      status: "warning",
      message:
        "Keep the database engine postgresql and MongoDB migration false. A canonical migration is unsupported.",
    });
  return result;
}
export async function readServiceConfiguration(pool: Pool, actor: Actor) {
  await requireOperator(pool, actor, "operations", true);
  const worker = (
    await pool.query(
      "SELECT EXISTS(SELECT 1 FROM worker_heartbeats WHERE state='running' AND seen_at>now()-interval '30 seconds') AS ready",
    )
  ).rows[0].ready;
  return {
    verification: "configuration only; no provider request made",
    services: [
      ...serviceConfigurationStatus(),
      {
        name: "Background worker",
        status: worker ? "configured" : "warning",
        message: worker
          ? "A worker has a recent heartbeat. Review failed delivery jobs if email is delayed."
          : "No recent worker heartbeat. Verification and recovery emails remain queued until an independent worker runs against this database.",
      },
    ],
  };
}
