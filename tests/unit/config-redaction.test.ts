import { afterEach, expect, test, vi } from "vitest";
import { coreConfig } from "../../src/server/config";

afterEach(() => vi.unstubAllEnvs());

test.each(["DATABASE_URL", "AUTH_BASE_URL"])(
  "malformed %s cannot expose credential input in startup errors",
  (name) => {
    vi.stubEnv("LONDOS_DATABASE_ENGINE", "postgresql");
    vi.stubEnv("LONDOS_MONGODB_MIGRATION_ENABLED", "false");
    vi.stubEnv("DATABASE_URL", "postgresql://fixture:fictional@localhost/londos_development");
    vi.stubEnv("AUTH_SECRET", "fictional-auth-secret-with-at-least-32-characters");
    vi.stubEnv("AUTH_BASE_URL", "http://127.0.0.1:3000");
    vi.stubEnv(name, "https://user:PRIVATE-CONFIG-SENTINEL@[invalid");
    let error: unknown;
    try {
      coreConfig();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(`${name} must be a valid URL.`);
    expect(String((error as Error).stack)).not.toContain("PRIVATE-CONFIG-SENTINEL");
    expect(JSON.stringify(error)).not.toContain("PRIVATE-CONFIG-SENTINEL");
    expect((error as Error).cause).toBeUndefined();
    expect(error).not.toHaveProperty("input");
  },
);
