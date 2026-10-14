import "server-only";
import { coreConfigured, coreConfig } from "./config";

export function databaseBrowsing() {
  const source = process.env.LONDOS_DATA_SOURCE ?? "fixtures";
  if (!["fixtures", "database"].includes(source)) throw new Error("Unsupported data source.");
  if (source === "database") {
    if (!coreConfigured()) throw new Error("Database public browsing requires a configured core.");
    // Validate the complete PostgreSQL/origin contract in hosted and local mode.
    // Public readers still enforce publication, tenancy and moderation eligibility.
    coreConfig();
  }
  return source === "database";
}

export function assertPreviewConfiguration(): void {
  databaseBrowsing();
}

export function previewCapabilities() {
  assertPreviewConfiguration();
  return {
    mode: databaseBrowsing()
      ? coreConfig().localAdapters
        ? "database-development"
        : "database-core"
      : "fixture-preview",
    publicBrowsing: true,
    transactions: false,
    authentication: false,
    database: databaseBrowsing(),
    ai: false,
  };
}
