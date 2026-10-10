import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const selfhostedDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(selfhostedDirectory, "../..");

export function validateSelfhostedEnvironment(environment) {
  if (environment.DEPLOY_MODE !== "selfhosted")
    throw new Error("DEPLOY_MODE must be selfhosted for this production entry point.");
  for (const name of ["DATABASE_URL", "AUTH_SECRET", "AUTH_BASE_URL"])
    if (!environment[name]) throw new Error(`${name} is required.`);
  if (environment.AUTH_SECRET.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  let database;
  let authentication;
  try {
    database = new URL(environment.DATABASE_URL);
    authentication = new URL(environment.AUTH_BASE_URL);
  } catch {
    throw new Error("DATABASE_URL and AUTH_BASE_URL must be valid URLs.");
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol))
    throw new Error("DATABASE_URL must select PostgreSQL.");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname))
    throw new Error("Self-hosted DATABASE_URL must use loopback PostgreSQL.");
  const localAuthentication = ["localhost", "127.0.0.1", "[::1]"].includes(authentication.hostname);
  if (
    !["http:", "https:"].includes(authentication.protocol) ||
    (!localAuthentication && authentication.protocol !== "https:") ||
    authentication.pathname !== "/" ||
    authentication.search ||
    authentication.hash ||
    authentication.username ||
    authentication.password
  )
    throw new Error("AUTH_BASE_URL must be a plain HTTPS origin (or loopback HTTP for testing).");
}

async function main() {
  process.chdir(root);
  const environmentFile = process.env.LONDOS_ENV_FILE ?? resolve(root, ".env.local");
  if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
  validateSelfhostedEnvironment(process.env);

  const role = process.argv[2] ?? "web";
  if (role !== "web" && role !== "worker") throw new Error("Role must be web or worker.");
  if (
    !existsSync(resolve(root, ".next/standalone/server.js")) ||
    !existsSync(resolve(root, "dist/worker.mjs"))
  )
    throw new Error("Production build missing. Run npm ci and npm run build first.");

  const args =
    role === "web"
      ? [resolve(root, "scripts/start.mjs"), "--port", process.env.PORT ?? "3000"]
      : [resolve(root, "dist/worker.mjs")];
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production", DEPLOY_MODE: "selfhosted" },
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => {
    console.error(JSON.stringify({ event: "selfhosted.start_failed", role }));
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct)
  main().catch((error) => {
    console.error(`Londos self-hosted start: ${error instanceof Error ? error.message : "failed"}`);
    process.exitCode = 1;
  });
