import { loadLocalEnv } from "./local-env";
import { database } from "../src/server/db/pool";
import { migrate } from "../src/server/db/migrate";
loadLocalEnv();
const pool = database();
try {
  await migrate(pool);
  console.log("All checked-in migrations applied; checksums verified.");
} finally {
  await pool.end();
}
