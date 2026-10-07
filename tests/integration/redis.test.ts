// Kept separate so MongoDB verification never provisions or requires Redis.
import { beforeAll, afterAll, test, expect } from "vitest";
import { Pool } from "pg";
import { createClient } from "redis";
import { RehearsalDocker, docker } from "../../scripts/release/docker";
const owned = new RehearsalDocker(),
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
let redis: ReturnType<typeof createClient>, baseline: unknown;
beforeAll(async () => {
  baseline = (await pool.query("SELECT datname FROM pg_database ORDER BY datname")).rows;
  const r = await owned.run("redis", [
    "--user",
    "999:999",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--memory",
    "128m",
    "--cpus",
    "0.5",
    "--tmpfs",
    "/tmp:size=32m",
    "--publish",
    "127.0.0.1::6379",
    "redis@sha256:08ad0b1d280850169a790dba1393ff7a90aef951fc19632cf4d3ce4f78e679ba",
    "redis-server",
    "--save",
    "",
    "--appendonly",
    "no",
    "--dir",
    "/tmp",
    "--maxmemory",
    "32mb",
  ]);
  const rp = Number((await docker(["port", r, "6379/tcp"])).split(":").at(-1));
  redis = createClient({
    url: `redis://127.0.0.1:${rp}`,
    socket: { connectTimeout: 5000, reconnectStrategy: false },
  });
  redis.on("error", () => {});
  await redis.connect();
}, 30000);
afterAll(async () => {
  redis?.destroy();
  await owned.cleanup();
  await pool.end();
});
test("real Redis responds without being substituted for durable jobs or the canonical database", async () => {
  expect(await redis.ping()).toBe("PONG");
  await redis.set("londos:fixture", "public-test", { EX: 10 });
  expect(await redis.get("londos:fixture")).toBe("public-test");
  expect((await pool.query("SELECT datname FROM pg_database ORDER BY datname")).rows).toEqual(
    baseline,
  );
});
