import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

// Standalone changes its working directory; load the root server configuration
// before spawning it. Explicit process variables retain precedence.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const deployMode = process.env.DEPLOY_MODE ?? "render";
if (!["render", "selfhosted"].includes(deployMode)) {
  console.error("DEPLOY_MODE must be render or selfhosted.");
  process.exit(1);
}
let port = process.env.PORT ?? "3000";
for (let i = 0; i < args.length; i++) {
  if (args[i] !== "--port" || !args[i + 1]) {
    console.error("Usage: npm run start -- --port 3000");
    process.exit(1);
  }
  port = args[++i];
}
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error("PORT must be between 1 and 65535.");
  process.exit(1);
}
if (!existsSync(".next/standalone/server.js")) {
  console.error("Run npm run build before starting the production preview.");
  process.exit(1);
}
if (
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
const runtimeEnv = { ...process.env };
for (const key of Object.keys(runtimeEnv))
  if (key.startsWith("LONDOS_BOOTSTRAP_")) delete runtimeEnv[key];
const child = spawn(process.execPath, [".next/standalone/server.js"], {
  stdio: "inherit",
  env: {
    ...runtimeEnv,
    PORT: port,
    HOSTNAME: deployMode === "selfhosted" ? "127.0.0.1" : "0.0.0.0",
    NODE_USE_ENV_PROXY:
      process.env.NODE_USE_ENV_PROXY ??
      (process.env.HTTPS_PROXY || process.env.HTTP_PROXY ? "1" : "0"),
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.exit(signal === "SIGINT" ? 130 : 143);
  process.exit(code ?? 1);
});
