import { beforeAll, afterAll, test, expect } from "vitest";
import { Pool } from "pg";
import { MongoClient } from "mongodb";
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
import {
  mongoRoundTrip,
  MongoProbeError,
  probeCollection,
} from "../../src/server/services/mongo-probe";
import type { Db } from "mongodb";
import sharp from "sharp";
import { CloudinaryPublicCopy } from "../../src/server/services/cloudinary";
import { spawn } from "node:child_process";
const owned = new RehearsalDocker(),
  parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool, mongo: MongoClient, directory: string, baseline: unknown;
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
  await publishDesign(pool, actor, seedIds.shopA, { ...saved, confirm: true }, true);
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
}, 60000);
afterAll(async () => {
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
test("temporary MongoDB CRUD removes only its own record and preserves existing catalogue copies", async () => {
  const collection = mongo.db().collection<{ _id: string; marker: string }>(probeCollection);
  await collection.insertOne({ _id: "unrelated-fixture", marker: "preserve" });
  const baselineCopy = await mongo.db().collection("londos_public_copies").findOne({});
  expect(await mongoRoundTrip(mongo.db())).toEqual({
    write: true,
    read: true,
    update: true,
    delete: true,
    cleanup: true,
  });
  expect(await collection.countDocuments()).toBe(1);
  expect(await collection.findOne({ _id: "unrelated-fixture" })).toMatchObject({
    marker: "preserve",
  });
  expect(await mongo.db().collection("londos_public_copies").findOne({})).toEqual(baselineCopy);
});
test("failed temporary reads trigger exact-marker cleanup and sanitize driver exceptions", async () => {
  const collection = mongo.db().collection(probeCollection);
  let failOnce = true;
  const fake = {
    collection: () =>
      new Proxy(collection, {
        get(target, key) {
          if (key === "findOne" && failOnce) {
            failOnce = false;
            return async () => {
              throw new Error("PRIVATE-DRIVER-SENTINEL");
            };
          }
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
  } as unknown as Db;
  try {
    await mongoRoundTrip(fake);
    throw new Error("unexpected success");
  } catch (e) {
    expect(e).toBeInstanceOf(MongoProbeError);
    expect((e as MongoProbeError).results).toMatchObject({
      write: true,
      read: false,
      cleanup: true,
    });
    expect(String(e)).not.toContain("PRIVATE-DRIVER-SENTINEL");
  }
  expect(
    await collection.countDocuments({
      purpose: "temporary Londos connection verification; safe to remove",
    }),
  ).toBe(0);
});
test("public MongoDB products link to normalized Cloudinary images from their own shop only", async () => {
  const asset = randomUUID(),
    foreign = randomUUID(),
    owner = (await pool.query('SELECT id FROM "user" WHERE email=$1', ["owner-a@londos.example"]))
      .rows[0]?.id;
  // Seed identity is obtained from the existing merchant membership, not guessed.
  const ownerId =
    owner ??
    (
      await pool.query("SELECT user_id FROM memberships WHERE merchant_id=$1 AND role='owner'", [
        seedIds.merchantA,
      ])
    ).rows[0].user_id;
  const product = (
    await pool.query("SELECT id FROM products WHERE shop_id=$1 ORDER BY id LIMIT 1", [
      seedIds.shopA,
    ])
  ).rows[0].id;
  const bytes = await sharp({ create: { width: 20, height: 15, channels: 3, background: "white" } })
    .webp()
    .toBuffer();
  for (const [id, shop, merchant] of [
    [asset, seedIds.shopA, seedIds.merchantA],
    [foreign, seedIds.shopB, seedIds.merchantB],
  ]) {
    await pool.query(
      "INSERT INTO media_assets(id,shop_id,merchant_id,state,storage_key,created_by,alt,width,height) VALUES($1,$2,$3,'ready',$4,$5,'Merchant product image',20,15)",
      [id, shop, merchant, `fictional/${id}`, ownerId],
    );
    await pool.query(
      "INSERT INTO media_blobs(asset_id,variant,bytes,width,height) VALUES($1,'display',$2,20,15)",
      [id, bytes],
    );
  }
  await expect(
    pool.query(
      "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id) VALUES($1,$2,$3,$4)",
      [product, foreign, seedIds.shopA, seedIds.merchantA],
    ),
  ).rejects.toMatchObject({ code: "23503" });
  await pool.query(
    "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id) VALUES($1,$2,$3,$4)",
    [product, asset, seedIds.shopA, seedIds.merchantA],
  );
  const adapter = new CloudinaryPublicCopy(
    { cloudName: "fictional", apiKey: "fixture-key", apiSecret: "fixture-secret" },
    async (_, init) => {
      const publicId = String((init!.body as FormData).get("public_id"));
      return Response.json({
        public_id: publicId,
        secure_url: `https://res.cloudinary.com/fictional/image/upload/v1/${publicId}.webp`,
        width: 20,
        height: 15,
        format: "webp",
        bytes: bytes.length,
      });
    },
  );
  await copyPublicCatalogue(
    pool,
    mongo.db(),
    [seedIds.shopA],
    adapter,
    new AbortController().signal,
  );
  const copy = await readPublicCopy(pool, mongo.db(), seedIds.shopA);
  expect(copy.images).toHaveLength(1);
  expect(copy.images[0]).toMatchObject({ assetId: asset, width: 20, height: 15 });
  expect(copy.products.find((p) => p.id === product)).toMatchObject({
    imageAssetId: asset,
    imageAlt: "Merchant product image",
  });
  expect(copy.products.filter((p) => p.id !== product).every((p) => p.imageAssetId === null)).toBe(
    true,
  );
  expect(JSON.stringify(copy)).not.toContain(foreign);
  expect((await pool.query("SELECT * FROM shops ORDER BY id")).rows).toEqual(baseline);
});
test("unavailable MongoDB CLI configuration fails safely while Redis and Cloudinary are absent", async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/verify-mongodb.ts"], {
    env: {
      ...process.env,
      MONGODB_URL: "mongodb://fixture-user:PRIVATE-UNAVAILABLE-SENTINEL@127.0.0.1:1/londos_test",
      MONGODB_URI: "",
      MONGODB_DATABASE: "",
      REDIS_URL: "",
      CLOUDINARY_URL: "",
      LONDOS_REDIS_ENABLED: "false",
      LONDOS_CLOUDINARY_ENABLED: "false",
      MONGODB_LOG_ALL: "debug",
      MONGODB_LOG_COMMAND: "debug",
      MONGODB_LOG_CONNECTION: "debug",
      MONGODB_LOG_SERVER_SELECTION: "debug",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("exit", resolve);
    child.on("error", reject);
  });
  expect(code).toBe(1);
  expect(output).not.toContain("PRIVATE-UNAVAILABLE-SENTINEL");
  expect(output).not.toContain("mongodb://");
  expect(JSON.parse(output)).toMatchObject({
    connected: false,
    result: "failed",
    redisRequired: false,
    migrationPerformed: false,
  });
}, 15000);
