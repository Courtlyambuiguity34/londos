import { beforeAll, afterAll, beforeEach, test, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { migrate } from "../../src/server/db/migrate";
import { seed, seedIds, type SeedAccounts } from "../../src/server/db/seed";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { coreConfig } from "../../src/server/config";
import { createAuth } from "../../src/server/security/auth";
import { resolveActor, type Actor } from "../../src/server/security/authorization";
import {
  readDesign,
  saveDesign,
  patchDesign,
  publishDesign,
  unpublishDesign,
  rollbackDesign,
} from "../../src/server/shop-design";
import {
  readPublicShop,
  readPrivatePreview,
  readPublicVariant,
} from "../../src/server/public-shop";
import { saveProduct } from "../../src/server/catalogue";
import { publicContact, saveContacts } from "../../src/server/contacts";
import { PostgresSearch } from "../../src/server/discovery";
import type { ShopSpecification } from "../../src/modules/shop-design/specification";
const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  directory: string,
  actors: Record<string, Actor>,
  accounts: SeedAccounts,
  shop: string,
  department: string,
  product: string,
  before: unknown;
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  pool = new Pool({ connectionString: url.toString() });
  directory = await mkdtemp(join(tmpdir(), "londos-p6-"));
  await migrate(pool, undefined, "008_p5_catalogue_and_media.sql");
  const auth = createAuth(pool, coreConfig(), true);
  accounts = await seed(pool, auth, directory);
  before = (await pool.query("SELECT id,name,slug,version FROM shops WHERE id=$1", [seedIds.shopA]))
    .rows[0];
  await migrate(pool);
  actors = {};
  for (const key of ["ownerA", "ownerB", "staff"] as const) {
    const account = accounts[key],
      response = await auth.handler(
        new Request(`${coreConfig().baseURL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { origin: coreConfig().baseURL, "Content-Type": "application/json" },
          body: JSON.stringify({ email: account.email, password: account.password }),
        }),
      );
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
    actors[key] = await resolveActor(auth, new Headers({ cookie }));
  }
});
afterAll(async () => {
  await pool?.end();
  const deadline = Date.now() + 2000;
  while (
    (await parent.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1", [name])).rowCount &&
    Date.now() < deadline
  )
    await setTimeout(20);
  await parent.query(`DROP DATABASE IF EXISTS ${name}`);
  await parent.end();
  await rm(directory, { recursive: true, force: true });
  process.env.DATABASE_URL = parentURL;
});
beforeEach(async () => {
  shop = randomUUID();
  department = randomUUID();
  product = randomUUID();
  await pool.query(
    "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category)VALUES($1,$2,$3,'Fictional design shop',$4,'fashion')",
    [shop, seedIds.merchantA, seedIds.mallA, `p6-${shop}`],
  );
  await pool.query(
    "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position)VALUES($1,$2,$3,'Shoes','shoes',0)",
    [department, shop, seedIds.merchantA],
  );
  await pool.query(
    "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,price_minor,availability)VALUES($1,$2,$3,$4,'product','Sample shoes','sample-shoes','UGX',123000,'available')",
    [product, shop, seedIds.merchantA, department],
  );
  await pool.query("INSERT INTO shop_publication(shop_id,state)VALUES($1,'unpublished')", [shop]);
  await pool.query("INSERT INTO tenancies(shop_id,state)VALUES($1,'active')", [shop]);
  await pool.query("INSERT INTO shop_moderation(shop_id,state)VALUES($1,'clear')", [shop]);
});
function specification(): ShopSpecification {
  return {
    schemaVersion: 1,
    theme: "earth",
    announcement: "Sample shop",
    spaces: [
      { id: "shoes", type: "department", version: 1, departmentId: department, limit: 8 },
      {
        id: "story",
        type: "story",
        version: 1,
        title: "Our shop",
        body: "<script>window.fake=1</script>",
      },
    ],
    actions: ["whatsapp", "enquiry"],
  };
}
async function draft() {
  return saveDesign(pool, actors.ownerA!, shop, {
    version: 0,
    summary: "Initial draft",
    specification: specification(),
  });
}
async function published() {
  const d = await draft();
  return publishDesign(pool, actors.ownerA!, shop, { ...d, confirm: true });
}
test("008 to 009 preserves canonical rows and new writes/revisions remain scoped and immutable", async () => {
  expect(
    (await pool.query("SELECT id,name,slug,version FROM shops WHERE id=$1", [seedIds.shopA]))
      .rows[0],
  ).toEqual(before);
  await draft();
  await expect(
    pool.query("UPDATE shop_revisions SET summary='changed' WHERE shop_id=$1", [shop]),
  ).rejects.toMatchObject({ code: "P0001" });
  await expect(
    pool.query("UPDATE shop_designs SET merchant_id=$2 WHERE shop_id=$1", [
      shop,
      seedIds.merchantB,
    ]),
  ).rejects.toMatchObject({ code: "P0001" });
});
test("draft and preview are private; guessed shops and foreign nested references deny", async () => {
  await draft();
  await expect(readPublicShop(pool, shop)).rejects.toMatchObject({ status: 404 });
  expect((await readPrivatePreview(pool, actors.ownerA!, shop)).revision).toBe(1);
  for (const actor of [actors.ownerB!, actors.staff!]) {
    await expect(readDesign(pool, actor, shop)).rejects.toMatchObject({ status: 404 });
    await expect(readPrivatePreview(pool, actor, shop)).rejects.toMatchObject({ status: 404 });
  }
  await expect(
    saveDesign(pool, actors.ownerA!, shop, {
      version: 1,
      summary: "Foreign department",
      specification: {
        ...specification(),
        spaces: [
          {
            id: "foreign",
            type: "department",
            version: 1,
            departmentId: "40000000-0000-4000-8000-000000000001",
            limit: 8,
          },
        ],
      },
    }),
  ).rejects.toMatchObject({ status: 404 });
});
test("staff requires explicit design and shop grants, and publishing needs its separate grant", async () => {
  await pool.query(
    "UPDATE memberships SET permissions=ARRAY['design'] WHERE merchant_id=$1 AND user_id=$2",
    [seedIds.merchantA, accounts.staff.id],
  );
  await expect(readDesign(pool, actors.staff!, shop)).rejects.toMatchObject({ status: 404 });
  await pool.query(
    "INSERT INTO staff_shop_grants(merchant_id,user_id,shop_id,permissions)VALUES($1,$2,$3,ARRAY['design'])",
    [seedIds.merchantA, accounts.staff.id, shop],
  );
  const d = await saveDesign(pool, actors.staff!, shop, {
    version: 0,
    summary: "Staff design",
    specification: specification(),
  });
  await expect(
    publishDesign(pool, actors.staff!, shop, { ...d, confirm: true }),
  ).rejects.toMatchObject({ status: 404 });
});
test("concurrent draft saves cannot silently overwrite; patch and restore append new revisions", async () => {
  const d = await draft();
  const results = await Promise.allSettled(
    ["plum", "blue"].map((theme) =>
      saveDesign(pool, actors.ownerA!, shop, {
        version: d.version,
        summary: "Concurrent edit",
        specification: { ...specification(), theme: theme as "plum" | "blue" },
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
  const next = await patchDesign(pool, actors.ownerA!, shop, {
    version: 2,
    patch: { op: "move", spaceId: "story", before: "shoes" },
  });
  expect(next.revision).toBe(3);
  expect((await readPrivatePreview(pool, actors.ownerA!, shop)).specification.spaces[0]!.id).toBe(
    "story",
  );
  const restored = await rollbackDesign(pool, actors.ownerA!, shop, {
    version: 3,
    revision: 1,
    summary: "Restore first layout",
  });
  expect(restored.revision).toBe(4);
  expect(
    (await pool.query("SELECT count(*)::int AS count FROM shop_revisions WHERE shop_id=$1", [shop]))
      .rows[0].count,
  ).toBe(4);
});
test("publication needs fresh authentication and revalidates references/tenancy/moderation", async () => {
  const d = await draft();
  await pool.query("UPDATE session SET \"createdAt\"=now()-interval '6 minutes' WHERE id=$1", [
    actors.ownerA!.sessionId,
  ]);
  try {
    await expect(
      publishDesign(pool, actors.ownerA!, shop, { ...d, confirm: true }),
    ).rejects.toMatchObject({ status: 403 });
  } finally {
    await pool.query('UPDATE session SET "createdAt"=now() WHERE id=$1', [
      actors.ownerA!.sessionId,
    ]);
  }
  await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [shop]);
  await expect(
    publishDesign(pool, actors.ownerA!, shop, { ...d, confirm: true }),
  ).rejects.toMatchObject({ status: 409 });
  await pool.query("UPDATE shop_moderation SET state='clear' WHERE shop_id=$1", [shop]);
  await pool.query("UPDATE departments SET archived=true WHERE id=$1", [department]);
  await expect(
    publishDesign(pool, actors.ownerA!, shop, { ...d, confirm: true }),
  ).rejects.toMatchObject({ status: 404 });
});
test("publication races, rollback and catalogue changes resolve current prices without restoring business data", async () => {
  const d = await draft(),
    results = await Promise.allSettled([
      publishDesign(pool, actors.ownerA!, shop, { ...d, confirm: true }),
      publishDesign(pool, actors.ownerA!, shop, { ...d, confirm: true }),
    ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await saveProduct(pool, actors.ownerA!, shop, product, {
    departmentId: department,
    kind: "product",
    name: "Updated sample shoes",
    slug: "sample-shoes",
    description: "Current description",
    currency: "UGX",
    priceMinor: "99999999999999999999",
    availability: "unavailable",
    position: 0,
    mediaId: null,
    version: 1,
  });
  const restored = await rollbackDesign(pool, actors.ownerA!, shop, {
    version: 2,
    revision: 1,
    summary: "Restore layout only",
  });
  await publishDesign(pool, actors.ownerA!, shop, { ...restored, confirm: true });
  const view = await readPublicShop(pool, shop);
  expect(view.products[0]).toMatchObject({
    name: "Updated sample shoes",
    price_minor: "99999999999999999999",
    availability: "unavailable",
  });
  await pool.query("UPDATE products SET availability='archived' WHERE id=$1", [product]);
  expect((await readPublicShop(pool, shop)).products).toEqual([]);
  expect((await readPublicShop(pool, shop, { product: "sample-shoes" })).missingDestination).toBe(
    true,
  );
});
test.each(["pending", "closed"])("tenancy %s overrides a published design", async (state) => {
  await published();
  await pool.query("UPDATE tenancies SET state=$2 WHERE shop_id=$1", [shop, state]);
  await expect(readPublicShop(pool, shop)).rejects.toMatchObject({ status: 404 });
});
test.each(["due", "grace"])(
  "tenancy %s retains the development browsing/contact eligibility",
  async (state) => {
    await published();
    await pool.query("UPDATE tenancies SET state=$2 WHERE shop_id=$1", [shop, state]);
    expect((await readPublicShop(pool, shop)).shop.id).toBe(shop);
    await saveContacts(pool, actors.ownerA!, shop, {
      version: 0,
      phone: "",
      whatsapp: "",
      website: "",
      fulfilment: "contact",
      paymentInstructions: "",
      deliveryInstructions: "",
      enquiriesEnabled: true,
      reason: "Development eligibility fixture",
    });
    expect((await publicContact(pool, shop)).id).toBe(shop);
  },
);
test("unpublish and moderation immediately remove direct reads and ready-media delivery", async () => {
  const d = await published();
  const id = randomUUID();
  await pool.query(
    "INSERT INTO media_assets(id,shop_id,merchant_id,state,storage_key,alt,width,height)VALUES($1,$2,$3,'ready',$4,'Sample image',2,2)",
    [id, shop, seedIds.merchantA, `private:${id}`],
  );
  await pool.query(
    "INSERT INTO media_blobs(asset_id,variant,bytes,width,height)VALUES($1,'card',$2,2,2)",
    [id, Buffer.from("synthetic encoded bytes")],
  );
  await pool.query(
    "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id)VALUES($1,$2,$3,$4)",
    [product, id, shop, seedIds.merchantA],
  );
  expect((await readPublicVariant(pool, shop, id, "card")).length).toBeGreaterThan(0);
  await expect(readPublicVariant(pool, shop, id, "source")).rejects.toThrow();
  await expect(readPublicVariant(pool, seedIds.shopB, id, "card")).rejects.toMatchObject({
    status: 404,
  });
  await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [shop]);
  await expect(readPublicVariant(pool, shop, id, "card")).rejects.toMatchObject({ status: 404 });
  await expect(readPublicShop(pool, shop)).rejects.toMatchObject({ status: 404 });
  await pool.query("UPDATE shop_moderation SET state='clear' WHERE shop_id=$1", [shop]);
  await unpublishDesign(pool, actors.ownerA!, shop, { version: d.version, confirm: true });
  await expect(readPublicShop(pool, shop)).rejects.toMatchObject({ status: 404 });
  await expect(readPublicVariant(pool, shop, id, "card")).rejects.toMatchObject({ status: 404 });
});
test("unsupported stored legacy components fall back safely without rendering arbitrary design", async () => {
  await published();
  const legacy = randomUUID();
  await pool.query(
    "INSERT INTO shop_revisions(id,shop_id,merchant_id,revision,schema_version,design)VALUES($1,$2,$3,99,2,$4)",
    [
      legacy,
      shop,
      seedIds.merchantA,
      JSON.stringify({ html: "<script>bad</script>", verified: true }),
    ],
  );
  await pool.query("UPDATE shop_designs SET published_id=$2 WHERE shop_id=$1", [shop, legacy]);
  const view = await readPublicShop(pool, shop);
  expect(view.specification.spaces).toEqual([]);
  expect(view.products).toEqual([]);
});

test("public shelves retain merchant ordering independently of UUID order", async () => {
  await published();
  const extra = "00000000-0000-4000-8000-000000000001";
  await pool.query(
    "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,availability,position)VALUES($1,$2,$3,$4,'product','Later sample','later','UGX','available',7)",
    [extra, shop, seedIds.merchantA, department],
  );
  expect((await readPublicShop(pool, shop)).products.map((p) => p.id)).toEqual([product, extra]);
});
test("indexed discovery aggregates one result per shop and uses department context", async () => {
  await published();
  const result = await new PostgresSearch(pool).search({ query: "shoes", shopId: shop });
  expect(result.results).toHaveLength(1);
  expect(result.results[0]).toMatchObject({ id: shop, context: "Shoes", department_slug: "shoes" });
  for (let i = 0; i < 30; i++)
    await pool.query(
      "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,availability)VALUES($1,$2,$3,$4,'product','Sample shoes',$5,'UGX','available')",
      [randomUUID(), shop, seedIds.merchantA, department, `extra-${i}`],
    );
  expect(
    (await new PostgresSearch(pool).search({ query: "shoes", shopId: shop })).results,
  ).toHaveLength(1);
});
test("search categories, stemming, shop scope and newly published exposure are bounded", async () => {
  await published();
  const search = new PostgresSearch(pool);
  expect(
    (await search.search({ query: "shoe", category: "fashion", shopId: shop })).results,
  ).toHaveLength(1);
  expect((await search.search({ query: "shoes", category: "food", shopId: shop })).results).toEqual(
    [],
  );
  expect((await search.search({ query: "", shopId: shop })).results[0]!.id).toBe(shop);
  expect((await search.search({ query: "qzx-no-match", shopId: shop })).results).toEqual([]);
  expect((await search.search({ query: "", limit: 1 })).results[0]!.id).toBe(shop);
});
test("live product/search changes become visible without worker projections", async () => {
  await published();
  await pool.query("UPDATE products SET name='Violet example' WHERE id=$1", [product]);
  const search = new PostgresSearch(pool);
  expect((await search.search({ query: "violet", shopId: shop })).results).toHaveLength(1);
  await saveProduct(pool, actors.ownerA!, shop, product, {
    departmentId: department,
    kind: "product",
    name: "Copper example",
    slug: "sample-shoes",
    description: "",
    currency: "UGX",
    priceMinor: "456000",
    availability: "available",
    position: 0,
    mediaId: null,
    version: 1,
  });
  expect((await search.search({ query: "violet", shopId: shop })).results).toEqual([]);
  expect((await search.search({ query: "copper", shopId: shop })).results).toHaveLength(1);
  await pool.query("UPDATE products SET availability='archived' WHERE id=$1", [product]);
  expect((await search.search({ query: "copper", shopId: shop })).results).toEqual([]);
});
test("closure, unpublish and suspension cannot be resurrected by stale internal projections", async () => {
  const d = await published(),
    search = new PostgresSearch(pool);
  await pool.query(
    "INSERT INTO shop_projections(shop_id,version,name)VALUES($1,1,'Stale projected shop')",
    [shop],
  );
  for (const [table, state] of [
    ["tenancies", "closed"],
    ["shop_publication", "unpublished"],
    ["shop_moderation", "suspended"],
  ] as const) {
    await pool.query(`UPDATE ${table} SET state=$2 WHERE shop_id=$1`, [shop, state]);
    expect((await search.search({ query: "shoes", shopId: shop })).results).toEqual([]);
    await pool.query(`UPDATE ${table} SET state=$2 WHERE shop_id=$1`, [
      shop,
      table === "shop_moderation" ? "clear" : "active",
    ]);
  }
  await unpublishDesign(pool, actors.ownerA!, shop, { version: d.version, confirm: true });
  expect((await search.search({ query: "shoes", shopId: shop })).results).toEqual([]);
  await pool.query("UPDATE shop_publication SET state='active' WHERE shop_id=$1", [shop]);
  await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [shop]);
  await pool.query("UPDATE tenancies SET state='active' WHERE shop_id=$1", [shop]);
  expect((await search.search({ query: "shoes", shopId: shop })).results).toEqual([]);
});
test("cursor pages are bounded, scope-bound and contain no duplicated shops or tariff signals", async () => {
  await published();
  const search = new PostgresSearch(pool),
    all = new Set<string>();
  let cursor: string | undefined;
  for (let i = 0; i < 30; i++) {
    const result = await search.search({ query: "shoes", limit: 2, ...(cursor ? { cursor } : {}) });
    expect(result.results.length).toBeLessThanOrEqual(2);
    for (const row of result.results) {
      expect(all.has(row.id)).toBe(false);
      all.add(row.id);
      expect(row).not.toHaveProperty("mall_id");
      expect(row).not.toHaveProperty("merchant_id");
    }
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  expect(all.has(shop)).toBe(true);
  const first = await search.search({ query: "shoes", limit: 1 });
  expect(first.nextCursor).not.toBeNull();
  await expect(
    search.search({ query: "different", cursor: first.nextCursor! }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(search.search({ query: "shoes", cursor: "not-json" })).rejects.toMatchObject({
    status: 422,
  });
  await expect(search.search({ query: "x".repeat(81) })).rejects.toThrow();
  await expect(search.search({ query: "shoes", limit: 21 })).rejects.toThrow();
  expect(
    (await search.search({ query: "' OR 1=1; DROP TABLE shops;--", shopId: shop })).results,
  ).toEqual([]);
});
test("search has a real database statement deadline and recovers after contention", async () => {
  await published();
  const client = await pool.connect();
  await client.query("BEGIN");
  await client.query("LOCK TABLE products IN ACCESS EXCLUSIVE MODE");
  const start = Date.now();
  try {
    await expect(
      new PostgresSearch(pool).search({ query: "shoes", shopId: shop }),
    ).rejects.toMatchObject({ code: "57014" });
    expect(Date.now() - start).toBeLessThan(3500);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
  expect(
    (await new PostgresSearch(pool).search({ query: "shoes", shopId: shop })).results,
  ).toHaveLength(1);
  expect((await readPublicShop(pool, shop)).shop.id).toBe(shop);
});
