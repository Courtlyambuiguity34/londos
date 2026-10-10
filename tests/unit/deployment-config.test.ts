import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { coreConfig, deploymentMode } from "../../src/server/config";
import { acceptedRequestOrigin, corsResponse } from "../../src/server/security/origin";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:fictional@localhost/londos_development");
  vi.stubEnv("AUTH_SECRET", "fictional-auth-secret-with-at-least-32-characters");
  vi.stubEnv("AUTH_BASE_URL", "https://api.londos.example");
});
afterEach(() => vi.unstubAllEnvs());

describe("deployment mode", () => {
  test("Render remains the default and uses a small database pool", () => {
    expect(deploymentMode()).toBe("render");
    expect(coreConfig()).toMatchObject({ deployMode: "render", databasePoolMax: 3 });
  });

  test("self-hosted mode is selected only by environment", () => {
    vi.stubEnv("DEPLOY_MODE", "selfhosted");
    expect(coreConfig().deployMode).toBe("selfhosted");
  });

  test("unknown modes fail closed", () => {
    vi.stubEnv("DEPLOY_MODE", "desktop");
    expect(() => coreConfig()).toThrow("DEPLOY_MODE must be render or selfhosted.");
  });
});

describe("PWA origin boundary", () => {
  test("accepts only configured exact origins and still rejects cross-site requests", () => {
    vi.stubEnv(
      "LONDOS_PWA_ORIGINS",
      "https://mall.londos.example,https://shop.londos.example,https://admin.londos.example",
    );
    expect(coreConfig().allowedOrigins).toEqual([
      "https://api.londos.example",
      "https://mall.londos.example",
      "https://shop.londos.example",
      "https://admin.londos.example",
    ]);
    expect(
      acceptedRequestOrigin(
        new Request("https://api.londos.example/api/ready", {
          headers: { origin: "https://shop.londos.example", "sec-fetch-site": "same-site" },
        }),
      ),
    ).toBe("https://shop.londos.example");
    expect(
      acceptedRequestOrigin(
        new Request("https://api.londos.example/api/ready", {
          headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toBeNull();
    const request = new Request("https://api.londos.example/api/workspace/shops", {
      headers: { origin: "https://shop.londos.example", "sec-fetch-site": "same-site" },
    });
    const response = corsResponse(request, Response.json({ ok: true }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://shop.londos.example");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  test("rejects more than three, duplicates, insecure remote and path-bearing origins", () => {
    for (const value of [
      "https://one.example,https://two.example,https://three.example,https://four.example",
      "https://one.example,https://one.example",
      "http://mall.londos.example",
      "https://mall.londos.example/path",
    ]) {
      vi.stubEnv("LONDOS_PWA_ORIGINS", value);
      expect(() => coreConfig()).toThrow(/LONDOS_PWA_ORIGINS/);
    }
  });
});
