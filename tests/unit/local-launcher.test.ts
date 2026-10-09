import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const launcher = resolve(root, "scripts/local/launcher.mjs");

test("launcher help is side-effect free and documents supported modes and roles", () => {
  const output = execFileSync(process.execPath, [launcher, "help"], {
    encoding: "utf8",
    cwd: root,
  });
  expect(output).toContain("preview, local (or full), server");
  expect(output).toContain("mall, shopkeeper, landlord");
});

test("launcher rejects unknown modes before installing or starting", () => {
  const result = spawnSync(process.execPath, [launcher, "start", "production", "mall"], {
    encoding: "utf8",
    cwd: root,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Mode must be preview, local, or server");
});

test("local configuration guard accepts only the marked loopback database shape", () => {
  const code = `
    import { assertLocalConfiguration } from ${JSON.stringify(pathToFileURL(launcher).href)};
    assertLocalConfiguration({
      DATABASE_URL: 'postgresql://londos:fixture@127.0.0.1:54329/londos_development',
      AUTH_SECRET: 'fixture-secret-at-least-thirty-two-characters',
      AUTH_BASE_URL: 'http://127.0.0.1:3000'
    });
    let rejected = false;
    try {
      assertLocalConfiguration({
        DATABASE_URL: 'postgresql://londos:fixture@database.example/londos',
        AUTH_SECRET: 'fixture-secret-at-least-thirty-two-characters',
        AUTH_BASE_URL: 'https://londos.example'
      });
    } catch { rejected = true; }
    if (!rejected) process.exit(2);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], {
    encoding: "utf8",
    cwd: root,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe("");
});

test("launcher derives local listening and browser origins from AUTH_BASE_URL", () => {
  const code = `
    import { launchTargets } from ${JSON.stringify(pathToFileURL(launcher).href)};
    const local = launchTargets('local', { AUTH_BASE_URL: 'http://127.0.0.1:3210' });
    if (JSON.stringify(local) !== JSON.stringify({
      port: '3210',
      healthOrigin: 'http://127.0.0.1:3210',
      publicOrigin: 'http://127.0.0.1:3210'
    })) process.exit(2);
    const server = launchTargets('server', {
      AUTH_BASE_URL: 'https://mall.example',
      PORT: '10000'
    });
    if (server.healthOrigin !== 'http://127.0.0.1:10000') process.exit(3);
    if (server.publicOrigin !== 'https://mall.example') process.exit(4);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], {
    encoding: "utf8",
    cwd: root,
  });
  expect(result.status, result.stderr).toBe(0);
});

test("launcher rejects a local port that would break the configured authentication origin", () => {
  const code = `
    import { launchTargets } from ${JSON.stringify(pathToFileURL(launcher).href)};
    launchTargets('local', {
      AUTH_BASE_URL: 'http://127.0.0.1:3000',
      PORT: '3309'
    });
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], {
    encoding: "utf8",
    cwd: root,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    "Local PORT 3309 must match AUTH_BASE_URL port 3000; change both together.",
  );
});

test("one-click wrappers target the shared launcher and role entry points", () => {
  expect(readFileSync(resolve(root, "INSTALL-WINDOWS.bat"), "utf8")).toContain(
    "launcher.mjs install %MODE%",
  );
  expect(readFileSync(resolve(root, "START-SHOPKEEPER-WINDOWS.bat"), "utf8")).toContain(
    "local shopkeeper",
  );
  expect(readFileSync(resolve(root, "START-LANDLORD-WINDOWS.bat"), "utf8")).toContain(
    "local landlord",
  );
  expect(readFileSync(resolve(root, "start-shopkeeper-linux.sh"), "utf8")).toContain(
    "start local shopkeeper",
  );
  expect(readFileSync(resolve(root, "start-landlord-macos.command"), "utf8")).toContain(
    "start local landlord",
  );
});
