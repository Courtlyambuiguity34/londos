import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
process.chdir(root);

const npmProgram = process.platform === "win32" ? process.execPath : "npm";
const npmEntryPoint =
  process.platform === "win32"
    ? resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
    : null;
const statePath = resolve(root, ".local", "londos-launcher.json");
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
    shell: false,
  });
  if (result.error || result.status !== 0) {
    const label = options.label ?? [program, ...args.slice(0, 2)].join(" ");
    throw new Error(`${label} failed (${result.error?.message ?? result.status}).`);
  }
  return result;
}

function npmArguments(args) {
  return npmEntryPoint ? [npmEntryPoint, ...args] : args;
}

function npmCommand(args, options = {}) {
  return command(npmProgram, npmArguments(args), {
    ...options,
    label: ["npm", ...args.slice(0, 2)].join(" "),
  });
}

function verifyTools() {
  const nodeVersion = process.versions.node.split(".").map(Number);
  if (nodeVersion[0] !== 24 || nodeVersion[1] < 19)
    throw new Error(
      `Londos requires Node.js 24.19 or newer in the 24.x line; found ${process.versions.node}.`,
    );
  const result = npmCommand(["--version"], { capture: true });
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

export function localSubprocessEnvironment(values, inherited = process.env) {
  return { ...inherited, ...values };
}

function readLauncherState() {
  if (!existsSync(statePath)) return null;
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (
      state?.version !== 1 ||
      !Number.isInteger(state.launcherPid) ||
      state.launcherPid < 1 ||
      !Array.isArray(state.childPids) ||
      !state.childPids.every((pid) => Number.isInteger(pid) && pid > 0) ||
      !["local", "server", "preview"].includes(state.mode) ||
      typeof state.port !== "string"
    )
      return null;
    return state;
  } catch {
    return null;
  }
}

