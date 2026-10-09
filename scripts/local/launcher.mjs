import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
process.chdir(root);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const rolePaths = Object.freeze({
  mall: "/",
  user: "/",
  shopkeeper: "/shopkeeper",
  landlord: "/landlord",
  superadmin: "/landlord",
});

export function normalizeMode(value = "local") {
  const mode = value.toLowerCase();
  if (mode === "full") return "local";
  if (!["preview", "local", "server"].includes(mode))
    throw new Error("Mode must be preview, local, or server.");
  return mode;
}

export function rolePath(value = "mall") {
  const path = rolePaths[value.toLowerCase()];
  if (!path) throw new Error("Role must be mall, shopkeeper, or landlord.");
  return path;
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    env: options.env ?? process.env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: options.capture ? "utf8" : undefined,
    shell: process.platform === "win32",
  });
  if (result.error || result.status !== 0) {
    const label = [program, ...args.slice(0, 2)].join(" ");
    throw new Error(`${label} failed (${result.error?.message ?? result.status}).`);
  }
  return result;
}

function verifyTools() {
  const nodeVersion = process.versions.node.split(".").map(Number);
  if (nodeVersion[0] !== 24 || nodeVersion[1] < 19)
    throw new Error(
      `Londos requires Node.js 24.19 or newer in the 24.x line; found ${process.versions.node}.`,
    );
  const result = command(npm, ["--version"], { capture: true });
  const npmVersion = String(result.stdout).trim();
  if (Number(npmVersion.split(".")[0]) !== 11)
    throw new Error(`Londos requires npm 11.x; found ${npmVersion || "unknown"}.`);
}

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

export function assertLocalConfiguration(values) {
  for (const key of ["DATABASE_URL", "AUTH_SECRET", "AUTH_BASE_URL"]) {
    if (!values[key]) throw new Error(`.env.local is missing ${key}.`);
  }
  const database = new URL(values.DATABASE_URL);
  const auth = new URL(values.AUTH_BASE_URL);
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!loopback.has(database.hostname) || database.port !== "54329")
    throw new Error(
      "Local install refuses to migrate a non-local database. Use server mode and the deployment runbook for hosted databases.",
    );
  if (!loopback.has(auth.hostname))
    throw new Error("Local install requires a loopback AUTH_BASE_URL.");
}

function install(mode) {
  verifyTools();
  console.log("Installing the exact locked Node.js dependencies...");
  command(npm, ["ci", "--no-fund", "--no-audit"]);
  if (mode === "local") {
    const envPath = resolve(root, ".env.local");
    if (existsSync(envPath)) assertLocalConfiguration(loadEnvFile(envPath));
    console.log("Preparing the private local PostgreSQL development database...");
    command(npm, ["run", "db:local"]);
    assertLocalConfiguration(loadEnvFile(envPath));
    command(npm, ["run", "db:migrate"]);
    command(npm, ["run", "db:seed"]);
  } else if (
    mode === "server" &&
    !existsSync(resolve(root, ".env.local")) &&
    !(process.env.DATABASE_URL && process.env.AUTH_SECRET && process.env.AUTH_BASE_URL)
  ) {
    throw new Error(
      "Server mode needs operator-managed environment variables or .env.local. See docs/CROSS-PLATFORM-DEPLOYMENT.md.",
    );
  }
  const env =
    mode === "preview"
      ? { ...process.env, LONDOS_CORE_ENABLED: "false", LONDOS_DATA_SOURCE: "fixtures" }
      : process.env;
  console.log("Building the production web application and worker...");
  command(npm, ["run", "build"], { env });
  console.log(`Londos ${mode} installation and build are complete. Click a START launcher.`);
}

function productionReady() {
  return (
    existsSync(resolve(root, ".next", "standalone", "server.js")) &&
    existsSync(resolve(root, "dist", "worker.mjs"))
  );
}

async function isLondosRunning(origin) {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1_000) });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.status === "preview" && body?.readiness === "/api/ready";
  } catch {
    return false;
  }
}

