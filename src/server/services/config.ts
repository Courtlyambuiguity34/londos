import { z } from "zod";
import { MongoClient } from "mongodb";
// Prevent opt-in driver debugging from bypassing sanitized application reports.
const quietMongo = {
  mongodbLogComponentSeverities: {
    default: "off",
    command: "off",
    topology: "off",
    serverSelection: "off",
    connection: "off",
    client: "off",
  } as const,
  mongodbLogPath: { write: () => {} },
};
const flag = (name: string) => {
  const value = process.env[name] ?? "false";
  if (!["true", "false"].includes(value)) throw new Error("invalid_service_flag");
  return value === "true";
};
function connection(name: string, schemes: string[]) {
  const value = process.env[name];
  if (!value || value.length > 8192) throw new Error("service_credentials_missing");
  try {
    const url = new URL(value);
    if (!schemes.includes(url.protocol) || url.hash) throw new Error();
  } catch {
    // URL/driver exceptions may contain the supplied credential. Never propagate them.
    throw new Error("service_connection_invalid");
  }
  return value;
}
export function mongoSettings() {
  const preferred = process.env.MONGODB_URL,
    legacy = process.env.MONGODB_URI;
  if (preferred && legacy && preferred !== legacy) throw new Error("mongodb_alias_conflict");
  const uri = preferred || legacy;
  if (!uri) throw new Error("mongodb_credentials_missing");
  try {
    if (uri.length > 8192 || uri.trim() !== uri || uri.includes("#")) throw new Error();
    const match = /^mongodb(?:\+srv)?:\/\/[^/]+(?:\/([^?]*))?(?:\?.*)?$/.exec(uri);
    if (!match) throw new Error();
    const fromURI = match[1] ? decodeURIComponent(match[1]) : undefined;
    const database = process.env.MONGODB_DATABASE || fromURI;
    if (
      !database ||
      !/^[A-Za-z0-9_-]{1,63}$/.test(database) ||
      ["admin", "local", "config"].includes(database)
    )
      throw new Error();
    if (fromURI && fromURI !== database) throw new Error();
    const parsed = new MongoClient(uri, quietMongo).options;
    const local =
      !parsed.srvHost &&
      parsed.hosts.length > 0 &&
      parsed.hosts.every((h) => ["localhost", "127.0.0.1", "::1"].includes(h.host ?? ""));
    if (parsed.tlsInsecure || parsed.rejectUnauthorized === false || parsed.checkServerIdentity)
      throw new Error();
    const params = new URLSearchParams(uri.split("?")[1] ?? "");
    for (const [key, value] of params) {
      if (["tls", "ssl"].includes(key.toLowerCase()) && value !== "true" && !local)
        throw new Error();
      if (
        ["tlsinsecure", "tlsallowinvalidcertificates", "tlsallowinvalidhostnames"].includes(
          key.toLowerCase(),
        ) &&
        value !== "false"
      )
        throw new Error();
    }
    return {
      uri,
      database,
      local,
      atlas: !!parsed.srvHost?.endsWith(".mongodb.net"),
      source: preferred ? ("MONGODB_URL" as const) : ("MONGODB_URI" as const),
    };
  } catch {
    throw new Error("mongodb_configuration_invalid");
  }
}
export function mongoClient(settings: ReturnType<typeof mongoSettings>) {
  try {
    return new MongoClient(settings.uri, {
      ...quietMongo,
      ...(!settings.local
        ? { tls: true, tlsAllowInvalidCertificates: false, tlsAllowInvalidHostnames: false }
        : {}),
      maxPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      timeoutMS: 10000,
    });
  } catch {
    throw new Error("mongodb_configuration_invalid");
  }
}
export function optionalServiceConfig() {
  if ((process.env.LONDOS_DATABASE_ENGINE ?? "postgresql") !== "postgresql")
    throw new Error("canonical_database_engine_not_supported");
  if (flag("LONDOS_MONGODB_MIGRATION_ENABLED"))
    throw new Error("canonical_database_migration_not_implemented_or_authorized");
  const mongodb = flag("LONDOS_MONGODB_ENABLED"),
    redis = flag("LONDOS_REDIS_ENABLED"),
    cloudinary = flag("LONDOS_CLOUDINARY_ENABLED");
  return {
    canonicalDatabase: "postgresql" as const,
    migrationEnabled: false as const,
    mongodb: mongodb ? mongoSettings() : null,
    redis: redis ? redisSettings() : null,
    cloudinary: cloudinary ? cloudinarySettings() : null,
  };
}
export function redisSettings() {
  return { url: connection("REDIS_URL", ["redis:", "rediss:"]) };
}
export function cloudinarySettings() {
  try {
    const url = new URL(connection("CLOUDINARY_URL", ["cloudinary:"]));
    if (
      !url.username ||
      !url.password ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(url.hostname) ||
      (url.pathname && url.pathname !== "/") ||
      url.search
    )
      throw new Error("cloudinary_configuration_invalid");
    return z
      .object({
        cloudName: z.string(),
        apiKey: z.string().min(1).max(256),
        apiSecret: z.string().min(1).max(256),
      })
      .parse({
        cloudName: url.hostname,
        apiKey: decodeURIComponent(url.username),
        apiSecret: decodeURIComponent(url.password),
      });
  } catch {
    throw new Error("cloudinary_configuration_invalid");
  }
}
