import { loadLocalEnv } from "./local-env";
import { database } from "../src/server/db/pool";
import { coreConfig } from "../src/server/config";
import { createAuth } from "../src/server/security/auth";
import { seed } from "../src/server/db/seed";
loadLocalEnv();
const pool = database();
try {
  await seed(pool, createAuth(pool, coreConfig(), true));
  console.log(
    "Fictional development data ready. Sign-in details are in ignored .local/development-accounts.json (mode 600). Seed preserves existing credentials and edits.",
  );
} finally {
  await pool.end();
}
