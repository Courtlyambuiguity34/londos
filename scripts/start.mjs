import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

// Standalone changes its working directory; load the root server configuration
// before spawning it. Explicit process variables retain precedence.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
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
const child = spawn(process.execPath, [".next/standalone/server.js"], {
  stdio: "inherit",
  env: { ...process.env, PORT: port, HOSTNAME: "0.0.0.0" },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.exit(signal === "SIGINT" ? 130 : 143);
  process.exit(code ?? 1);
});
