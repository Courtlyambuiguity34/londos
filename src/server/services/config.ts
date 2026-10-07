import { z } from "zod";
const flag = (name: string) => {
  const value = process.env[name] ?? "false";
  if (!["true", "false"].includes(value)) throw new Error("invalid_service_flag");
  return value === "true";
};
function connection(name: string, schemes: string[]) {
  const value = process.env[name];
  if (!value || value.length > 8192) throw new Error("service_credentials_missing");
  const url = new URL(value);
  if (!schemes.includes(url.protocol) || url.hash) throw new Error("service_connection_invalid");
  return value;
}
export function optionalServiceConfig() {
  if ((process.env.LONDOS_DATABASE_ENGINE ?? "postgresql") !== "postgresql")
    throw new Error("canonical_database_engine_not_supported");
  if (flag("LONDOS_MONGODB_MIGRATION_ENABLED"))
    throw new Error("canonical_database_migration_not_implemented_or_authorized");
  const mongodb = flag("LONDOS_MONGODB_ENABLED"),
    redis = flag("LONDOS_REDIS_ENABLED"),
    cloudinary = flag("LONDOS_CLOUDINARY_ENABLED");
  if (mongodb && !cloudinary) throw new Error("mongodb_public_mirror_requires_cloudinary");
  return {
    canonicalDatabase: "postgresql" as const,
    migrationEnabled: false as const,
    mongodb: mongodb ? { uri: connection("MONGODB_URI", ["mongodb:", "mongodb+srv:"]) } : null,
    redis: redis ? { url: connection("REDIS_URL", ["redis:", "rediss:"]) } : null,
    cloudinary: cloudinary ? cloudinarySettings() : null,
  };
}
export function cloudinarySettings() {
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
}
