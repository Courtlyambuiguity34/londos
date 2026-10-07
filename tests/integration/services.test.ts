import { beforeAll, afterAll, test, expect } from "vitest";
import { Pool } from "pg";
import { MongoClient } from "mongodb";
import { createClient } from "redis";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RehearsalDocker, docker } from "../../scripts/release/docker";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { migrate } from "../../src/server/db/migrate";
import { seed, seedIds } from "../../src/server/db/seed";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { readDesign, saveDesign, publishDesign } from "../../src/server/shop-design";
import { copyPublicCatalogue, readPublicCopy } from "../../src/server/services/mongo-mirror";
const owned = new RehearsalDocker(),
  parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  mongo: MongoClient,
  redis: ReturnType<typeof createClient>,
  directory: string,
  baseline: unknown;
const noImages = {
  upload: async () => {
    throw new Error("Fixture has no managed public images");
  },
};
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  pool = new Pool({ connectionString: url.toString(), max: 4 });
  await migrate(pool);
  directory = await mkdtemp(join(tmpdir(), "londos-services-"));
  const auth = createAuth(pool, coreConfig(), true),
    accounts = await seed(pool, auth, directory),
    login = await auth.api.signInEmail({ body: accounts.ownerA });
  const session = (await pool.query("SELECT id FROM session WHERE token=$1", [login.token]))
      .rows[0],
    actor = { userId: accounts.ownerA.id, sessionId: session.id },
    design = await readDesign(pool, actor, seedIds.shopA),
    saved = await saveDesign(pool, actor, seedIds.shopA, {
      version: design.version,
      summary: "Fictional optional mirror layout",
      specification: design.specification,
    });
  await publishDesign(pool, actor, seedIds.shopA, { ...saved, confirm: true });
  baseline = (await pool.query("SELECT * FROM shops ORDER BY id")).rows;
  const m = await owned.run("mongo", [
    "--user",
    "999:999",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--memory",
    "768m",
    "--cpus",
    "0.5",
    "--tmpfs",
    "/data/db:uid=999,gid=999,size=256m",
    "--tmpfs",
    "/data/configdb:uid=999,gid=999,size=32m",
    "--tmpfs",
    "/tmp:size=32m",
    "--publish",
    "127.0.0.1::27017",
    "mongo@sha256:d6b569590880bca35e43318418133a426b024bcb649eeb63bb071bc1490bee41",
    "--bind_ip_all",
    "--wiredTigerCacheSizeGB",
    "0.25",
  ]);
  const mp = Number((await docker(["port", m, "27017/tcp"])).split(":").at(-1));
  mongo = new MongoClient(`mongodb://127.0.0.1:${mp}/londos_test`, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 2,
  });
  await mongo.connect();
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
}, 60000);
afterAll(async () => {
  redis?.destroy();
  await mongo?.close();
  await pool?.end();
  await owned.cleanup();
  await parent.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await parent.end();
  if (directory) await rm(directory, { recursive: true, force: true });
  process.env.DATABASE_URL = parentURL;
});
test("real MongoDB accepts a bounded explicit public copy while all PostgreSQL canonical shops stay unchanged", async () => {
  const result = await copyPublicCatalogue(
    pool,
    mongo.db(),
    [seedIds.shopA],
    noImages,
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    copiedShops: 1,
    products: 4,
    images: 0,
    migrationPerformed: false,
    automaticFailover: false,
  });
  expect((await pool.query("SELECT * FROM shops ORDER BY id")).rows).toEqual(baseline);
  const copy = await readPublicCopy(pool, mongo.db(), seedIds.shopA);
  expect(copy.products).toHaveLength(4);
  expect(copy.authority).toContain("PostgreSQL remains canonical");
  expect(JSON.stringify(copy)).not.toContain("password");
  expect(JSON.stringify(copy)).not.toContain("merchant_id");
});
test("repeat manual copies replace one shop document rather than duplicating it or migrating account/rent data", async () => {
  await copyPublicCatalogue(
    pool,
    mongo.db(),
    [seedIds.shopA],
    noImages,
    new AbortController().signal,
  );
  expect(await mongo.db().collection("londos_public_copies").countDocuments()).toBe(1);
  expect((await mongo.db().listCollections().toArray()).map((c) => c.name)).toEqual([
    "londos_public_copies",
  ]);
});
test("hidden, foreign-unpublished and oversized copy requests are denied before export", async () => {
  await expect(
    copyPublicCatalogue(pool, mongo.db(), [seedIds.shopB], noImages, new AbortController().signal),
  ).rejects.toThrow("public_shop_unavailable");
  await expect(
    copyPublicCatalogue(
      pool,
      mongo.db(),
      Array.from({ length: 21 }, () => randomUUID()),
      noImages,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [
    seedIds.shopA,
  ]);
  await expect(readPublicCopy(pool, mongo.db(), seedIds.shopA)).rejects.toThrow(
    "public_shop_unavailable",
  );
  await pool.query("UPDATE shop_moderation SET state='clear' WHERE shop_id=$1", [seedIds.shopA]);
});
test("real Redis responds without being substituted for durable jobs or the canonical database", async () => {
  expect(await redis.ping()).toBe("PONG");
  await redis.set("londos:fixture", "public-test", { EX: 10 });
  expect(await redis.get("londos:fixture")).toBe("public-test");
  expect((await pool.query("SELECT * FROM shops ORDER BY id")).rows).toEqual(baseline);
});
