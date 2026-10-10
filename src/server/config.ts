export function coreConfigured(): boolean {
  return (
    process.env.LONDOS_CORE_ENABLED !== "false" &&
    Boolean(process.env.DATABASE_URL && process.env.AUTH_SECRET && process.env.AUTH_BASE_URL)
  );
}

export type DeployMode = "render" | "selfhosted";

export function deploymentMode(): DeployMode {
  const mode = process.env.DEPLOY_MODE ?? "render";
  if (mode !== "render" && mode !== "selfhosted")
    throw new Error("DEPLOY_MODE must be render or selfhosted.");
  return mode;
}

function configurationURL(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    // Native URL errors retain their input, which can include database credentials.
    throw new Error(`${name} must be a valid URL.`);
  }
}

export function coreConfig() {
  const deployMode = deploymentMode();
  if (
    (process.env.LONDOS_DATABASE_ENGINE ?? "postgresql") !== "postgresql" ||
    process.env.LONDOS_MONGODB_MIGRATION_ENABLED === "true"
  )
    throw new Error(
      "Canonical database migration is not supported or authorized; keep PostgreSQL active.",
    );
  const databaseUrl = process.env.DATABASE_URL;
  const secret = process.env.AUTH_SECRET;
  const baseURL = process.env.AUTH_BASE_URL;
  if (!databaseUrl || !secret || secret.length < 32 || !baseURL) {
    throw new Error(
      "Core configuration requires DATABASE_URL, AUTH_SECRET (32+ characters) and AUTH_BASE_URL.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(configurationURL(databaseUrl, "DATABASE_URL").protocol)
  )
    throw new Error("DATABASE_URL must select the PostgreSQL canonical database.");
  const url = configurationURL(baseURL, "AUTH_BASE_URL");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    throw new Error("AUTH_BASE_URL must be a plain HTTP(S) origin.");
  }
  if (!local && url.protocol !== "https:") throw new Error("Remote authentication requires HTTPS.");
  if (process.env.LONDOS_LOCAL_ADAPTERS === "true" && !local)
    throw new Error("Local adapters require a loopback authentication origin.");
  const configuredPwaOrigins = process.env.LONDOS_PWA_ORIGINS;
  const pwaOrigins = configuredPwaOrigins
    ? configuredPwaOrigins.split(",").map((origin) => origin.trim())
    : [];
  if (
    pwaOrigins.length > 3 ||
    pwaOrigins.some((origin) => !origin) ||
    new Set(pwaOrigins).size !== pwaOrigins.length
  )
    throw new Error("LONDOS_PWA_ORIGINS must contain up to three unique origins.");
  const validatedPwaOrigins = pwaOrigins.map((origin) => {
    const parsed = configurationURL(origin, "LONDOS_PWA_ORIGINS");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password ||
      !["http:", "https:"].includes(parsed.protocol) ||
      (!loopback && parsed.protocol !== "https:")
    )
      throw new Error("LONDOS_PWA_ORIGINS must contain plain HTTPS origins.");
    return parsed.origin;
  });
  return {
    deployMode,
    databaseUrl,
    databasePoolMax: 3,
    secret,
    baseURL: url.origin,
    allowedOrigins: [...new Set([url.origin, ...validatedPwaOrigins])],
    secureCookies: url.protocol === "https:",
    localAdapters: process.env.LONDOS_LOCAL_ADAPTERS === "true" && local,
  };
}
