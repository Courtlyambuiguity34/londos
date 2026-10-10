import { beforeAll, afterAll, beforeEach, test, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { migrate } from "../../src/server/db/migrate";
import { seed, seedIds, type SeedAccounts } from "../../src/server/db/seed";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { coreConfig } from "../../src/server/config";
import { createAuth } from "../../src/server/security/auth";
import { resolveActor, type Actor } from "../../src/server/security/authorization";
import { readDesign, saveDesign, publishDesign } from "../../src/server/shop-design";
import { readPublicShop } from "../../src/server/public-shop";
import { catalogueGeneration } from "../../src/server/catalogue-pagination";
import { transaction } from "../../src/server/db/pool";

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
  directory = await mkdtemp(join(tmpdir(), "londos-p11-"));
  await migrate(pool, undefined, "017_conversational_design.sql");
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
    [shop, seedIds.merchantA, seedIds.mallA, `p11-${shop}`],
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
async function manyProducts() {
  await pool.query(
    "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,price_minor,availability,position) SELECT gen_random_uuid(),$1,$2,$3,'product','Page item '||i,'item-'||i,'UGX',1000,'available',i/3 FROM generate_series(1,45) g(i)",
    [shop, seedIds.merchantA, department],
  );
  await published();
  return readPublicShop(pool, shop, { department });
}
test("017 to 018 is additive and repeatable, preserving old canonical fixtures", async () => {
  expect(
    (await pool.query("SELECT id,name,slug,version FROM shops WHERE id=$1", [seedIds.shopA]))
      .rows[0],
  ).toEqual(before);
  expect((await pool.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n).toBe(24);
  await migrate(pool);
  expect((await readDesign(pool, actors.ownerA!, seedIds.shopA)).specification.schemaVersion).toBe(
    1,
  );
});
test("all catalogue rows are reachable with tied positions and no duplicate or missing items", async () => {
  let page = await manyProducts();
  const seen = page.products.map((p) => p.id);
  expect(page.products).toHaveLength(20);
  while (page.nextCursor) {
    page = await readPublicShop(pool, shop, { department, after: page.nextCursor });
    seen.push(...page.products.map((p) => p.id));
  }
  expect(seen).toHaveLength(46);
  expect(new Set(seen).size).toBe(46);
  expect(page.paginated).toBe(true);
  expect((await readPublicShop(pool, shop, { department })).products).toHaveLength(20);
});
test.each(["reorder", "archive", "insert", "department", "attachment"])(
  "%s invalidates an earlier catalogue cursor instead of silently skipping rows",
  async (kind) => {
    const page = await manyProducts();
    if (kind === "reorder")
      await pool.query("UPDATE products SET position=100 WHERE id=$1", [product]);
    if (kind === "archive")
      await pool.query("UPDATE products SET availability='archived' WHERE id=$1", [product]);
    if (kind === "insert")
      await pool.query(
        "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,availability)VALUES(gen_random_uuid(),$1,$2,$3,'product','New','new','UGX','available')",
        [shop, seedIds.merchantA, department],
      );
    if (kind === "department")
      await pool.query("UPDATE departments SET name='Updated' WHERE id=$1", [department]);
    if (kind === "attachment")
      await pool.query(
        "INSERT INTO media_assets(id,shop_id,merchant_id,state,alt,storage_key)VALUES(gen_random_uuid(),$1,$2,'uploaded','New photo','p11-photo')",
        [shop, seedIds.merchantA],
      );
    await expect(
      readPublicShop(pool, shop, { department, after: page.nextCursor! }),
    ).rejects.toMatchObject({ status: 409, code: "catalogue_changed" });
    expect((await readPublicShop(pool, shop, { department })).products.length).toBeGreaterThan(0);
  },
);
test("counter changes serialize concurrent statements, ignore empty writes and roll back with failed writes", async () => {
  const before = BigInt(await catalogueGeneration(pool, shop));
  await Promise.all(
    Array.from({ length: 10 }, () =>
      pool.query("UPDATE products SET position=position+1 WHERE id=$1", [product]),
    ),
  );
  expect(BigInt(await catalogueGeneration(pool, shop))).toBe(before + 10n);
  await pool.query("UPDATE products SET position=1 WHERE shop_id=$1 AND false", [shop]);
  expect(BigInt(await catalogueGeneration(pool, shop))).toBe(before + 10n);
  await expect(
    transaction(pool, async (client) => {
      await client.query("UPDATE products SET position=1 WHERE id=$1", [product]);
      throw Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(BigInt(await catalogueGeneration(pool, shop))).toBe(before + 10n);
  await expect(
    pool.query("UPDATE shop_catalogue_versions SET generation=1 WHERE shop_id=$1", [shop]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    pool.query("DELETE FROM shop_catalogue_versions WHERE shop_id=$1", [shop]),
  ).rejects.toMatchObject({ code: "23514" });
});
test("cursors deny wrong department/shop and eligibility is rechecked before stale page access", async () => {
  const page = await manyProducts();
  await expect(
    readPublicShop(pool, seedIds.shopB, {
      department: "40000000-0000-4000-8000-000000000001",
      after: page.nextCursor!,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(readPublicShop(pool, shop, { department, after: "invalid" })).rejects.toMatchObject({
    status: 422,
  });
  await pool.query("UPDATE tenancies SET state='closed' WHERE shop_id=$1", [shop]);
  await expect(
    readPublicShop(pool, shop, { department, after: page.nextCursor! }),
  ).rejects.toMatchObject({ status: 404 });
});
test("collection resolves current filtered catalogue values and all new reference types deny foreign IDs", async () => {
  await pool.query("UPDATE products SET kind='service',price_minor=7654 WHERE id=$1", [product]);
  const collection = {
    id: "services",
    type: "collection" as const,
    version: 1 as const,
    title: "Available services",
    departmentId: department,
    limit: 4,
    kind: "service" as const,
    availability: "available" as const,
  };
  const d = await saveDesign(pool, actors.ownerA!, shop, {
    version: 0,
    summary: "Semantic collection",
    specification: {
      ...specification(),
      spaces: [
        collection,
        { id: "entrance", type: "entrance", version: 1, title: "Welcome", body: "Hello" },
        {
          id: "offer",
          type: "offer",
          version: 1,
          title: "Merchant offer",
          body: "Ask for current terms",
        },
        {
          id: "desk",
          type: "service_desk",
          version: 1,
          title: "Service desk",
          body: "Ask a question",
        },
        { id: "display", type: "display", version: 1, title: "Featured", productIds: [product] },
      ],
    },
  });
  await publishDesign(pool, actors.ownerA!, shop, { ...d, confirm: true });
  const view = await readPublicShop(pool, shop);
  expect(view.products.map((p) => p.price_minor)).toEqual(["7654"]);
  for (const type of ["products", "display", "gallery"] as const)
    await expect(
      saveDesign(pool, actors.ownerA!, shop, {
        version: 2,
        summary: "Foreign reference",
        specification: {
          ...specification(),
          spaces: [
            {
              id: "curated",
              type,
              version: 1,
              title: "Foreign",
              productIds: ["50000000-0000-4000-8000-000000000001"],
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
  await expect(
    saveDesign(pool, actors.ownerA!, shop, {
      version: 2,
      summary: "Foreign collection",
      specification: {
        ...specification(),
        spaces: [{ ...collection, departmentId: "40000000-0000-4000-8000-000000000001" }],
      },
    }),
  ).rejects.toMatchObject({ status: 404 });
});
test("galleries require an owned ready image with alt text and revalidate before publication", async () => {
  const gallery = {
    id: "gallery",
    type: "gallery" as const,
    version: 1 as const,
    title: "Our photos",
    productIds: [product],
  };
  const save = () =>
    saveDesign(pool, actors.ownerA!, shop, {
      version: 0,
      summary: "Gallery",
      specification: { ...specification(), spaces: [gallery] },
    });
  await expect(save()).rejects.toMatchObject({ status: 404 });
  const asset = randomUUID();
  await pool.query(
    "INSERT INTO media_assets(id,shop_id,merchant_id,state,alt,storage_key)VALUES($1,$2,$3,'ready','Fictional shoes',$1::uuid::text)",
    [asset, shop, seedIds.merchantA],
  );
  await pool.query(
    "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id)VALUES($1,$2,$3,$4)",
    [product, asset, shop, seedIds.merchantA],
  );
  const draft = await save();
  await pool.query("UPDATE media_assets SET state='failed' WHERE id=$1", [asset]);
  await expect(
    publishDesign(pool, actors.ownerA!, shop, { ...draft, confirm: true }),
  ).rejects.toMatchObject({ status: 404 });
  await pool.query("UPDATE media_assets SET state='ready' WHERE id=$1", [asset]);
  await publishDesign(pool, actors.ownerA!, shop, { ...draft, confirm: true });
  expect((await readPublicShop(pool, shop)).specification.spaces[0]?.type).toBe("gallery");
});
test("all 100 bounded departments remain reachable and unsupported future LSS falls back safely", async () => {
  await pool.query(
    "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) SELECT gen_random_uuid(),$1,$2,'Department '||i,'department-'||i,i FROM generate_series(1,99) g(i)",
    [shop, seedIds.merchantA],
  );
  await published();
  expect((await readPublicShop(pool, shop)).departments).toHaveLength(100);
  await pool.query(
    "INSERT INTO shop_revisions(id,shop_id,merchant_id,revision,schema_version,design,summary)VALUES(gen_random_uuid(),$1,$2,2,1,$3,'Future imported fixture')",
    [shop, seedIds.merchantA, JSON.stringify({ ...specification(), schemaVersion: 999 })],
  );
  await pool.query(
    "UPDATE shop_designs SET published_id=(SELECT id FROM shop_revisions WHERE shop_id=$1 AND revision=2) WHERE shop_id=$1",
    [shop],
  );
  expect((await readPublicShop(pool, shop)).specification.spaces).toEqual([]);
});
test("an interrupted 018 migration rolls back completely and a retry preserves old fixtures", async () => {
  const name = `londos_test_${randomUUID().replaceAll("-", "")}`,
    directory = await mkdtemp(join(tmpdir(), "londos-migration-p11-"));
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  const isolated = new Pool({ connectionString: url.toString() });
  try {
    await migrate(isolated, undefined, "017_conversational_design.sql");
    for (const file of await readdir("migrations"))
      if (/^\d{3}_.*\.sql$/.test(file))
        await writeFile(join(directory, file), await readFile(join("migrations", file)));
    const file = join(directory, "018_catalogue_pagination.sql"),
      original = await readFile(file, "utf8");
    await writeFile(file, original + "\nSELECT 1/0;\n");
    await expect(migrate(isolated, directory)).rejects.toMatchObject({ code: "22012" });
    expect(
      (await isolated.query("SELECT to_regclass('shop_catalogue_versions') AS relation")).rows[0]
        .relation,
    ).toBe(null);
    expect(
      (await isolated.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n,
    ).toBe(17);
    await writeFile(file, original);
    await migrate(isolated, directory);
    await migrate(isolated, directory);
    expect(
      (await isolated.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n,
    ).toBe(24);
  } finally {
    await isolated.end();
    await parent.query(`DROP DATABASE ${name}`);
    await rm(directory, { recursive: true, force: true });
  }
});