function writeLauncherState(mode, port, children) {
  mkdirSync(resolve(root, ".local"), { recursive: true, mode: 0o700 });
  writeFileSync(
    statePath,
    `${JSON.stringify(
      {
        version: 1,
        launcherPid: process.pid,
        childPids: children.flatMap((child) => (child.pid ? [child.pid] : [])),
        mode,
        port,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
}

function clearLauncherState(launcherPid = process.pid) {
  const state = readLauncherState();
  if (state?.launcherPid === launcherPid)
    try {
      unlinkSync(statePath);
    } catch {
      // A missing/stale local state file must not hide process shutdown.
    }
}

function processRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function launchTargets(mode, values = {}) {
  const requestedPort = values.PORT;
  if (requestedPort && !/^\d+$/.test(requestedPort))
    throw new Error("PORT must be between 1 and 65535.");

  if (mode === "preview") {
    const port = requestedPort ?? "3000";
    if (Number(port) < 1 || Number(port) > 65535)
      throw new Error("PORT must be between 1 and 65535.");
    const origin = `http://127.0.0.1:${port}`;
    return { port, healthOrigin: origin, publicOrigin: origin };
  }

  const configured = values.AUTH_BASE_URL;
  if (!configured) throw new Error(`${mode} mode needs AUTH_BASE_URL.`);
  let publicURL;
  try {
    publicURL = new URL(configured);
  } catch {
    throw new Error("AUTH_BASE_URL must be a valid HTTP(S) origin.");
  }
  if (
    !["http:", "https:"].includes(publicURL.protocol) ||
    publicURL.pathname !== "/" ||
    publicURL.search ||
    publicURL.hash ||
    publicURL.username ||
    publicURL.password
  )
    throw new Error("AUTH_BASE_URL must be a plain HTTP(S) origin.");

  const defaultPublicPort = publicURL.protocol === "https:" ? "443" : "80";
  const publicPort = publicURL.port || defaultPublicPort;
  const port = requestedPort ?? (mode === "local" ? publicPort : "3000");
  if (Number(port) < 1 || Number(port) > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  if (mode === "local" && port !== publicPort)
    throw new Error(
      `Local PORT ${port} must match AUTH_BASE_URL port ${publicPort}; change both together.`,
    );
  return {
    port,
    healthOrigin: `http://127.0.0.1:${port}`,
    publicOrigin: publicURL.origin,
  };
}

export function assertLocalConfiguration(values) {
  for (const key of ["DATABASE_URL", "AUTH_SECRET", "AUTH_BASE_URL"]) {
    if (!values[key]) throw new Error(`.env.local is missing ${key}.`);
  }
  const database = new URL(values.DATABASE_URL);
  const auth = new URL(values.AUTH_BASE_URL);
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const databasePort = database.port || "5432";
  if (
    !["postgresql:", "postgres:"].includes(database.protocol) ||
    !loopback.has(database.hostname) ||
    !/^\d+$/.test(databasePort) ||
    Number(databasePort) < 1 ||
    Number(databasePort) > 65535
  )
    throw new Error(
      "Local install refuses to migrate a non-local database. Use server mode and the deployment runbook for hosted databases.",
    );
  if (!loopback.has(auth.hostname))
    throw new Error("Local install requires a loopback AUTH_BASE_URL.");
}

export function assertHostedConfiguration(values) {
  for (const key of ["DATABASE_URL", "AUTH_SECRET", "AUTH_BASE_URL"]) {
    if (!values[key]) throw new Error(`Hosted mode is missing ${key}.`);
  }
  let database;
  try {
    database = new URL(values.DATABASE_URL);
    new URL(values.AUTH_BASE_URL);
  } catch {
    throw new Error("Hosted DATABASE_URL and AUTH_BASE_URL must be valid URLs.");
  }
  if (!["postgresql:", "postgres:"].includes(database.protocol))
    throw new Error("Hosted mode requires a PostgreSQL DATABASE_URL.");
  if (new Set(["localhost", "127.0.0.1", "[::1]"]).has(database.hostname))
    throw new Error(
      "The Aiven shortcut requires a hosted PostgreSQL DATABASE_URL; use the default Windows launcher for native PostgreSQL.",
    );
  if (!["require", "verify-ca", "verify-full"].includes(database.searchParams.get("sslmode")))
    throw new Error("The Aiven shortcut requires sslmode=require (or a stronger verified mode).");
}

function install(mode) {
  verifyTools();
  console.log("Installing the exact locked Node.js dependencies...");
  npmCommand(["ci", "--no-fund", "--no-audit"]);
  let env;
  if (mode === "local") {
    const envPath = resolve(root, ".env.local");
    if (existsSync(envPath)) assertLocalConfiguration(loadEnvFile(envPath));
    console.log("Preparing the private local PostgreSQL development database...");
    npmCommand(["run", "db:local"]);
    const localValues = loadEnvFile(envPath);
    assertLocalConfiguration(localValues);
    env = localSubprocessEnvironment(localValues);
    npmCommand(["run", "db:migrate"], { env });
    npmCommand(["run", "db:seed"], { env });
  } else if (mode === "server") {
    const values = { ...loadEnvFile(resolve(root, ".env.local")), ...process.env };
    if (!(values.DATABASE_URL && values.AUTH_SECRET && values.AUTH_BASE_URL))
      throw new Error(
        "Server mode needs operator-managed environment variables or .env.local. See docs/CROSS-PLATFORM-DEPLOYMENT.md.",
      );
    if (process.env.LONDOS_REQUIRE_HOSTED_DATABASE === "true") assertHostedConfiguration(values);
    env = values;
  } else env = { ...process.env, LONDOS_CORE_ENABLED: "false", LONDOS_DATA_SOURCE: "fixtures" };
  console.log("Building the production web application and worker...");
  npmCommand(["run", "build"], { env });
  console.log(`Londos ${mode} installation and build are complete. Click a START launcher.`);
}

function productionReady() {
  return (
    existsSync(resolve(root, ".next", "standalone", "server.js")) &&
    existsSync(resolve(root, "dist", "worker.mjs"))
  );
}

async function isLondosRunning(origin, mode) {
  try {
    const response = await fetch(`${origin}/api/ready`, { signal: AbortSignal.timeout(1_000) });
    if (!response.ok) return false;
    const body = await response.json();
    if (body?.ready !== true) return false;
    if (mode === "preview") return body.mode === "fixture-preview";
    return (
      ["development-core", "configured-core"].includes(body.mode) &&
      body.database === true &&
      body.authentication === true &&
      body.worker === "ready"
    );
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

async function waitAndOpen(healthOrigin, publicOrigin, path, mode, shouldStop = () => false) {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (shouldStop()) return;
    if (await isLondosRunning(healthOrigin, mode)) {
      openBrowser(new URL(path, publicOrigin).href);
      return;
    }
    await delay(500);
  }
  throw new Error(
    `Londos web, database, authentication and worker did not become ready at ${healthOrigin} within 45 seconds.`,
  );
}

async function start(mode, role) {
  verifyTools();
  if (!productionReady())
    throw new Error("Production build missing. Run the INSTALL launcher first.");
  if (mode !== "preview" && !existsSync(resolve(root, ".env.local")) && !process.env.DATABASE_URL)
    throw new Error(`${mode} mode needs operator-managed environment variables or .env.local.`);

  const fileValues = loadEnvFile(resolve(root, ".env.local"));
  const runtime =
    mode === "local" ? localSubprocessEnvironment(fileValues) : { ...fileValues, ...process.env };
  if (mode === "server" && process.env.LONDOS_REQUIRE_HOSTED_DATABASE === "true")
    assertHostedConfiguration(runtime);
  const { port, healthOrigin, publicOrigin } = launchTargets(mode, runtime);
  const path = rolePath(role);
  if (await isLondosRunning(healthOrigin, mode)) {
    console.log(`Londos is already ready at ${publicOrigin}; opening ${role}.`);
    openBrowser(new URL(path, publicOrigin).href);
    return;
  }
  if (mode === "local") {
    console.log("Ensuring the private local PostgreSQL database is running...");
    npmCommand(["run", "db:local"], { env: runtime });
  }

  const env =
    mode === "preview"
      ? { ...process.env, PORT: port, LONDOS_CORE_ENABLED: "false", LONDOS_DATA_SOURCE: "fixtures" }
      : { ...runtime, PORT: port };
  const children = [];
  let stopping = false;
  const launch = (args, label) => {
    const child = spawn(npmProgram, npmArguments(args), {
      cwd: root,
      env,
      stdio: "inherit",
      shell: false,
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
  writeLauncherState(mode, port, children);
  process.on("exit", () => clearLauncherState());
  console.log(`Londos is starting at ${publicOrigin}. This window keeps the server running.`);
  if (healthOrigin !== publicOrigin)
    console.log(`Local readiness is checked at ${healthOrigin}; AUTH_BASE_URL remains public.`);
  console.log("Press Ctrl+C to stop web and worker; the database volume is preserved.");
  void waitAndOpen(healthOrigin, publicOrigin, path, mode, () => stopping).catch((error) => {
    console.error(error.message);
    shutdown(1);
  });
  await new Promise((resolvePromise) => web.on("close", resolvePromise));
}

async function stop(mode) {
  verifyTools();
  const state = readLauncherState();
  if (state && processRunning(state.launcherPid)) {
    console.log(`Stopping the Londos ${state.mode} web and worker processes...`);
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(state.launcherPid), "/T", "/F"], {
        stdio: "ignore",
      });
    else process.kill(state.launcherPid, "SIGTERM");
    for (let attempt = 0; attempt < 50 && processRunning(state.launcherPid); attempt++)
      await delay(100);
    if (processRunning(state.launcherPid))
      throw new Error(
        "The recorded Londos launcher did not stop. Close its START window before stopping the database.",
      );
    clearLauncherState(state.launcherPid);
    console.log("Londos web and worker stopped.");
  } else {
    if (state) clearLauncherState(state.launcherPid);
    console.log("No running Londos launcher was recorded.");
  }
  if (mode === "local") npmCommand(["run", "db:stop"]);
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
