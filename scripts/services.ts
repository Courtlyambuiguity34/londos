import { MongoClient } from "mongodb";
import { createClient } from "redis";
import { Pool } from "pg";
import { loadLocalEnv } from "./local-env";
import { optionalServiceConfig, mongoClient } from "../src/server/services/config";
import { CloudinaryPublicCopy } from "../src/server/services/cloudinary";
import { copyPublicCatalogue, readPublicCopy } from "../src/server/services/mongo-mirror";
loadLocalEnv();
const [command, argument, confirm] = process.argv.slice(2);
let mongo: MongoClient | undefined,
  redis: ReturnType<typeof createClient> | undefined,
  pool: Pool | undefined;
try {
  const config = optionalServiceConfig();
  if (config.mongodb) {
    mongo = mongoClient(config.mongodb);
    await mongo.connect();
  }
  if (command === "check") {
    let mongoReady = false,
      redisReady = false;
    if (mongo) {
      await mongo.db(config.mongodb!.database).command({ ping: 1 });
      mongoReady = true;
    }
    if (config.redis) {
      redis = createClient({
        url: config.redis.url,
        socket: { connectTimeout: 5000, reconnectStrategy: false },
      });
      redis.on("error", () => {});
      await redis.connect();
      redisReady = (await redis.ping()) === "PONG";
    }
    let cloudinaryReady = false;
    if (config.cloudinary) {
      const c = config.cloudinary;
      const r = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/usage`, {
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString("base64")}`,
        },
      });
      cloudinaryReady = r.ok;
      await r.body?.cancel();
      if (!cloudinaryReady) throw new Error("cloudinary_unavailable");
    }
    console.log(
      JSON.stringify({
        event: "services.checked",
        canonicalDatabase: config.canonicalDatabase,
        mongodb: {
          enabled: !!config.mongodb,
          ready: mongoReady,
          purpose: "manual public catalogue copy",
        },
        redis: {
          enabled: !!config.redis,
          ready: redisReady,
          purpose: "optional connection; application caching remains PostgreSQL/Next.js",
        },
        cloudinary: {
          enabled: !!config.cloudinary,
          ready: cloudinaryReady,
          purpose: "normalized public image copies",
        },
        migrationPerformed: false,
      }),
    );
  } else if (
    command === "copy" &&
    argument &&
    confirm === "--confirm-public-copy" &&
    mongo &&
    config.cloudinary
  ) {
    if (!process.env.DATABASE_URL) throw new Error("database_configuration_missing");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 3000,
      statement_timeout: 2000,
    });
    const result = await copyPublicCatalogue(
      pool,
      mongo.db(config.mongodb!.database),
      argument.split(","),
      new CloudinaryPublicCopy(config.cloudinary),
      AbortSignal.timeout(120000),
    );
    console.log(JSON.stringify({ event: "services.public_copy_completed", ...result }));
  } else if (command === "read" && argument && !confirm && mongo) {
    if (!process.env.DATABASE_URL) throw new Error("database_configuration_missing");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 3000,
      statement_timeout: 2000,
    });
    const copy = await readPublicCopy(pool, mongo.db(config.mongodb!.database), argument);
    console.log(
      JSON.stringify({
        event: "services.public_copy_read",
        shopId: copy._id,
        generation: copy.generation,
        copiedAt: copy.copiedAt,
        products: copy.products.length,
        images: copy.images.length,
        migrationPerformed: false,
      }),
    );
  } else throw new Error("services_usage_or_disabled");
} catch {
  console.error(
    '{"event":"services.failed","code":"configuration_or_capability_unavailable","migrationPerformed":false}',
  );
  process.exitCode = 1;
} finally {
  await redis?.destroy();
  await mongo?.close().catch(() => {
    process.exitCode = 1;
  });
  await pool?.end().catch(() => {
    process.exitCode = 1;
  });
}
