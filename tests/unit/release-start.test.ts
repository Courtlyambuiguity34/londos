import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function start(mode: string, flag?: string, migrationFails = false) {
  const directory = mkdtempSync(join(tmpdir(), "londos-start-order-"));
  try {
    mkdirSync(join(directory, "dist"));
    writeFileSync(
      join(directory, "dist/migrate.mjs"),
      `
      if (Object.keys(process.env).some(k => k.startsWith('LONDOS_BOOTSTRAP_'))) process.exit(8);
      console.log('MIGRATION'); process.exit(${migrationFails ? 1 : 0});
    `,
    );
    writeFileSync(join(directory, "dist/bootstrap.mjs"), "console.log('BOOTSTRAP');");
    const runtime = `
      if (process.env.LONDOS_MIGRATE_ON_START ||
          Object.keys(process.env).some(k => k.startsWith('LONDOS_BOOTSTRAP_'))) process.exit(9);
      console.log('RUNTIME');
    `;
    writeFileSync(join(directory, "server.js"), runtime);
    writeFileSync(join(directory, "dist/worker.mjs"), runtime);
    return spawnSync(process.execPath, [resolve("scripts/release-entry.mjs"), mode], {
      cwd: directory,
      encoding: "utf8",
      env: {
        NODE_ENV: "production",
        LONDOS_BOOTSTRAP_ADMIN_EMAIL: "fictional@londos.invalid",
        ...(flag === undefined ? {} : { LONDOS_MIGRATE_ON_START: flag }),
      },
      timeout: 10_000,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
test.each([undefined, "false"])("startup migrations remain opt-in (%s)", (flag) => {
  const result = start("web", flag);
  expect(result.status).toBe(0);
  expect(result.stdout.trim().split("\n")).toEqual(["BOOTSTRAP", "RUNTIME"]);
});
test("enabled web startup migrates before bootstrap and removes startup secrets from children", () => {
  const result = start("web", "true");
  expect(result.status).toBe(0);
  expect(result.stdout.trim().split("\n")).toEqual(["MIGRATION", "BOOTSTRAP", "RUNTIME"]);
});
test("failed migrations prevent both bootstrap and web startup", () => {
  const result = start("web", "true", true);
  expect(result.status).toBe(1);
  expect(result.stdout.trim()).toBe("MIGRATION");
});
test("workers never apply migrations or bootstrap, even when the web flag is shared", () => {
  const result = start("worker", "true");
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe("RUNTIME");
});
test("a malformed startup flag fails without disclosing its value", () => {
  const result = start("web", "not-a-valid-private-value");
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe('{"event":"release.configuration_invalid"}\n');
});
