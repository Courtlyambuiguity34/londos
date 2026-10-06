import { randomUUID, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { loadLocalEnv } from "./local-env";
import { requireDevelopmentDatabase } from "../src/server/db/development";
loadLocalEnv();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Start the explicit local PostgreSQL database first.");
const parent = new Pool({ connectionString }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
try {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(connectionString);
  url.pathname = `/${name}`;
  const child = spawn(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.integration.config.ts",
      ...process.argv.slice(2),
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        AUTH_SECRET: randomBytes(48).toString("hex"),
        AUTH_BASE_URL: "http://127.0.0.1:3101",
        LONDOS_LOCAL_ADAPTERS: "true",
        LONDOS_CORE_ENABLED: "true",
        LONDOS_AI_REMOTE: "false",
      },
    },
  );
  const exit = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = exit;
} finally {
  await parent.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await parent.end();
}
