import "server-only";
import { coreConfigured, coreConfig } from "./config";

export function databaseBrowsing() {
  const source = process.env.LONDOS_DATA_SOURCE ?? "fixtures";
  if (!["fixtures", "database"].includes(source)) throw new Error("Unsupported data source.");
  if (source === "database" && (!coreConfigured() || !coreConfig().localAdapters))
    throw new Error("Database public browsing requires the configured local development core.");
  return source === "database";
}

export function assertPreviewConfiguration(): void {
  databaseBrowsing();
}

export function previewCapabilities() {
  assertPreviewConfiguration();
  return {
    mode: databaseBrowsing() ? "database-development" : "fixture-preview",
    publicBrowsing: true,
    transactions: false,
    authentication: false,
    database: databaseBrowsing(),
    ai: false,
  };
}
