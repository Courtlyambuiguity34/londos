import { afterAll, beforeAll, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { migrate } from "../../src/server/db/migrate";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { transaction } from "../../src/server/db/pool";
import { availableShopAddress } from "../../src/server/shop-address";

const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL, max: 1 });
const name = `londos_test_${randomUUID().replaceAll("-", "")}`;
const reported = "68a40e06-65f8-4e07-a5d5-61c7ed87d799",
  mall = randomUUID(),
  merchant = randomUUID();
const duplicateA = randomUUID(),
  duplicateB = randomUUID(),
  reserved = randomUUID(),
  blocked = randomUUID();
let pool: Pool, before: unknown, checksums: unknown;
const migrationPath = "migrations/036_clean_legacy_shop_addresses.sql";
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  pool = new Pool({ connectionString: url.href, max: 3 });
  await migrate(pool, undefined, "035_production_rent_reversals.sql");
  checksums = (await pool.query("SELECT name,checksum FROM schema_migrations ORDER BY name")).rows;
  await pool.query("INSERT INTO malls(id,name) VALUES($1,'Address fixture mall')", [mall]);
  await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Address fixture merchant')", [
    merchant,
  ]);
  for (const [id, slug, created] of [
    [reported, `nguzza-agricultural-suppliers-${reported}`, "2000-01-01"],
    [reserved, "taken-shop", "2000-01-01"],
    [blocked, `taken-shop-${blocked}`, "2000-01-02"],
    [duplicateA, `same-name-${duplicateA}`, "2000-01-01"],
    [duplicateB, `same-name-${duplicateB}`, "2000-01-02"],
    [randomUUID(), "studio-54", "2000-01-01"],
  ])
    await pool.query(
      "INSERT INTO shops(id,merchant_id,mall_id,name,slug,version,created_at) VALUES($1,$2,$3,'Address fixture',$4,7,$5)",
      [id, merchant, mall, slug, created],
    );
  await pool.query("UPDATE shops SET slug='taken-shop-current' WHERE id=$1", [reserved]);
  before = (
    await pool.query(
      "SELECT id,to_jsonb(s)-'slug'-'version'-'updated_at' AS data FROM shops s ORDER BY id",
    )
  ).rows;
});
afterAll(async () => {
  await pool?.end();
  await parent.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await parent.end();
});

test("migration removes the reported UUID suffix, retains old aliases and preserves other shop data and applied checksums", async () => {
  await migrate(pool);
  expect(
    (await pool.query("SELECT slug,version FROM shops WHERE id=$1", [reported])).rows[0],
  ).toEqual({ slug: "nguzza-agricultural-suppliers", version: 8 });
  expect(
    (
      await pool.query("SELECT slug FROM shop_addresses WHERE shop_id=$1 ORDER BY slug", [reported])
    ).rows.map((r) => r.slug),
  ).toEqual(["nguzza-agricultural-suppliers", `nguzza-agricultural-suppliers-${reported}`]);
  expect(
    (
      await pool.query(
        "SELECT id,to_jsonb(s)-'slug'-'version'-'updated_at' AS data FROM shops s ORDER BY id",
      )
    ).rows,
  ).toEqual(before);
  expect(
    (await pool.query("SELECT name,checksum FROM schema_migrations WHERE name<'036' ORDER BY name"))
      .rows,
  ).toEqual(checksums);
  expect(
    (
      await pool.query(
        "SELECT details FROM audit_events WHERE action='shop.address.cleaned' AND resource_id=$1",
        [reported],
      )
    ).rows[0].details,
  ).toMatchObject({
    from: `nguzza-agricultural-suppliers-${reported}`,
    to: "nguzza-agricultural-suppliers",
    migration: "036",
  });
});

test("cleanup never steals another shop's current or former address and never assigns duplicate or numeric fallback URLs", async () => {
  expect((await pool.query("SELECT slug FROM shops WHERE id=$1", [reserved])).rows[0].slug).toBe(
    "taken-shop-current",
  );
  expect((await pool.query("SELECT slug FROM shops WHERE id=$1", [blocked])).rows[0].slug).toBe(
    `taken-shop-${blocked}`,
  );
  expect((await pool.query("SELECT slug FROM shops WHERE id=$1", [duplicateA])).rows[0].slug).toBe(
    "same-name",
  );
  expect((await pool.query("SELECT slug FROM shops WHERE id=$1", [duplicateB])).rows[0].slug).toBe(
    `same-name-${duplicateB}`,
  );
  expect((await pool.query("SELECT 1 FROM shops WHERE slug='same-name-2'")).rowCount).toBe(0);
  expect((await pool.query("SELECT 1 FROM shops WHERE slug='studio-54'")).rowCount).toBe(1);
  await expect(
    pool.query("UPDATE shops SET slug='taken-shop' WHERE id=$1", [blocked]),
  ).rejects.toMatchObject({ code: "23505" });
  await expect(
    pool.query("UPDATE shops SET slug='same-name' WHERE id=$1", [blocked]),
  ).rejects.toMatchObject({ code: "23505" });
});

test("migration and cleanup reruns are idempotent; allocation accepts explicit unique words and refuses reserved aliases", async () => {
  const rows = (await pool.query("SELECT id,slug,version FROM shops ORDER BY id")).rows;
  const count = (
    await pool.query(
      "SELECT count(*)::int AS n FROM audit_events WHERE action='shop.address.cleaned'",
    )
  ).rows[0].n;
  await migrate(pool);
  await pool.query(await readFile(migrationPath, "utf8"));
  expect((await pool.query("SELECT id,slug,version FROM shops ORDER BY id")).rows).toEqual(rows);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_events WHERE action='shop.address.cleaned'",
      )
    ).rows[0].n,
  ).toBe(count);
  await expect(
    transaction(pool, (db) => availableShopAddress(db, "Taken Shop")),
  ).rejects.toMatchObject({ code: "address_unavailable" });
  expect(
    await transaction(pool, (db) => availableShopAddress(db, "Taken Shop", "taken-shop-mbale")),
  ).toBe("taken-shop-mbale");
});
