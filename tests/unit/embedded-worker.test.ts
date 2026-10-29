import { test, expect } from "vitest";
import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const entry = resolve("scripts/release-entry.mjs");
function fixture(web = "console.log('WEB');", worker = "console.log('WORKER');") {
  const directory = mkdtempSync(join(tmpdir(), "londos-embedded-"));
  mkdirSync(join(directory, "dist"));
  writeFileSync(join(directory, "server.js"), web);
  writeFileSync(join(directory, "dist/worker.mjs"), worker);
  for (const name of ["migrate", "bootstrap", "operations"])
    writeFileSync(
      join(directory, `dist/${name}.mjs`),
      `console.log('${name}', ...process.argv.slice(2));`,
    );
  return directory;
}
const env = { NODE_ENV: "production" as const, LONDOS_EMBEDDED_WORKER: "true" };
const staying = (label: string) => `
  if (Object.keys(process.env).some(k => k.startsWith('LONDOS_BOOTSTRAP_'))) process.exit(9);
  setInterval(() => {}, 1000);
  process.on('SIGTERM', () => { console.log('${label}_STOPPED'); process.exit(0); });
  console.log('${label}_READY');
`;
test.each([
  ["migrate", "migrate"],
  ["bootstrap", "bootstrap"],
  ["monitor", "operations monitor"],
  ["worker-health", "operations worker-health"],
  ["worker", "WORKER"],
])(
  "embedded flag does not change one-off/standalone %s arguments or successful exit",
  (mode, output) => {
    const directory = fixture();
    try {
      const result = spawnSync(process.execPath, [entry, mode!], {
        cwd: directory,
        env,
        encoding: "utf8",
        timeout: 5000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(output);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
test.each([0, 7])("worker exit %s stops the web process and fails the container", (code) => {
  const directory = fixture(staying("WEB"), `setTimeout(() => process.exit(${code}), 300);`);
  try {
    const result = spawnSync(process.execPath, [entry, "web"], {
      cwd: directory,
      env,
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.status).toBe(code || 1);
    expect(result.stdout).toContain("WEB_STOPPED");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("web failure stops the embedded worker", () => {
  const directory = fixture("setTimeout(() => process.exit(3), 300);", staying("WORKER"));
  try {
    const result = spawnSync(process.execPath, [entry, "web"], {
      cwd: directory,
      env,
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.status).toBe(3);
    expect(result.stdout).toContain("WORKER_STOPPED");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("container termination is forwarded to both children", async () => {
  const directory = fixture(staying("WEB"), staying("WORKER"));
  const child = spawn(process.execPath, [entry, "web"], {
    cwd: directory,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let terminationSent = false;
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      if (!terminationSent && output.includes("WEB_READY") && output.includes("WORKER_READY")) {
        terminationSent = true;
        child.kill("SIGTERM");
      }
    });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("exit", resolve);
      child.on("error", reject);
    });
    expect(code).toBe(143);
    expect(output).toContain("WEB_STOPPED");
    expect(output).toContain("WORKER_STOPPED");
  } finally {
    clearTimeout(timeout);
    rmSync(directory, { recursive: true, force: true });
  }
});
