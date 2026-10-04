import { writeFile } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { loadLocalEnv } from "./local-env";
import { database } from "../src/server/db/pool";
import { coreConfig } from "../src/server/config";
import { createAuth } from "../src/server/security/auth";
loadLocalEnv();
const pool = database();
try {
  const migrations = await getMigrations(createAuth(pool, coreConfig()).options);
  await writeFile(
    "migrations/001_identity.sql",
    `-- Generated from Better Auth 1.7.7 options; reviewed and checked in. No runtime auto-migrations.\n${await migrations.compileMigrations()}\n`,
  );
  console.log(
    "Identity migration generated; review before committing. Never regenerate against an applied production schema.",
  );
} finally {
  await pool.end();
}
