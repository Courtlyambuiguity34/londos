import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

try {
  for (const name of [
    "DATABASE_URL",
    "AUTH_SECRET",
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
  };
  if (!(mode in commands)) throw new Error("Invalid release mode");
  if (process.env.LONDOS_RUNTIME_CA_FILE) {
    if (!existsSync(process.env.LONDOS_RUNTIME_CA_FILE)) throw new Error("Missing runtime CA");
    process.env.NODE_EXTRA_CA_CERTS = process.env.LONDOS_RUNTIME_CA_FILE;
  }
  const child = spawn(process.execPath, commands[mode], { stdio: "inherit", env: process.env });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => {
    console.error('{"event":"release.start_failed"}');
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
} catch {
  console.error('{"event":"release.configuration_invalid"}');
  process.exitCode = 1;
}
