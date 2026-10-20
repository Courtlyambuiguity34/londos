import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { indexingOrigin, publicMetadata } from "../../src/server/search-indexing";
import { sitemapKind, sitemapPage, sitemapPages, sitemapXML } from "../../src/server/sitemaps";
import robots from "../../src/app/robots";
import { GET as sitemapIndex } from "../../src/app/sitemap.xml/route";
import { GET as sitemapShard } from "../../src/app/sitemaps/[kind]/[page]/route";
import { database } from "../../src/server/db/pool";

vi.mock("../../src/server/db/pool", () => ({
  database: vi.fn(() => ({
    connect: async () => {
      throw Error("fictional-driver-failure-with-private-connection-details");
    },
  })),
}));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://fictional:fixture@localhost/londos_development");
  vi.stubEnv("AUTH_SECRET", "fictional-test-secret-with-at-least-32-characters");
  vi.stubEnv("AUTH_BASE_URL", "https://mall.example");
  vi.stubEnv("DEPLOY_MODE", "render");
  vi.stubEnv("LONDOS_CORE_ENABLED", "true");
  vi.stubEnv("LONDOS_DATA_SOURCE", "database");
  vi.stubEnv("LONDOS_DATABASE_ENGINE", "postgresql");
  vi.stubEnv("LONDOS_LOCAL_ADAPTERS", "false");
  vi.stubEnv("LONDOS_MONGODB_MIGRATION_ENABLED", "false");
  vi.stubEnv("LONDOS_PWA_ORIGINS", "");
  vi.stubEnv("LONDOS_SEARCH_INDEXING", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

test("hosted and self-hosted public metadata use only the configured canonical origin", () => {
  for (const mode of ["render", "selfhosted"]) {
    vi.stubEnv("DEPLOY_MODE", mode);
    expect(indexingOrigin()).toBe("https://mall.example");
    expect(publicMetadata("/shops/test", "Test", "Public description")).toMatchObject({
      alternates: { canonical: "https://mall.example/shops/test" },
      robots: { index: true, follow: true },
      openGraph: { url: "https://mall.example/shops/test" },
    });
    expect(robots()).toMatchObject({ sitemap: "https://mall.example/sitemap.xml" });
  }
});

test.each([
  ["LONDOS_SEARCH_INDEXING", "false"],
  ["LONDOS_SEARCH_INDEXING", ""],
  ["LONDOS_DATA_SOURCE", "fixtures"],
  ["LONDOS_CORE_ENABLED", "false"],
  ["AUTH_BASE_URL", "https://localhost"],
  ["AUTH_BASE_URL", "http://127.0.0.1:3000"],
  ["AUTH_BASE_URL", "https://[::1]"],
  ["AUTH_BASE_URL", "http://mall.example"],
  ["AUTH_BASE_URL", "https://secret:password@mall.example"],
  ["AUTH_BASE_URL", "https://mall.example/private"],
  ["AUTH_BASE_URL", "malformed"],
  ["LONDOS_LOCAL_ADAPTERS", "true"],
  ["DATABASE_URL", ""],
])("%s=%s keeps indexing disabled", (key, value) => {
  vi.stubEnv(key, value);
  expect(indexingOrigin()).toBeNull();
  expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  const metadata = publicMetadata("/", "Londos", "Public description");
  expect(metadata.robots).toEqual({ index: false, follow: false });
  expect(metadata.alternates).toBeUndefined();
});

test("sitemap batching covers boundary counts without silently dropping URLs", () => {
  expect([0, 1, 4999, 5000, 5001, 10000, 10001].map(sitemapPages)).toEqual([0, 1, 1, 1, 2, 2, 3]);
  expect(() => sitemapPages(-1)).toThrow();
  expect(() => sitemapPages(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  expect(sitemapKind("products")).toBe(true);
  expect(sitemapKind("users")).toBe(false);
  expect(sitemapPage("1.xml")).toBe(1);
  for (const page of ["-1.xml", "01.xml", "1", "0.xml?x=1", "100000.xml", "1;DROP TABLE shops"])
    expect(sitemapPage(page)).toBeNull();
});

test("XML escapes content and does not invent modification dates", () => {
  const xml = sitemapXML("https://mall.example", ["/test?a=1&b=<\"'>"]);
  expect(xml).toContain("&amp;b=&lt;&quot;&apos;&gt;");
  expect(xml).not.toContain("lastmod");
  expect(sitemapXML("https://mall.example", ["/sitemaps/pages/0.xml"], true)).toContain(
    "<sitemapindex",
  );
});

test("disabled sitemap routes do not open a database connection", async () => {
  vi.stubEnv("LONDOS_SEARCH_INDEXING", "false");
  expect((await sitemapIndex()).status).toBe(404);
  expect(
    (
      await sitemapShard(new Request("https://mall.example/sitemaps/products/0.xml"), {
        params: Promise.resolve({ kind: "products", page: "0.xml" }),
      })
    ).status,
  ).toBe(404);
  expect(database).not.toHaveBeenCalled();
});

test("database failure returns a retryable response without leaking driver details", async () => {
  const responses = [
    await sitemapIndex(),
    await sitemapShard(new Request("https://attacker.example/sitemaps/products/0.xml"), {
      params: Promise.resolve({ kind: "products", page: "0.xml" }),
    }),
  ];
  for (const response of responses) {
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  }
});

test("request hosts cannot change sitemap origins", async () => {
  const response = await sitemapShard(
    new Request("https://attacker.example/sitemaps/pages/0.xml"),
    {
      params: Promise.resolve({ kind: "pages", page: "0.xml" }),
    },
  );
  const xml = await response.text();
  expect(response.status).toBe(200);
  expect(xml).toContain("https://mall.example/");
  expect(xml).not.toContain("attacker.example");
});
