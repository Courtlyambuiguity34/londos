import { test, expect, vi, afterEach } from "vitest";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { optionalServiceConfig } from "../../src/server/services/config";
import { CloudinaryPublicCopy } from "../../src/server/services/cloudinary";
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
test("MongoDB requires Cloudinary and explicit connections; enabled does not mean connected", () => {
  disabled();
  vi.stubEnv("LONDOS_MONGODB_ENABLED", "true");
  expect(() => optionalServiceConfig()).toThrow("requires_cloudinary");
  vi.stubEnv("LONDOS_CLOUDINARY_ENABLED", "true");
  vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:27017/londos_test");
  vi.stubEnv("CLOUDINARY_URL", "cloudinary://key:PRIVATE-CLOUDINARY-SENTINEL@fictional");
  const c = optionalServiceConfig();
  expect(c.mongodb).not.toBeNull();
  expect(c.migrationEnabled).toBe(false);
  expect(c.cloudinary!.cloudName).toBe("fictional");
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
