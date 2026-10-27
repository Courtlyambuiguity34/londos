import { beforeAll, afterAll, test, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../../src/server/db/migrate";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seed, seedIds, type SeedAccounts } from "../../src/server/db/seed";
import { resolveActor, type Actor } from "../../src/server/security/authorization";
import { transaction } from "../../src/server/db/pool";
import { readCatalogue, saveDepartment, saveProduct } from "../../src/server/catalogue";
import {
  catalogueHistoryAction,
  deleteCatalogueItem,
  readCatalogueHistory,
  cleanupCatalogueHistory,
} from "../../src/server/catalogue-recovery";
const original = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: original }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  owner: Actor,
  foreign: Actor,
  directory: string,
  legacy: string,
  legacyChild: string;
const shop = seedIds.shopA;
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(original);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  pool = new Pool({ connectionString: url.toString(), max: 3 });
  directory = await mkdtemp(join(tmpdir(), "londos-catalogue-recovery-"));
  await migrate(pool, undefined, "036_clean_legacy_shop_addresses.sql");
  const auth = createAuth(pool, coreConfig(), true),
    accounts = await seed(pool, auth, directory);
  const first = randomUUID();
  legacy = randomUUID();
  legacyChild = randomUUID();
  await pool.query(
    "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position,archived) VALUES($1,$3,$4,'Crops','legacy-crops',500,true),($2,$3,$4,' crops ','legacy-crops-copy',501,true)",
    [first, legacy, shop, seedIds.merchantA],
  );
  await pool.query(
    "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,availability) VALUES($1,$2,$3,$4,'product','Legacy seed','legacy-seed','UGX','archived')",
    [legacyChild, shop, seedIds.merchantA, legacy],
  );
  await migrate(pool);
  await migrate(pool);
  async function actor(account: SeedAccounts[keyof SeedAccounts]) {
    const response = await auth.handler(
      new Request(`${coreConfig().baseURL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { origin: coreConfig().baseURL, "content-type": "application/json" },
        body: JSON.stringify(account),
      }),
    );
    expect(response.status).toBe(200);
    return resolveActor(
      auth,
      new Headers({
        cookie: response.headers
          .getSetCookie()
          .map((c) => c.split(";")[0])
          .join("; "),
      }),
    );
  }
  owner = await actor(accounts.ownerA);
  foreign = await actor(accounts.ownerB);
});
afterAll(async () => {
  await pool?.end();
  await parent.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await parent.end();
  await rm(directory, { recursive: true, force: true });
  process.env.DATABASE_URL = original;
});
const depValue = (name: string) => ({
  name,
  slug: `department-${randomUUID()}`,
  position: 700,
  archived: false,
  version: 0,
});
async function department() {
  const data = depValue(`Recovery ${randomUUID()}`),
    row = await saveDepartment(pool, owner, shop, null, data);
  return { ...row, data };
}
async function product(
  departmentId: string,
  availability: "available" | "unavailable" = "available",
) {
  const data = {
    departmentId,
    kind: "product" as const,
    name: `Recovery product ${randomUUID()}`,
    slug: `product-${randomUUID()}`,
    description: "Original merchant text",
    currency: "UGX" as const,
    priceMinor: "5000",
    availability,
    position: 0,
    mediaId: null,
    version: 0,
  };
  const row = await saveProduct(pool, owner, shop, null, data);
  return { ...row, data };
}
test("migration makes legacy names distinct without moving products or changing links", async () => {
  const rows = (
    await pool.query("SELECT id,name,slug,version FROM departments WHERE id=$1", [legacy])
  ).rows;
  expect(rows[0].name).toMatch(/\(2\)$/);
  expect(rows[0].slug).toBe("legacy-crops-copy");
  expect(rows[0].version).toBe(2);
  expect(
    (await pool.query("SELECT department_id FROM products WHERE id=$1", [legacyChild])).rows[0]
      .department_id,
  ).toBe(legacy);
  expect(
    (
      await pool.query(
        "SELECT name_key,count(*) FROM departments WHERE deleted_at IS NULL GROUP BY shop_id,name_key HAVING count(*)>1",
      )
    ).rowCount,
  ).toBe(0);
});
test("case, spacing and compatibility variants cannot create duplicate department names", async () => {
  const name = `Fresh Crops ${randomUUID()}`;
  await saveDepartment(pool, owner, shop, null, depValue(name));
  for (const value of [
    name.toUpperCase(),
    ` ${name.replaceAll(" ", "   ")} `,
    name.replaceAll(" ", "\u00a0"),
    `\t${name}\t`,
  ])
    await expect(saveDepartment(pool, owner, shop, null, depValue(value))).rejects.toMatchObject({
      code: "department_name_in_use",
    });
  const other = await saveDepartment(pool, foreign, seedIds.shopB, null, depValue(name));
  expect(other.id).toBeTruthy();
  const existing = await department();
  await expect(
    saveDepartment(pool, owner, shop, existing.id, {
      ...existing.data,
      name,
      version: existing.version,
    }),
  ).rejects.toMatchObject({ code: "department_name_in_use" });
});
test("two concurrent creates of the same name admit exactly one department", async () => {
  const name = `Concurrent ${randomUUID()}`,
    results = await Promise.allSettled([
      saveDepartment(pool, owner, shop, null, depValue(name)),
      saveDepartment(pool, owner, shop, null, depValue(name)),
    ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
});
test("delete requires confirmation and current version, hides the product, and cannot be undone through a normal edit", async () => {
  const d = await department(),
    p = await product(d.id);
  await expect(
    deleteCatalogueItem(pool, owner, shop, "product", p.id, { version: p.version, confirm: false }),
  ).rejects.toThrow();
  await expect(
    deleteCatalogueItem(pool, owner, shop, "product", p.id, {
      version: p.version + 1,
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "stale_version" });
  const removed = await deleteCatalogueItem(pool, owner, shop, "product", p.id, {
    version: p.version,
    confirm: true,
  });
  expect((await readCatalogue(pool, owner, shop)).products.some((row) => row.id === p.id)).toBe(
    false,
  );
  await expect(
    saveProduct(pool, owner, shop, p.id, { ...p.data, version: removed.version }),
  ).rejects.toMatchObject({ code: "catalogue_item_deleted" });
  await catalogueHistoryAction(pool, owner, shop, {
    action: "restore",
    kind: "product",
    id: p.id,
    version: removed.version,
    confirm: true,
  });
  const restored = (
    await pool.query("SELECT name,availability,price_minor,version FROM products WHERE id=$1", [
      p.id,
    ])
  ).rows[0];
  expect(restored).toMatchObject({
    name: p.data.name,
    availability: "available",
    price_minor: "5000",
    version: removed.version + 1,
  });
});
test("department recovery restores its own deletion batch, preserving unavailable products and earlier separate deletions", async () => {
  const d = await department(),
    a = await product(d.id),
    b = await product(d.id, "unavailable"),
    earlier = await product(d.id);
  await deleteCatalogueItem(pool, owner, shop, "product", earlier.id, {
    version: earlier.version,
    confirm: true,
  });
  const removed = await deleteCatalogueItem(pool, owner, shop, "department", d.id, {
    version: d.version,
    confirm: true,
  });
  expect(removed.affected).toBe(3);
  const bin = await readCatalogueHistory(pool, owner, shop);
  expect(bin.deleted.some((row) => row.id === d.id)).toBe(true);
  await expect(
    catalogueHistoryAction(pool, owner, shop, {
      action: "restore",
      kind: "product",
      id: a.id,
      version: 2,
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "restore_department_first" });
  const result = await catalogueHistoryAction(pool, owner, shop, {
    action: "restore",
    kind: "department",
    id: d.id,
    version: removed.version,
    confirm: true,
  });
  expect(result).toMatchObject({ affected: 3 });
  const rows = (
    await pool.query("SELECT id,availability,deleted_at FROM products WHERE id=ANY($1::uuid[])", [
      [a.id, b.id, earlier.id],
    ])
  ).rows;
  expect(rows.find((row) => row.id === a.id)).toMatchObject({
    availability: "available",
    deleted_at: null,
  });
  expect(rows.find((row) => row.id === b.id)).toMatchObject({
    availability: "unavailable",
    deleted_at: null,
  });
  expect(rows.find((row) => row.id === earlier.id).deleted_at).toBeTruthy();
});
test("revert creates a new version and journal entry rather than overwriting history", async () => {
  const d = await department(),
    p = await product(d.id);
  const edited = await saveProduct(pool, owner, shop, p.id, {
    ...p.data,
    name: "Changed name",
    priceMinor: "8500",
    version: p.version,
  });
  const entry = (
    await pool.query(
      "SELECT id FROM catalogue_history WHERE entity_id=$1 AND action='updated' ORDER BY created_at DESC LIMIT 1",
      [p.id],
    )
  ).rows[0];
  const reverted = await catalogueHistoryAction(pool, owner, shop, {
    action: "revert",
    historyId: entry.id,
    version: edited.version,
    confirm: true,
  });
  expect(reverted.version).toBe(edited.version + 1);
  expect(
    (await pool.query("SELECT name,price_minor FROM products WHERE id=$1", [p.id])).rows[0],
  ).toEqual({ name: p.data.name, price_minor: "5000" });
  expect(
    (
      await pool.query(
        "SELECT action FROM catalogue_history WHERE entity_id=$1 ORDER BY created_at DESC LIMIT 1",
        [p.id],
      )
    ).rows[0].action,
  ).toBe("reverted");
  await expect(
    catalogueHistoryAction(pool, owner, shop, {
      action: "revert",
      historyId: entry.id,
      version: edited.version,
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "stale_version" });
});
test("restore fails atomically if a department name was reused while it was deleted", async () => {
  const d = await department(),
    p = await product(d.id),
    deleted = await deleteCatalogueItem(pool, owner, shop, "department", d.id, {
      version: d.version,
      confirm: true,
    });
  await saveDepartment(pool, owner, shop, null, { ...depValue(d.data.name) });
  await expect(
    catalogueHistoryAction(pool, owner, shop, {
      action: "restore",
      kind: "department",
      id: d.id,
      version: deleted.version,
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "department_name_in_use" });
  expect(
    (await pool.query("SELECT deleted_at FROM products WHERE id=$1", [p.id])).rows[0].deleted_at,
  ).toBeTruthy();
});
test("department restore rolls back completely when a product photo is unavailable", async () => {
  const d = await department(),
    p = await product(d.id),
    asset = randomUUID();
  await pool.query(
    "INSERT INTO media_assets(id,shop_id,merchant_id,state,storage_key,alt) VALUES($1,$2,$3,'ready',$1::uuid::text,'Fictional recovery photo')",
    [asset, shop, seedIds.merchantA],
  );
  const attached = await saveProduct(pool, owner, shop, p.id, {
    ...p.data,
    mediaId: asset,
    version: p.version,
  });
  const removed = await deleteCatalogueItem(pool, owner, shop, "department", d.id, {
    version: d.version,
    confirm: true,
  });
  await pool.query("UPDATE media_assets SET state='failed' WHERE id=$1", [asset]);
  await expect(
    catalogueHistoryAction(pool, owner, shop, {
      action: "restore",
      kind: "department",
      id: d.id,
      version: removed.version,
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "recovery_image_unavailable" });
  expect(
    (await pool.query("SELECT deleted_at FROM departments WHERE id=$1", [d.id])).rows[0].deleted_at,
  ).toBeTruthy();
  expect(
    (await pool.query("SELECT version,deleted_at FROM products WHERE id=$1", [p.id])).rows[0],
  ).toMatchObject({ version: attached.version + 1, deleted_at: expect.any(Date) });
});
test("restoring a department recovers its entire batch beyond the first page of deleted items", async () => {
  const d = await department();
  await pool.query(
    "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,availability) SELECT gen_random_uuid(),$1,$2,$3,'product','Batch item '||n,'batch-item-'||n,'UGX','available' FROM generate_series(1,25) n",
    [shop, seedIds.merchantA, d.id],
  );
  const removed = await deleteCatalogueItem(pool, owner, shop, "department", d.id, {
    version: d.version,
    confirm: true,
  });
  const first = await readCatalogueHistory(pool, owner, shop),
    next = await readCatalogueHistory(pool, owner, shop, 20, 20);
  expect(first.deleted).toHaveLength(20);
  expect(first.hasMoreDeleted).toBe(true);
  expect(next.deleted.length).toBeGreaterThan(0);
  expect(first.deleted.some((a) => next.deleted.some((b) => a.id === b.id))).toBe(false);
  const restored = await catalogueHistoryAction(pool, owner, shop, {
    action: "restore",
    kind: "department",
    id: d.id,
    version: removed.version,
    confirm: true,
  });
  expect(restored).toMatchObject({ affected: 26 });
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM products WHERE department_id=$1 AND deleted_at IS NULL AND availability='available'",
        [d.id],
      )
    ).rows[0].n,
  ).toBe(25);
});
test("foreign catalogue access cannot read, delete, restore or revert another shops records", async () => {
  const d = await department(),
    p = await product(d.id),
    entry = (
      await pool.query("SELECT id FROM catalogue_history WHERE entity_id=$1 LIMIT 1", [p.id])
    ).rows[0];
  for (const work of [
    () => readCatalogueHistory(pool, foreign, shop),
    () =>
      deleteCatalogueItem(pool, foreign, shop, "product", p.id, {
        version: p.version,
        confirm: true,
      }),
    () =>
      catalogueHistoryAction(pool, foreign, shop, {
        action: "restore",
        kind: "product",
        id: p.id,
        version: p.version,
        confirm: true,
      }),
    () =>
      catalogueHistoryAction(pool, foreign, shop, {
        action: "revert",
        historyId: entry.id,
        version: p.version,
        confirm: true,
      }),
  ])
    await expect(work()).rejects.toMatchObject({ status: 404 });
  // Even an owner using their own authorized shop URL cannot substitute IDs
  // from another shop in deletion, recovery or history commands.
  const other = await saveDepartment(
      pool,
      foreign,
      seedIds.shopB,
      null,
      depValue(`Other ${randomUUID()}`),
    ),
    otherEntry = (
      await pool.query("SELECT id FROM catalogue_history WHERE entity_id=$1 LIMIT 1", [other.id])
    ).rows[0];
  for (const work of [
    () =>
      deleteCatalogueItem(pool, owner, shop, "department", other.id, {
        version: other.version,
        confirm: true,
      }),
    () =>
      catalogueHistoryAction(pool, owner, shop, {
        action: "restore",
        kind: "department",
        id: other.id,
        version: other.version,
        confirm: true,
      }),
    () =>
      catalogueHistoryAction(pool, owner, shop, {
        action: "revert",
        historyId: otherEntry.id,
        version: other.version,
        confirm: true,
      }),
  ])
    await expect(work()).rejects.toMatchObject({ status: 404 });
});
test("recovery deadline is enforced even before the maintenance worker runs", async () => {
  const d = await department(),
    p = await product(d.id),
    removed = await deleteCatalogueItem(pool, owner, shop, "product", p.id, {
      version: p.version,
      confirm: true,
    });
  await pool.query(
    "UPDATE products SET deleted_at=clock_timestamp()-interval '31 days' WHERE id=$1",
    [p.id],
  );
  await expect(
    catalogueHistoryAction(pool, owner, shop, {
      action: "restore",
      kind: "product",
      id: p.id,
      version: removed.version,
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "recovery_expired" });
  expect(
    (await readCatalogueHistory(pool, owner, shop)).deleted.some((row) => row.id === p.id),
  ).toBe(false);
});
test("history is immutable while retained and expired snapshots cannot be reverted", async () => {
  const d = await department(),
    p = await product(d.id),
    entry = (await pool.query("SELECT * FROM catalogue_history WHERE entity_id=$1 LIMIT 1", [p.id]))
      .rows[0];
  await expect(
    pool.query("UPDATE catalogue_history SET action='updated' WHERE id=$1", [entry.id]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    pool.query("DELETE FROM catalogue_history WHERE id=$1", [entry.id]),
  ).rejects.toMatchObject({ code: "23514" });
  const expired = randomUUID();
  await pool.query(
    "INSERT INTO catalogue_history(id,shop_id,merchant_id,entity_kind,entity_id,action,before_state,after_state,created_at,expires_at) VALUES($1,$2,$3,'product',$4,'updated',$5,$5,clock_timestamp()-interval '31 days',clock_timestamp()-interval '1 day')",
    [expired, shop, seedIds.merchantA, p.id, entry.after_state],
  );
  await expect(
    catalogueHistoryAction(pool, owner, shop, {
      action: "revert",
      historyId: expired,
      version: p.version,
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "recovery_unavailable" });
  await transaction(pool, cleanupCatalogueHistory);
  expect(
    (await pool.query("SELECT id FROM catalogue_history WHERE id=$1", [expired])).rowCount,
  ).toBe(0);
});
test("expired deletion cleanup scrubs details while retaining referenced identities", async () => {
  const d = await department(),
    p = await product(d.id);
  await pool.query(
    "UPDATE products SET availability='archived',deleted_at=clock_timestamp()-interval '31 days',deletion_batch=$2 WHERE id=$1",
    [p.id, randomUUID()],
  );
  await pool.query(
    "INSERT INTO guest_requests(id,shop_id,merchant_id,product_id,request_key,fingerprint,kind,name,reply_to,message) VALUES($1,$2,$3,$4,$5,$6,'enquiry','Fictional customer','fictional@example.invalid','Keep enquiry reference')",
    [randomUUID(), shop, seedIds.merchantA, p.id, randomUUID(), "a".repeat(64)],
  );
  await transaction(pool, cleanupCatalogueHistory);
  expect(
    (
      await pool.query("SELECT name,description,price_minor,purged_at FROM products WHERE id=$1", [
        p.id,
      ])
    ).rows[0],
  ).toMatchObject({
    name: "Deleted product",
    description: "",
    price_minor: null,
    purged_at: expect.any(Date),
  });
  expect(
    (await pool.query("SELECT product_id FROM guest_requests WHERE product_id=$1", [p.id]))
      .rowCount,
  ).toBe(1);
});
