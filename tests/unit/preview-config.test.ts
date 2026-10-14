import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { databaseBrowsing, previewCapabilities } from "../../src/server/preview";

beforeEach(() => {
  vi.stubEnv("DEPLOY_MODE", "render");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://fixture:fixture@database.example/londos?sslmode=require",
  );
  vi.stubEnv("AUTH_SECRET", "fictional-secret-at-least-thirty-two-characters");
  vi.stubEnv("AUTH_BASE_URL", "https://londos-test.onrender.com");
  vi.stubEnv("LONDOS_CORE_ENABLED", "true");
  vi.stubEnv("LONDOS_DATA_SOURCE", "database");
  vi.stubEnv("LONDOS_LOCAL_ADAPTERS", "false");
  vi.stubEnv("LONDOS_DATABASE_ENGINE", "postgresql");
  vi.stubEnv("LONDOS_MONGODB_MIGRATION_ENABLED", "false");
  vi.stubEnv("LONDOS_PWA_ORIGINS", "https://londos-test.onrender.com");
});
afterEach(() => vi.unstubAllEnvs());

test("Render can serve the canonical public catalogue without development adapters", () => {
  expect(databaseBrowsing()).toBe(true);
  expect(previewCapabilities()).toMatchObject({ mode: "database-core", database: true });
});

test("local database browsing keeps its existing capability label", () => {
  vi.stubEnv("AUTH_BASE_URL", "http://127.0.0.1:3000");
  vi.stubEnv("LONDOS_LOCAL_ADAPTERS", "true");
  expect(previewCapabilities()).toMatchObject({ mode: "database-development", database: true });
});

test("credential-free fixture preview stays available", () => {
  vi.stubEnv("LONDOS_DATA_SOURCE", "fixtures");
  vi.stubEnv("LONDOS_CORE_ENABLED", "false");
  vi.stubEnv("DATABASE_URL", "");
  expect(databaseBrowsing()).toBe(false);
  expect(previewCapabilities()).toMatchObject({ mode: "fixture-preview", database: false });
});

test("database browsing still rejects disabled, missing and invalid core configuration", () => {
  vi.stubEnv("LONDOS_CORE_ENABLED", "false");
  expect(() => databaseBrowsing()).toThrow();
  vi.stubEnv("LONDOS_CORE_ENABLED", "true");
  vi.stubEnv("AUTH_SECRET", "");
  expect(() => databaseBrowsing()).toThrow();
  vi.stubEnv("AUTH_SECRET", "short");
  expect(() => databaseBrowsing()).toThrow();
  vi.stubEnv("AUTH_SECRET", "fictional-secret-at-least-thirty-two-characters");
  vi.stubEnv("AUTH_BASE_URL", "http://londos-test.onrender.com");
  expect(() => databaseBrowsing()).toThrow();
});

test("MongoDB replacement and unknown data sources remain rejected", () => {
  vi.stubEnv("LONDOS_DATABASE_ENGINE", "mongodb");
  expect(() => databaseBrowsing()).toThrow();
  vi.stubEnv("LONDOS_DATABASE_ENGINE", "postgresql");
  vi.stubEnv("LONDOS_MONGODB_MIGRATION_ENABLED", "true");
  expect(() => databaseBrowsing()).toThrow();
  vi.stubEnv("LONDOS_DATA_SOURCE", "unknown");
  expect(() => databaseBrowsing()).toThrow("Unsupported data source.");
});
