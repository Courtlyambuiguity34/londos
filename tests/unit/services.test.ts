import { test, expect, vi, afterEach } from "vitest";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import {
  optionalServiceConfig,
  mongoSettings,
  mongoClient,
  cloudinarySettings,
} from "../../src/server/services/config";
import { CloudinaryPublicCopy } from "../../src/server/services/cloudinary";
import { serviceConfigurationStatus } from "../../src/server/services/status";
import { verifyBrevo } from "../../src/server/services/brevo-probe";
afterEach(() => vi.unstubAllEnvs());
function disabled() {
  for (const name of [
    "LONDOS_MONGODB_ENABLED",
    "LONDOS_MONGODB_MIGRATION_ENABLED",
    "LONDOS_REDIS_ENABLED",
    "LONDOS_CLOUDINARY_ENABLED",
  ])
    vi.stubEnv(name, "false");
  vi.stubEnv("LONDOS_DATABASE_ENGINE", "postgresql");
  vi.stubEnv("MONGODB_URL", undefined);
  vi.stubEnv("MONGODB_URI", undefined);
  vi.stubEnv("MONGODB_DATABASE", undefined);
  vi.stubEnv("REDIS_URL", undefined);
}
test("disabled optional services need no credentials and keep PostgreSQL canonical", () => {
  disabled();
  expect(optionalServiceConfig()).toEqual({
    canonicalDatabase: "postgresql",
    migrationEnabled: false,
    mongodb: null,
    redis: null,
    cloudinary: null,
  });
});
test.each(["mongodb", "sqlite"])("an unsupported %s canonical switch fails closed", (engine) => {
  disabled();
  vi.stubEnv("LONDOS_DATABASE_ENGINE", engine);
  expect(() => optionalServiceConfig()).toThrow("canonical_database_engine_not_supported");
});
test("the canonical migration flag cannot silently start a migration", () => {
  disabled();
  vi.stubEnv("LONDOS_MONGODB_MIGRATION_ENABLED", "true");
  expect(() => optionalServiceConfig()).toThrow("migration_not_implemented_or_authorized");
});
test("MongoDB verification needs no Cloudinary or Redis; enabled does not mean connected", () => {
  disabled();
  vi.stubEnv("LONDOS_MONGODB_ENABLED", "true");
  expect(() => optionalServiceConfig()).toThrow("mongodb_credentials_missing");
  vi.stubEnv("LONDOS_CLOUDINARY_ENABLED", "true");
  vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:27017/londos_test");
  vi.stubEnv("CLOUDINARY_URL", "cloudinary://key:PRIVATE-CLOUDINARY-SENTINEL@fictional");
  const c = optionalServiceConfig();
  expect(c.mongodb).not.toBeNull();
  expect(c.migrationEnabled).toBe(false);
  expect(c.cloudinary!.cloudName).toBe("fictional");
});
test("MONGODB_URL selects the explicit database with verified remote TLS and legacy URI stays supported", async () => {
  disabled();
  vi.stubEnv(
    "MONGODB_URL",
    "mongodb+srv://fixture-user:PRIVATE-MONGO-SENTINEL@fictional.mongodb.net/londos_public_copy",
  );
  const settings = mongoSettings(),
    client = mongoClient(settings);
  expect(settings).toMatchObject({
    source: "MONGODB_URL",
    database: "londos_public_copy",
    local: false,
    atlas: true,
  });
  expect(client.options.tls).toBe(true);
  expect(client.options.rejectUnauthorized).toBe(true);
  expect(client.options.checkServerIdentity).toBeUndefined();
  await client.close();
  vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:27017/another");
  expect(() => mongoSettings()).toThrow("mongodb_alias_conflict");
  vi.stubEnv("MONGODB_URL", undefined);
  expect(mongoSettings()).toMatchObject({
    source: "MONGODB_URI",
    database: "another",
    local: true,
  });
});
test("Atlas URIs without a database require an explicit non-system MONGODB_DATABASE", () => {
  disabled();
  vi.stubEnv("MONGODB_URL", "mongodb+srv://user:PRIVATE-MONGO-SENTINEL@fictional.mongodb.net/");
  expect(() => mongoSettings()).toThrow("mongodb_configuration_invalid");
  vi.stubEnv("MONGODB_DATABASE", "londos_public_copy");
  expect(mongoSettings().database).toBe("londos_public_copy");
  vi.stubEnv("MONGODB_DATABASE", "admin");
  expect(() => mongoSettings()).toThrow("mongodb_configuration_invalid");
});
test.each([
  "PRIVATE-MONGO-SENTINEL not a URI",
  "https://user:PRIVATE-MONGO-SENTINEL@fictional.example/londos",
  "mongodb+srv://user:PRIVATE-MONGO-SENTINEL@fictional.mongodb.net/londos?tls=false",
  "mongodb://user:PRIVATE-MONGO-SENTINEL@fictional.example/londos?ssl=false",
  "mongodb+srv://user:PRIVATE-MONGO-SENTINEL@fictional.mongodb.net/londos?tlsInsecure=true",
  "mongodb+srv://user:PRIVATE-MONGO-SENTINEL@fictional.mongodb.net/londos?tlsAllowInvalidCertificates=true",
  "mongodb+srv://user:PRIVATE-MONGO-SENTINEL@fictional.mongodb.net/londos?tlsAllowInvalidHostnames=true",
  "mongodb+srv://user:PRIVATE-MONGO-SENTINEL@fictional.mongodb.net/londos?unknownOption=true",
])("invalid MongoDB configuration case %# fails with a sanitized error", (uri) => {
  disabled();
  vi.stubEnv("MONGODB_URL", uri);
  try {
    mongoSettings();
    throw new Error("unexpected success");
  } catch (e) {
    expect((e as Error).message).toBe("mongodb_configuration_invalid");
    expect(String((e as Error).stack)).not.toContain("PRIVATE-MONGO-SENTINEL");
    expect((e as Error).cause).toBeUndefined();
  }
});
test.each([
  "cloudinary://key:PRIVATE-CLOUDINARY-SENTINEL@",
  "cloudinary://key:%invalid@fictional",
  "PRIVATE-CLOUDINARY-SENTINEL",
])("Cloudinary parser case %# is sanitized", (value) => {
  vi.stubEnv("CLOUDINARY_URL", value);
  expect(() => cloudinarySettings()).toThrow(/^cloudinary_configuration_invalid$/);
});
test("operator diagnostics return only fixed messages for missing secrets and never contact providers", () => {
  disabled();
  vi.stubEnv("LONDOS_MONGODB_ENABLED", "true");
  vi.stubEnv("MONGODB_URL", "PRIVATE-MONGO-SENTINEL");
  vi.stubEnv("LONDOS_CLOUDINARY_ENABLED", "true");
  vi.stubEnv("CLOUDINARY_URL", "PRIVATE-CLOUDINARY-SENTINEL");
  vi.stubEnv("LONDOS_LOCAL_ADAPTERS", "false");
  vi.stubEnv("LONDOS_EMAIL_PROVIDER", "brevo");
  vi.stubEnv("LONDOS_BREVO_API_KEY", undefined);
  const statuses = serviceConfigurationStatus();
  expect(statuses.find((s) => s.name === "MongoDB")!.status).toBe("warning");
  expect(statuses.find((s) => s.name === "Cloudinary")!.status).toBe("warning");
  expect(statuses.find((s) => s.name === "Brevo")!.status).toBe("warning");
  expect(statuses.find((s) => s.name === "Redis")!.status).toBe("disabled");
  expect(JSON.stringify(statuses)).not.toContain("SENTINEL");
});
const brevo = {
  apiKey: "PRIVATE-BREVO-SENTINEL",
  senderEmail: "sender@fictional.org",
  senderName: "Londos",
  baseURL: "https://londos.example.org",
};
test("read-only Brevo contract checks fixed endpoints and verified sender using a mock without sending email", async () => {
  const routes: string[] = [];
  const result = await verifyBrevo(brevo, async (url, init) => {
    routes.push(String(url));
    expect(init!.redirect).toBe("error");
    expect(new Headers(init!.headers).get("api-key")).toBe(brevo.apiKey);
    return Response.json(
      String(url).endsWith("account")
        ? { email: "account@fictional.org" }
        : { senders: [{ email: brevo.senderEmail.toUpperCase(), active: true }] },
    );
  });
  expect(routes).toEqual(["https://api.brevo.com/v3/account", "https://api.brevo.com/v3/senders"]);
  expect(result).toEqual({ keyAccepted: true, senderVerified: true, deliveryTested: false });
});
test.each(["unauthorized", "network", "malformed", "oversized"])(
  "Brevo %s mock fails without leaking provider bodies or keys",
  async (mode) => {
    await expect(
      verifyBrevo(brevo, async () => {
        if (mode === "network") throw new Error(brevo.apiKey);
        if (mode === "unauthorized") return new Response(brevo.apiKey, { status: 401 });
        if (mode === "malformed") return Response.json({ error: brevo.apiKey });
        return new Response("x".repeat(262145));
      }),
    ).rejects.toThrow(/^brevo_configuration_or_access_unavailable$/);
  },
);
test("inactive Brevo sender is reported separately from accepted key", async () => {
  expect(
    await verifyBrevo(brevo, async (url) =>
      Response.json(
        String(url).endsWith("account")
          ? { email: "account@fictional.org" }
          : { senders: [{ email: brevo.senderEmail, active: false }] },
      ),
    ),
  ).toEqual({ keyAccepted: true, senderVerified: false, deliveryTested: false });
});
test.each(["TRUE", "yes", "1"])("ambiguous %s feature values do not enable services", (value) => {
  disabled();
  vi.stubEnv("LONDOS_REDIS_ENABLED", value);
  expect(() => optionalServiceConfig()).toThrow("invalid_service_flag");
});
test("wrong-scheme connection and invalid cloud name cannot select arbitrary upload endpoints", () => {
  disabled();
  vi.stubEnv("LONDOS_REDIS_ENABLED", "true");
  vi.stubEnv("REDIS_URL", "https://attacker.example");
  expect(() => optionalServiceConfig()).toThrow("service_connection_invalid");
  vi.stubEnv("LONDOS_REDIS_ENABLED", "false");
  vi.stubEnv("LONDOS_CLOUDINARY_ENABLED", "true");
  vi.stubEnv("CLOUDINARY_URL", "cloudinary://key:secret@attacker.example/other");
  expect(() => optionalServiceConfig()).toThrow("cloudinary_configuration_invalid");
});
test("Cloudinary uploads only normalized bounded public images to a fixed endpoint and returns checked delivery metadata", async () => {
  const bytes = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#617c53" },
    })
      .webp()
      .toBuffer(),
    asset = randomUUID();
  let calls = 0;
  const adapter = new CloudinaryPublicCopy(
    { cloudName: "fictional", apiKey: "KEY-SENTINEL", apiSecret: "PRIVATE-CLOUDINARY-SENTINEL" },
    async (url, init) => {
      calls++;
      expect(url).toBe("https://api.cloudinary.com/v1_1/fictional/image/upload");
      expect(init!.redirect).toBe("error");
      const f = init!.body as FormData;
      expect(f.get("overwrite")).toBe("false");
      expect(f.get("signature")).toMatch(/^[a-f0-9]{64}$/);
      expect(f.get("file")).toBeInstanceOf(Blob);
      const publicId = String(f.get("public_id"));
      return Response.json({
        public_id: publicId,
        secure_url: `https://res.cloudinary.com/fictional/image/upload/v1/${publicId}.webp`,
        width: 40,
        height: 30,
        format: "webp",
        bytes: bytes.length,
      });
    },
  );
  const result = await adapter.upload(asset, bytes, new AbortController().signal);
  expect(result.assetId).toBe(asset);
  expect(result.url).not.toContain("PRIVATE");
  expect(calls).toBe(1);
  await expect(
    adapter.upload(asset, Buffer.alloc(2097153), new AbortController().signal),
  ).rejects.toThrow("image_budget");
  expect(calls).toBe(1);
});
test("Cloudinary refuses arbitrary images and forged delivery URLs without treating them as usable copies", async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#617c53" } })
      .png()
      .toBuffer(),
    webp = await sharp(png).webp().toBuffer();
  const adapter = new CloudinaryPublicCopy(
    { cloudName: "fictional", apiKey: "key", apiSecret: "secret" },
    async (_, init) =>
      Response.json({
        public_id: String((init!.body as FormData).get("public_id")),
        secure_url: "https://attacker.example/image.webp",
        width: 2,
        height: 2,
        format: "webp",
        bytes: webp.length,
      }),
  );
  await expect(adapter.upload(randomUUID(), png, new AbortController().signal)).rejects.toThrow(
    "normalized_public_image_required",
  );
  await expect(adapter.upload(randomUUID(), webp, new AbortController().signal)).rejects.toThrow(
    "cloudinary_delivery_url_invalid",
  );
});
test("Cloudinary rejects a delivery URL for a different asset in the correct cloud", async () => {
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } })
    .webp()
    .toBuffer();
  const adapter = new CloudinaryPublicCopy(
    { cloudName: "fictional", apiKey: "key", apiSecret: "secret" },
    async (_, init) =>
      Response.json({
        public_id: String((init!.body as FormData).get("public_id")),
        secure_url: "https://res.cloudinary.com/fictional/image/upload/v1/other.webp",
        width: 2,
        height: 2,
        format: "webp",
        bytes: bytes.length,
      }),
  );
  await expect(adapter.upload(randomUUID(), bytes, new AbortController().signal)).rejects.toThrow(
    "cloudinary_delivery_url_invalid",
  );
});
