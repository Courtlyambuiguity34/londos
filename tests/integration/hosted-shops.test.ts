import { afterAll, beforeAll, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { migrate } from "../../src/server/db/migrate";
import { seed, seedIds, type SeedAccounts } from "../../src/server/db/seed";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";

// Use a real compiled server and real PostgreSQL, but never a live provider or database.
// The parent runner's development guard protects database creation and cleanup.
const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL, max: 1 }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`,
  canonicalOrigin = "https://londos-test.onrender.com";
let pool: Pool | undefined,
  server: ChildProcess | undefined,
  directory: string | undefined,
  created = false,
  origin: string,
  accounts: SeedAccounts;

async function unusedPort() {
  const socket = createServer();
  await new Promise<void>((done, fail) => {
    socket.once("error", fail);
    socket.listen(0, "127.0.0.1", done);
  });
  const address = socket.address();
  if (!address || typeof address === "string") throw Error("No test port available");
  await new Promise<void>((done, fail) => socket.close((error) => (error ? fail(error) : done())));
  return address.port;
}

beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  created = true;
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  pool = new Pool({ connectionString: url.toString(), max: 2 });
  directory = await mkdtemp(join(tmpdir(), "londos-hosted-shop-"));
  await migrate(pool);
  accounts = await seed(pool, createAuth(pool, coreConfig(), true), directory);
  const port = await unusedPort();
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [resolve(".next/standalone/server.js")], {
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DEPLOY_MODE: "render",
      AUTH_BASE_URL: canonicalOrigin,
      LONDOS_PWA_ORIGINS: canonicalOrigin,
      LONDOS_CORE_ENABLED: "true",
      LONDOS_LOCAL_ADAPTERS: "false",
      LONDOS_DATA_SOURCE: "database",
      LONDOS_SEARCH_INDEXING: "true",
      LONDOS_DATABASE_ENGINE: "postgresql",
      LONDOS_EMAIL_PROVIDER: "brevo",
      LONDOS_BREVO_API_KEY: "fictional-key-never-sent-to-a-provider",
      LONDOS_EMAIL_FROM: "sender@londos.invalid",
      LONDOS_EMAIL_FROM_NAME: "Londos test",
      LONDOS_AI_REMOTE: "false",
      LONDOS_MONGODB_ENABLED: "false",
      LONDOS_MONGODB_MIGRATION_ENABLED: "false",
      LONDOS_CLOUDINARY_ENABLED: "false",
      LONDOS_REDIS_ENABLED: "false",
      LONDOS_PILOT_ANALYTICS: "false",
      LONDOS_PRIVACY_ERASURE: "false",
    },
  });
  let spawnFailed = false;
  server.on("error", () => {
    spawnFailed = true;
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnFailed || server.exitCode !== null)
      throw Error("Compiled hosted test server failed to start");
    const ready = await fetch(`${origin}/api/ready`, {
      signal: AbortSignal.timeout(2000),
    }).catch(() => null);
    if (ready?.ok) {
      expect(await ready.json()).toMatchObject({
        mode: "configured-core",
        database: true,
        worker: "offline",
      });
      return;
    }
    await delay(100);
  }
  throw Error("Compiled hosted test server did not become ready; run npm run build first");
}, 30000);

afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    for (let i = 0; i < 100 && server.exitCode === null && server.signalCode === null; i++)
      await delay(50);
    if (server.exitCode === null && server.signalCode === null) {
      server.kill("SIGKILL");
      await new Promise<void>((done) => server!.once("exit", () => done()));
    }
  }
  await pool?.end();
  if (created) {
    for (let i = 0; i < 100; i++) {
      if (!(await parent.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1", [name])).rowCount)
        break;
      await delay(50);
    }
    await parent.query(`DROP DATABASE ${name}`);
  }
  await parent.end();
  if (directory) await rm(directory, { recursive: true, force: true });
  process.env.DATABASE_URL = parentURL;
});

async function request(path: string, cookie = "", method = "GET", body?: unknown) {
  return fetch(`${origin}${path}`, {
    method,
    redirect: "manual",
    headers: { origin: canonicalOrigin, cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
}

async function login(account: SeedAccounts[keyof SeedAccounts]) {
  const response = await request("/api/auth/sign-in/email", "", "POST", {
    email: account.email,
    password: account.password,
  });
  expect(response.status).toBe(200);
  const cookies = response.headers.getSetCookie();
  expect(cookies.some((cookie) => /; Secure/i.test(cookie))).toBe(true);
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

test("hosted settings serve public pages and enforce secure origin and tenant boundaries", async () => {
  const health = await request("/api/health");
  expect(health.status).toBe(200);
  expect(await health.json()).toMatchObject({ mode: "database-core", database: true });
  expect((await request("/")).status).toBe(200);
  const root = `/api/workspace/shops/${seedIds.shopA}`,
    foreign = await login(accounts.ownerB);
  expect((await request(`${root}/catalogue`)).status).toBe(401);
  expect((await request(`${root}/catalogue`, foreign)).status).toBe(404);
  expect((await request(`${root}/design`, foreign)).status).toBe(404);
  const crossSite = await fetch(`${origin}${root}/design`, {
    method: "PUT",
    headers: { origin: "https://attacker.invalid", "content-type": "application/json" },
    body: "{}",
  });
  expect(crossSite.status).toBe(403);
});

test("hosted merchant can create a product, preview privately, publish, discover and unpublish", async () => {
  const cookie = await login(accounts.ownerA),
    root = `/api/workspace/shops/${seedIds.shopA}`;
  const department = await request(`${root}/departments`, cookie, "POST", {
    name: "Hosted catalogue",
    slug: "hosted-catalogue",
    position: 5,
    archived: false,
    version: 0,
  });
  expect(department.status).toBe(200);
  const departmentId = (await department.json()).id;
  const product = await request(`${root}/products`, cookie, "POST", {
    departmentId,
    kind: "product",
    name: "Hosted test shoes",
    slug: "hosted-test-shoes",
    description: "Fictional product for hosted configuration verification",
    currency: "UGX",
    priceMinor: "34500",
    availability: "available",
    position: 0,
    mediaId: null,
    version: 0,
  });
  expect(product.status).toBe(200);
  const initial = await (await request(`${root}/design`, cookie)).json();
  const draft = await request(`${root}/design`, cookie, "PUT", {
    version: initial.version,
    summary: "Hosted test layout",
    specification: {
      schemaVersion: 1,
      theme: "plum",
      announcement: "Hosted draft announcement",
      spaces: [{ id: "hosted", type: "department", version: 1, departmentId, limit: 8 }],
      actions: [],
    },
  });
  expect(draft.status).toBe(200);
  const saved = await draft.json();
  const previewPath = `/shopkeeper/shops/${seedIds.shopA}/preview?revision=${saved.revision}`;
  expect((await request(previewPath, cookie)).status).toBe(200);
  const anonymousPreview = await request(previewPath);
  expect(anonymousPreview.status).toBe(307);
  expect(await anonymousPreview.text()).not.toContain("Hosted draft announcement");
  const publicPath = "/shops/annette-fashion-house";
  expect(await (await request(publicPath)).text()).not.toContain("Hosted draft announcement");
  const published = await request(`${root}/design/publish`, cookie, "POST", {
    ...saved,
    confirm: true,
  });
  expect(published.status).toBe(200);
  const publishedState = await published.json();
  const publicShop = await request(publicPath);
  expect(publicShop.status).toBe(200);
  const shopHTML = await publicShop.text();
  expect(shopHTML).toContain("Hosted draft announcement");
  expect(shopHTML).not.toContain("This development mall uses fictional merchants");
  expect(shopHTML).not.toContain(`href="/report/${seedIds.shopA}"`);
  expect(shopHTML).not.toContain("this deployment");
  expect(shopHTML).toContain('href="/report">Reporting information');
  const publicProduct = await request(`${publicPath}/products/hosted-test-shoes`);
  expect(publicProduct.status).toBe(200);
  const productHTML = await publicProduct.text();
  expect(productHTML).toContain("34,500");
  expect(productHTML).toContain(
    `rel="canonical" href="${canonicalOrigin}${publicPath}/products/hosted-test-shoes"`,
  );
  expect(productHTML).toContain('name="robots" content="index, follow"');
  expect(productHTML).toContain(
    'property="og:title" content="Hosted test shoes — Annette Fashion House"',
  );
  const productMap = async () => (await request("/sitemaps/products/0.xml")).text();
  expect(await productMap()).toContain(`${publicPath}/products/hosted-test-shoes`);
  // All entries must observe the same public eligibility, not just the HTML page.
  for (const [table, column, hidden, visible] of [
    ["shop_moderation", "state", "suspended", "clear"],
    ["tenancies", "state", "closed", "active"],
    ["shop_publication", "state", "temporarily_closed", "active"],
  ]) {
    await pool!.query(`UPDATE ${table} SET ${column}=$1 WHERE shop_id=$2`, [hidden, seedIds.shopA]);
    try {
      for (const kind of ["shops", "departments", "products"])
        expect(await (await request(`/sitemaps/${kind}/0.xml`)).text()).not.toContain(publicPath);
      expect((await request(publicPath)).status).toBe(404);
    } finally {
      await pool!.query(`UPDATE ${table} SET ${column}=$1 WHERE shop_id=$2`, [
        visible,
        seedIds.shopA,
      ]);
    }
  }
  await pool!.query("UPDATE departments SET archived=true WHERE id=$1", [departmentId]);
  try {
    expect(await productMap()).not.toContain("hosted-test-shoes");
    expect(await (await request(`${publicPath}/products/hosted-test-shoes`)).text()).toContain(
      'name="robots" content="noindex, nofollow"',
    );
  } finally {
    await pool!.query("UPDATE departments SET archived=false WHERE id=$1", [departmentId]);
  }
  await pool!.query(
    "UPDATE products SET availability='archived' WHERE shop_id=$1 AND slug='hosted-test-shoes'",
    [seedIds.shopA],
  );
  try {
    expect(await productMap()).not.toContain("hosted-test-shoes");
  } finally {
    await pool!.query(
      "UPDATE products SET availability='available' WHERE shop_id=$1 AND slug='hosted-test-shoes'",
      [seedIds.shopA],
    );
  }
  expect(await productMap()).toContain("hosted-test-shoes");
  // Exercise a real second sitemap shard, well beyond the 32-product shop view.
  // These fictional rows live only in this disposable database.
  await pool!.query(
    `INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,availability)
     SELECT gen_random_uuid(),s.id,s.merchant_id,$2,'product','Index test '||n,'index-bulk-'||n,'UGX','available'
     FROM shops s CROSS JOIN generate_series(1,5001) n WHERE s.id=$1`,
    [seedIds.shopA, departmentId],
  );
  await pool!.query(
    `INSERT INTO departments(id,shop_id,merchant_id,name,slug,position)
     SELECT gen_random_uuid(),s.id,s.merchant_id,'Index department '||n,'index-department-'||n,1000+n
     FROM shops s CROSS JOIN generate_series(1,101) n WHERE s.id=$1`,
    [seedIds.shopA],
  );
  try {
    expect(await (await request("/sitemap.xml")).text()).toContain("/sitemaps/products/1.xml");
    const first = await productMap(),
      second = await (await request("/sitemaps/products/1.xml")).text();
    expect([...first.matchAll(/<loc>/g)]).toHaveLength(5000);
    const bulk = [...(first + second).matchAll(/\/products\/index-bulk-\d+</g)].map((m) => m[0]);
    expect(bulk).toHaveLength(5001);
    expect(new Set(bulk).size).toBe(5001);
    const deepDepartment = `${publicPath}/departments/index-department-101`;
    expect(await (await request("/sitemaps/departments/0.xml")).text()).toContain(deepDepartment);
    const deepHTML = await (await request(deepDepartment)).text();
    expect(deepHTML).toContain(`rel="canonical" href="${canonicalOrigin}${deepDepartment}"`);
    expect(deepHTML).toContain("Index department 101");
  } finally {
    await pool!.query("DELETE FROM products WHERE shop_id=$1 AND slug LIKE 'index-bulk-%'", [
      seedIds.shopA,
    ]);
    await pool!.query(
      "DELETE FROM departments WHERE shop_id=$1 AND slug LIKE 'index-department-%'",
      [seedIds.shopA],
    );
  }
  await pool!.query(
    `INSERT INTO shop_operations(shop_id,merchant_id,paused,reason,changed_by)
     SELECT id,merchant_id,true,'Index isolation test',$2 FROM shops WHERE id=$1`,
    [seedIds.shopA, accounts.operator.id],
  );
  try {
    expect(await productMap()).not.toContain(publicPath);
    expect((await request(publicPath)).status).toBe(404);
  } finally {
    await pool!.query("DELETE FROM shop_operations WHERE shop_id=$1", [seedIds.shopA]);
  }
  const search = await request("/search?q=Hosted%20test%20shoes");
  expect(search.status).toBe(200);
  expect(await search.text()).toContain("Annette Fashion House");
  const unpublish = await request(`${root}/design/unpublish`, cookie, "POST", {
    version: publishedState.version,
    confirm: true,
  });
  expect(unpublish.status).toBe(200);
  expect((await request(publicPath)).status).toBe(404);
  expect(await productMap()).not.toContain(publicPath);
  // No worker runs in this test, so fictional email settings cannot send any mail.
  expect(
    (await pool!.query("SELECT count(*)::int AS count FROM notification_deliveries")).rows[0].count,
  ).toBe(0);
});

test("runtime sitemap discovery uses the configured domain and keeps private/search pages noindex", async () => {
  const robots = await request("/robots.txt");
  expect(robots.status).toBe(200);
  const rules = await robots.text();
  expect(rules).toContain(`Sitemap: ${canonicalOrigin}/sitemap.xml`);
  expect(rules).toContain("Disallow: /shopkeeper");
  expect(rules).toContain("Disallow: /landlord");
  const index = await request("/sitemap.xml");
  expect(index.status).toBe(200);
  expect(index.headers.get("cache-control")).toContain("no-store");
  const xml = await index.text();
  expect(xml).toContain(`${canonicalOrigin}/sitemaps/pages/0.xml`);
  expect(xml).not.toContain(origin);
  const pages = await (await request("/sitemaps/pages/0.xml")).text();
  expect(pages).toContain(`${canonicalOrigin}/categories/fashion`);
  expect(pages).not.toContain("shopkeeper");
  expect(pages).not.toContain("landlord");
  for (const path of [
    "/sitemaps/users/0.xml",
    "/sitemaps/products/99999.xml",
    "/sitemaps/pages/1.xml",
    "/sitemaps/products/01.xml",
  ])
    expect((await request(path)).status).toBe(404);
  for (const path of ["/sign-in", "/search?q=shoes"])
    expect(await (await request(path)).text()).toContain(
      'name="robots" content="noindex, nofollow"',
    );
  for (const path of ["/", "/categories/fashion"])
    expect(await (await request(path)).text()).toContain(
      `rel="canonical" href="${canonicalOrigin}${path}"`,
    );
});

test("Shopkeeper navigation requires a current verified session and active merchant membership", async () => {
  const link = /<a\b[^>]*class="shopkeeper-link"/;
  const guest = await request("/");
  expect(guest.status).toBe(200);
  expect(await guest.text()).not.toMatch(link);
  const ownerCookie = await login(accounts.ownerA);
  const owner = await request("/", ownerCookie);
  expect(owner.status).toBe(200);
  expect(await owner.text()).toMatch(link);
  expect(owner.headers.get("cache-control")).toContain("private");

  for (const account of [accounts.invitee, accounts.operator]) {
    const nonMerchant = await request("/", await login(account));
    expect(nonMerchant.status).toBe(200);
    expect(await nonMerchant.text()).not.toMatch(link);
  }
  const staffCookie = await login(accounts.staff);
  expect(await (await request("/", staffCookie)).text()).toMatch(link);
  // Revoke staff rather than the sole owner: the last-owner safeguard must remain intact.
  const userId = accounts.staff.id;
  await pool!.query("UPDATE memberships SET status='revoked' WHERE user_id=$1", [userId]);
  try {
    // A valid session alone is insufficient; membership revocation takes effect immediately.
    const revoked = await request("/", staffCookie);
    expect(revoked.status).toBe(200);
    expect(await revoked.text()).not.toMatch(link);
  } finally {
    await pool!.query("UPDATE memberships SET status='active' WHERE user_id=$1", [userId]);
  }
  expect(await (await request("/", staffCookie)).text()).toMatch(link);
  expect((await request("/api/auth/sign-out", ownerCookie, "POST", {})).status).toBe(200);
  // A replay of the old cookie cannot restore the link after sign-out.
  const expired = await request("/", ownerCookie);
  expect(expired.status).toBe(200);
  expect(await expired.text()).not.toMatch(link);
  expect(await (await request("/")).text()).not.toMatch(link);
});

test("hosted pages use customer wording and do not offer guarded application forms", async () => {
  for (const path of ["/", "/about", "/rent-a-shop", "/report"]) {
    const response = await request(path);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).not.toMatch(
      /development mall|fictional shops|About this preview|this deployment|Pilot pricing/i,
    );
  }
  const about = await (await request("/about")).text();
  expect(about).toContain("Buying from a shop");
  expect(about).toContain("Londos does not collect payment for purchases from shops");
  const report = await (await request("/report")).text();
  expect(report).toContain("Online concern reporting is currently unavailable");
  expect(report).not.toContain("<form");
  const rent = await (await request("/rent-a-shop")).text();
  expect(rent).toContain("Shopkeeper sign in");
  expect(rent).not.toContain("Apply for a shop");

  const cookie = await login(accounts.ownerA);
  const workspace = await (await request("/shopkeeper", cookie)).text();
  expect(workspace).toContain("Your private workspace");
  expect(workspace).not.toMatch(/development environment|fictional businesses/i);
  for (const path of ["/shopkeeper/applications", "/shopkeeper/applications/new"]) {
    expect((await request(path)).status).toBe(307);
    const response = await request(path, cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    const html = await response.text();
    expect(html).toContain("New shop applications are currently closed");
    expect(html).not.toContain("<form");
  }
  // Presentation changes cannot grant operator access or bypass lifecycle guards.
  expect((await request("/landlord", cookie)).status).toBe(403);
  const blocked = await request("/api/workspace/applications", cookie);
  expect(blocked.status).toBe(403);
  expect(await blocked.json()).toMatchObject({ error: "local_lifecycle_only" });
});
