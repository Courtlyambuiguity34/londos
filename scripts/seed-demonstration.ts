import { loadLocalEnv } from "./local-env";
import { database } from "../src/server/db/pool";
import { coreConfig } from "../src/server/config";
import { createAuth } from "../src/server/security/auth";
import { seedDemonstration } from "../src/server/db/demo-seed";
loadLocalEnv();
const pool = database();
try {
  const result = await seedDemonstration(pool, createAuth(pool, coreConfig(), true));
  console.log(JSON.stringify({ event: "demonstration.seeded", ...result }));
} catch {
  console.error('{"event":"demonstration.failed","code":"investigate_without_overwriting"}');
  process.exitCode = 1;
} finally {
  await pool.end();
}
