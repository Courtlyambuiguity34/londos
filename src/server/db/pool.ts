import { Pool, type PoolClient } from "pg";
import { coreConfig } from "../config";

const globalDb = globalThis as unknown as { londosPool?: Pool };
export function database(): Pool {
  if (globalDb.londosPool) return globalDb.londosPool;
  const pool = new Pool({
    connectionString: coreConfig().databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    application_name: "londos",
  });
  // Idle-connection errors must not crash public fixture browsing or expose a
  // driver's error details. Active queries still reject to their caller.
  pool.on("error", () => console.error(JSON.stringify({ event: "database.idle_connection_lost" })));
  globalDb.londosPool = pool;
  return pool;
}
export async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
