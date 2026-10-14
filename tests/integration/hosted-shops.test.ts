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
  expect(await publicShop.text()).toContain("Hosted draft announcement");
  const publicProduct = await request(`${publicPath}/products/hosted-test-shoes`);
  expect(publicProduct.status).toBe(200);
  expect(await publicProduct.text()).toContain("34,500");
  const search = await request("/search?q=Hosted%20test%20shoes");
  expect(search.status).toBe(200);
  expect(await search.text()).toContain("Annette Fashion House");
  const unpublish = await request(`${root}/design/unpublish`, cookie, "POST", {
    version: publishedState.version,
    confirm: true,
  });
  expect(unpublish.status).toBe(200);
  expect((await request(publicPath)).status).toBe(404);
  // No worker runs in this test, so fictional email settings cannot send any mail.
  expect(
    (await pool!.query("SELECT count(*)::int AS count FROM notification_deliveries")).rows[0].count,
  ).toBe(0);
});
