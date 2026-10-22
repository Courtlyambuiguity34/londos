import { readFileSync, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

try {
  for (const name of [
    "DATABASE_URL",
    "AUTH_SECRET",
    "LONDOS_BOOTSTRAP_ADMIN_PASSWORD",
    "LONDOS_BOOTSTRAP_SHOPKEEPER_PASSWORD",
    "LONDOS_BREVO_API_KEY",
    "LONDOS_OPENAI_API_KEY",
    ...Array.from({ length: 5 }, (_, i) => `GEMINI_API_KEY_${i + 1}`),
  ]) {
    const path = process.env[`${name}_FILE`];
    if (path) {
      if (process.env[name]) throw new Error("Ambiguous secret sources");
      const value = readFileSync(path, "utf8").trim();
      if (!value || value.length > 8192 || /[\r\n]/.test(value))
        throw new Error("Invalid secret file");
      process.env[name] = value;
    }
  }
  const mode = process.argv[2];
  const commands = {
    web: ["server.js"],
    worker: ["dist/worker.mjs"],
    migrate: ["dist/migrate.mjs"],
    monitor: ["dist/operations.mjs", "monitor"],
    "worker-health": ["dist/operations.mjs", "worker-health"],
    bootstrap: ["dist/bootstrap.mjs"],
  };
  if (!(mode in commands)) throw new Error("Invalid release mode");
  if (process.env.LONDOS_RUNTIME_CA_FILE) {
    if (!existsSync(process.env.LONDOS_RUNTIME_CA_FILE)) throw new Error("Missing runtime CA");
    process.env.NODE_EXTRA_CA_CERTS = process.env.LONDOS_RUNTIME_CA_FILE;
  }
  // Explicit fallback for owners without a deployment shell/job. The existing
  // migrator locks concurrent runs, verifies checksums and applies pending SQL.
  // Never run this in worker mode or make it the default for future releases.
  if (mode === "web") {
    const migrateOnStart = process.env.LONDOS_MIGRATE_ON_START;
    if (migrateOnStart !== undefined && !["true", "false"].includes(migrateOnStart))
      throw new Error("Invalid startup migration setting");
    if (migrateOnStart === "true") {
      const migrationEnv = { ...process.env };
      for (const key of Object.keys(migrationEnv))
        if (key.startsWith("LONDOS_BOOTSTRAP_")) delete migrationEnv[key];
      const result = spawnSync(process.execPath, ["dist/migrate.mjs"], {
        stdio: "inherit",
        env: migrationEnv,
      });
      if (result.status !== 0) process.exit(1);
    }
  }
  if (
    mode === "web" &&
    Object.keys(process.env).some(
      (key) =>
        /^LONDOS_BOOTSTRAP_(ADMIN|SHOPKEEPER)_(EMAIL|PASSWORD|NAME)$/.test(key) && process.env[key],
    )
  ) {
    const result = spawnSync(process.execPath, ["dist/bootstrap.mjs"], {
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) process.exit(1);
  }
  const childEnv = { ...process.env };
  delete childEnv.LONDOS_MIGRATE_ON_START;
  for (const key of Object.keys(childEnv))
    if (key.startsWith("LONDOS_BOOTSTRAP_")) delete childEnv[key];
  const embedded = process.env.LONDOS_EMBEDDED_WORKER ?? "false";
  if (mode === "web" && !["true", "false"].includes(embedded))
    throw new Error("Invalid embedded worker setting");
  delete childEnv.LONDOS_EMBEDDED_WORKER;
  if (mode !== "web" || embedded !== "true") {
    // Preserve the full command (including monitor/worker-health arguments) and
    // successful exit status of one-off migration and bootstrap commands.
    const child = spawn(process.execPath, commands[mode], {
      stdio: "inherit",
      env: mode === "bootstrap" ? process.env : childEnv,
    });
    for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
    child.on("error", () => {
      console.error('{"event":"release.start_failed"}');
      process.exitCode = 1;
    });
    child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
  } else {
    // The queue worker shares this container's availability. It is not an
    // always-on service when the hosting platform suspends the web container.
    const children = new Map();
    let stopping = false;
    let exitCode = 0;
    let shutdownTimer;
    function finish() {
      if (!stopping || [...children.values()].some((child) => !child.done)) return;
      clearTimeout(shutdownTimer);
      process.exit(exitCode);
    }
    function stop(code) {
      if (stopping) return;
      stopping = true;
      exitCode = code;
      for (const child of children.values()) if (!child.done) child.process.kill("SIGTERM");
      shutdownTimer = setTimeout(() => {
        for (const child of children.values()) if (!child.done) child.process.kill("SIGKILL");
      }, 9000);
      shutdownTimer.unref();
      finish();
    }
    function launch(label, args) {
      const proc = spawn(process.execPath, args, { stdio: "inherit", env: childEnv });
      const child = { process: proc, done: false };
      children.set(label, child);
      proc.on("error", () => {
        child.done = true;
        console.error(JSON.stringify({ event: "release.child_start_failed", process: label }));
        stop(1);
        finish();
      });
      proc.on("exit", (code, signal) => {
        child.done = true;
        console.log(
          JSON.stringify({ event: "release.child_exited", process: label, code, signal }),
        );
        if (!stopping) stop(code === 0 ? 1 : (code ?? 1));
        finish();
      });
    }
    for (const signal of ["SIGTERM", "SIGINT"])
      process.on(signal, () => stop(signal === "SIGINT" ? 130 : 143));
    launch("web", commands.web);
    launch("worker", commands.worker);
    console.log('{"event":"release.embedded_worker_started"}');
  }
} catch {
  console.error('{"event":"release.configuration_invalid"}');
  process.exitCode = 1;
}