function openBrowser(url) {
  if (process.env.LONDOS_NO_BROWSER === "true") {
    console.log(`Londos is ready: ${url}`);
    return;
  }
  const options = { cwd: root, detached: true, stdio: "ignore", shell: false };
  let child;
  if (process.platform === "win32")
    child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], options);
  else if (process.platform === "darwin") child = spawn("open", [url], options);
  else child = spawn("xdg-open", [url], options);
  child.on("error", () =>
    console.log(`Open ${url} in your browser. The automatic browser opener is unavailable.`),
  );
  child.unref();
}

async function waitAndOpen(origin, path, shouldStop = () => false) {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (shouldStop()) return;
    if (await isLondosRunning(origin)) {
      openBrowser(new URL(path, origin).href);
      return;
    }
    await delay(500);
  }
  throw new Error(`Londos did not become healthy at ${origin} within 45 seconds.`);
}

async function start(mode, role) {
  verifyTools();
  if (!productionReady())
    throw new Error("Production build missing. Run the INSTALL launcher first.");
  if (mode !== "preview" && !existsSync(resolve(root, ".env.local")) && !process.env.DATABASE_URL)
    throw new Error(`${mode} mode needs operator-managed environment variables or .env.local.`);

  const port = process.env.PORT ?? "3000";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  const origin = `http://127.0.0.1:${port}`;
  const path = rolePath(role);
  if (await isLondosRunning(origin)) {
    console.log(`Londos is already running at ${origin}; opening ${role}.`);
    openBrowser(new URL(path, origin).href);
    return;
  }

  const env =
    mode === "preview"
      ? { ...process.env, PORT: port, LONDOS_CORE_ENABLED: "false", LONDOS_DATA_SOURCE: "fixtures" }
      : { ...process.env, PORT: port };
  const children = [];
  let stopping = false;
  const launch = (args, label) => {
    const child = spawn(npm, args, {
      cwd: root,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
      detached: process.platform !== "win32",
    });
    children.push(child);
    child.on("error", (error) => {
      console.error(`${label} failed: ${error.message}`);
      shutdown(1);
    });
    return child;
  };
  function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (child.exitCode !== null || !child.pid) continue;
      if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }
    }
    process.exitCode = code;
  }
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  if (mode !== "preview") {
    const worker = launch(["run", "worker"], "Worker");
    worker.on("exit", (code) => {
      if (!stopping) {
        console.error(`Worker stopped unexpectedly (${code ?? "unknown"}).`);
        shutdown(code && code > 0 ? code : 1);
      }
    });
  }
  const web = launch(["run", "start", "--", "--port", port], "Web server");
  web.on("exit", (code) => {
    if (!stopping) shutdown(code ?? 1);
  });
  console.log(`Londos is starting at ${origin}. This window keeps the server running.`);
  console.log("Press Ctrl+C to stop web and worker; the database volume is preserved.");
  void waitAndOpen(origin, path, () => stopping).catch((error) => {
    console.error(error.message);
    shutdown(1);
  });
  await new Promise((resolvePromise) => web.on("close", resolvePromise));
}

function stop(mode) {
  verifyTools();
  console.log("Close the START window or press Ctrl+C there to stop Londos web and worker.");
  if (mode === "local") command(npm, ["run", "db:stop"]);
}

function help() {
  console.log(
    `Usage: node scripts/local/launcher.mjs ACTION [MODE] [ROLE]\n\nActions: install, start, stop, help\nModes:   preview, local (or full), server\nRoles:   mall, shopkeeper, landlord`,
  );
}

async function main() {
  const action = (process.argv[2] ?? "help").toLowerCase();
  if (action === "help" || action === "--help" || action === "-h") return help();
  const mode = normalizeMode(process.argv[3]);
  const role = (process.argv[4] ?? "mall").toLowerCase();
  if (action === "install") return install(mode);
  if (action === "start") return start(mode, role);
  if (action === "stop") return stop(mode);
  throw new Error("Action must be install, start, stop, or help.");
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct)
  main().catch((error) => {
    console.error(`Londos launcher: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
