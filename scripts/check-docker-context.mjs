// Exercise Docker's actual ignore rules, then compile the release artifacts from
// that exported context. No database, provider credentials or image pull needed.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "londos-docker-context-"));
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
try {
  execFileSync(
    "docker",
    [
      "--host=unix:///var/run/docker.sock",
      "build",
      "--file",
      "-",
      "--output",
      `type=local,dest=${directory}`,
      ".",
    ],
    {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      input: "FROM scratch\nCOPY . /\n",
    },
  );
  for (const excluded of [".env", ".env.local", ".git", ".local", "core", "node_modules"])
    assert.equal(existsSync(join(directory, excluded)), false, `${excluded} leaked into context`);
  assert.ok(
    existsSync(join(directory, "scripts/release/bootstrap.ts")),
    "Docker context is missing the account-bootstrap entry point",
  );
  // Dependencies are already installed locally; they were not exported by Docker.
  symlinkSync(join(root, "node_modules"), join(directory, "node_modules"), "junction");
  execFileSync(process.execPath, ["scripts/build-worker.mjs"], {
    cwd: directory,
    stdio: "inherit",
  });
  for (const artifact of ["bootstrap", "worker", "operations", "migrate"])
    assert.ok(existsSync(join(directory, `dist/${artifact}.mjs`)), `${artifact} was not bundled`);
  console.log("Docker context: private paths excluded; all four release artifacts bundled.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
