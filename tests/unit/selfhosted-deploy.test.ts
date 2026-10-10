import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const moduleAt = (path: string) => import(pathToFileURL(resolve(root, path)).href);
const valid = {
  DEPLOY_MODE: "selfhosted",
  DATABASE_URL: "postgresql://londos:fictional@127.0.0.1:5432/londos",
  AUTH_SECRET: "fictional-secret-with-at-least-32-characters",
  AUTH_BASE_URL: "https://api.londos.example",
};

describe("self-hosted production entry point", () => {
  test("accepts only compiled-production environment shape with loopback PostgreSQL", async () => {
    const { validateSelfhostedEnvironment } = (await moduleAt(
      "deploy/selfhosted/start-production.mjs",
    )) as {
      validateSelfhostedEnvironment: (environment: Record<string, string>) => void;
    };
    expect(() => validateSelfhostedEnvironment(valid)).not.toThrow();
    expect(() => validateSelfhostedEnvironment({ ...valid, DEPLOY_MODE: "render" })).toThrow(
      "DEPLOY_MODE must be selfhosted",
    );
    expect(() =>
      validateSelfhostedEnvironment({
        ...valid,
        DATABASE_URL: "postgresql://londos:fictional@database.example/londos",
      }),
    ).toThrow("loopback PostgreSQL");
  });

  test("rejects malformed configuration without returning the supplied credential", async () => {
    const { validateSelfhostedEnvironment } = (await moduleAt(
      "deploy/selfhosted/start-production.mjs",
    )) as {
      validateSelfhostedEnvironment: (environment: Record<string, string>) => void;
    };
    const sentinel = "PRIVATE-CONFIG-SENTINEL";
    let error: unknown;
    try {
      validateSelfhostedEnvironment({ ...valid, DATABASE_URL: `postgresql://${sentinel}@[bad` });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).stack)).not.toContain(sentinel);
  });
});

describe("PostgreSQL transfer guardrails", () => {
  test("requires a remote TLS Aiven source and loopback restore target", async () => {
    const { validateAivenSource, validateLocalTarget } = (await moduleAt(
      "deploy/selfhosted/postgres-tools.mjs",
    )) as {
      validateAivenSource: (value: string) => URL;
      validateLocalTarget: (value: string) => URL;
    };
    expect(
      validateAivenSource(
        "postgresql://avnadmin:fictional@project.aivencloud.com:12345/defaultdb?sslmode=require",
      ).hostname,
    ).toBe("project.aivencloud.com");
    expect(() =>
      validateAivenSource("postgresql://avnadmin:fictional@project.aivencloud.com/defaultdb"),
    ).toThrow("require TLS");
    expect(() =>
      validateAivenSource("postgresql://avnadmin:fictional@127.0.0.1/defaultdb?sslmode=require"),
    ).toThrow("must be remote");
    expect(
      validateLocalTarget("postgresql://londos:fictional@localhost:5432/londos").hostname,
    ).toBe("localhost");
    expect(() =>
      validateLocalTarget("postgresql://londos:fictional@database.example/londos"),
    ).toThrow("loopback PostgreSQL");
  });

  test("service definitions use production scripts, unprivileged account and restart policy", async () => {
    for (const role of ["web", "worker"]) {
      const unit = await readFile(
        resolve(root, `deploy/selfhosted/systemd/londos-${role}.service`),
        "utf8",
      );
      expect(unit).toContain("User=londos");
      expect(unit).toContain(`start-production.sh ${role}`);
      expect(unit).toContain("Restart=on-failure");
      expect(unit).not.toContain("next dev");
    }
    const tunnel = await readFile(
      resolve(root, "deploy/selfhosted/cloudflared-config.yml.example"),
      "utf8",
    );
    expect(tunnel).toContain("service: http://127.0.0.1:3000");
    expect(tunnel).toContain("service: http_status:404");
    expect(tunnel).not.toMatch(/postgres|5432/i);
  });
});
