import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { loadLocalEnv } from "./local-env";
import { requireDevelopmentDatabase } from "../src/server/db/development";
import { migrate } from "../src/server/db/migrate";
import { seed } from "../src/server/db/seed";
import { createAuth } from "../src/server/security/auth";
import { coreConfig } from "../src/server/config";
loadLocalEnv();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Start local PostgreSQL first.");
const parent = new Pool({ connectionString }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`,
  directory = await mkdtemp(join(tmpdir(), "londos-browser-"));
let db: Pool | undefined;
try {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(connectionString);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  process.env.LONDOS_PRIVACY_ERASURE = "true";
  process.env.AUTH_BASE_URL = "http://127.0.0.1:3101";
  process.env.AUTH_SECRET = randomBytes(48).toString("hex");
  process.env.LONDOS_LOCAL_ADAPTERS = "true";
  process.env.LONDOS_CORE_ENABLED = "true";
  db = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(db);
  await seed(db, createAuth(db, coreConfig(), true), directory);
  const child = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.core.config.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        LONDOS_TEST_ACCOUNTS_FILE: join(directory, "development-accounts.json"),
      },
    },
  );
  process.exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await db?.end();
  await parent.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await parent.end();
  await rm(directory, { recursive: true, force: true });
}
