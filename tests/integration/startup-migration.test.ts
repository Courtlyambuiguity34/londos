import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, symlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { test, expect } from "vitest";
import { migrate } from "../../src/server/db/migrate";
import { requireDevelopmentDatabase } from "../../src/server/db/development";

test("release web entry upgrades pre-024 data before real bootstrap and preserves it on restart", async () => {
  const parent = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const name = `londos_test_${randomUUID().replaceAll("-", "")}`;
  const directory = await mkdtemp(join(tmpdir(), "londos-startup-migration-"));
  let pool: Pool | undefined;
  let created = false;
  try {
    await requireDevelopmentDatabase(parent);
    await parent.query(`CREATE DATABASE ${name}`);
    created = true;
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = `/${name}`;
    pool = new Pool({ connectionString: url.href, max: 1 });
    // Include every earlier migration, but deliberately omit 024.
    await migrate(pool, resolve("migrations"), "023_zzzz.sql");
    expect(
      (await pool.query("SELECT to_regclass('public.bootstrap_accounts') AS name")).rows[0].name,
    ).toBeNull();
    const existingId = randomUUID();
    await pool.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,false)', [
      existingId,
      "Existing customer",
      "existing-startup@londos.invalid",
    ]);
    const shop = randomUUID(),
      merchant = randomUUID(),
      mall = randomUUID();
    const oldAddress = `startup-supplier-${shop}`;
    await pool.query("INSERT INTO malls(id,name) VALUES($1,'Startup mall')", [mall]);
    await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Startup supplier')", [merchant]);
    await pool.query(
      "INSERT INTO shops(id,merchant_id,mall_id,name,slug) VALUES($1,$2,$3,'Startup supplier',$4)",
      [shop, merchant, mall, oldAddress],
    );
    await symlink(resolve("dist"), join(directory, "dist"), "junction");
    await symlink(resolve("migrations"), join(directory, "migrations"), "junction");
    await writeFile(join(directory, "server.js"), "console.log('WEB_REACHED');");
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !key.startsWith("LONDOS_BOOTSTRAP_") &&
          !["DATABASE_URL_FILE", "LONDOS_RUNTIME_PASSWORDS_FILE"].includes(key),
      ),
    );
    const run = () =>
      promisify(execFile)(process.execPath, [resolve("scripts/release-entry.mjs"), "web"], {
        cwd: directory,
        env: {
          ...env,
          NODE_ENV: process.env.NODE_ENV,
          DATABASE_URL: url.href,
          LONDOS_MIGRATE_ON_START: "true",
          LONDOS_BOOTSTRAP_ADMIN_NAME: "Startup owner",
          LONDOS_BOOTSTRAP_ADMIN_EMAIL: "startup-owner@londos.invalid",
          LONDOS_BOOTSTRAP_ADMIN_PASSWORD: "Unique-fixture-password-for-startup-only",
        },
      });
    const first = await run();
    expect(first.stdout).toContain('"event":"release.migration","result":"passed"');
    expect(first.stdout).toContain('"event":"bootstrap.complete","created":1');
    expect(first.stdout).toContain("WEB_REACHED");
    expect(
      (await pool.query("SELECT slug,version FROM shops WHERE id=$1", [shop])).rows[0],
    ).toEqual({ slug: "startup-supplier", version: 2 });
    expect(
      (
        await pool.query("SELECT 1 FROM shop_addresses WHERE slug=$1 AND shop_id=$2", [
          oldAddress,
          shop,
        ])
      ).rowCount,
    ).toBe(1);
    const cleanup = (
      await pool.query(
        "SELECT checksum,applied_at FROM schema_migrations WHERE name='036_clean_legacy_shop_addresses.sql'",
      )
    ).rows[0];
    expect(cleanup).toBeDefined();
    const migration = (
      await pool.query("SELECT checksum,applied_at FROM schema_migrations WHERE name=$1", [
        "024_hosted_accounts_and_privacy.sql",
      ])
    ).rows[0];
    expect(migration).toBeDefined();
    const second = await run();
    expect(second.stdout).toContain('"created":0');
    expect(second.stdout).toContain("WEB_REACHED");
    expect(
      (await pool.query("SELECT slug,version FROM shops WHERE id=$1", [shop])).rows[0],
    ).toEqual({ slug: "startup-supplier", version: 2 });
    expect(
      (
        await pool.query(
          "SELECT checksum,applied_at FROM schema_migrations WHERE name='036_clean_legacy_shop_addresses.sql'",
        )
      ).rows[0],
    ).toEqual(cleanup);
    expect(
      (
        await pool.query("SELECT checksum,applied_at FROM schema_migrations WHERE name=$1", [
          "024_hosted_accounts_and_privacy.sql",
        ])
      ).rows[0],
    ).toEqual(migration);
    expect(
      (await pool.query('SELECT name FROM "user" WHERE id=$1', [existingId])).rows[0].name,
    ).toBe("Existing customer");
    expect((await pool.query("SELECT 1 FROM bootstrap_accounts")).rowCount).toBe(1);
    for (const output of [first.stdout, first.stderr, second.stdout, second.stderr]) {
      expect(output).not.toContain(url.href);
      expect(output).not.toContain("Unique-fixture-password-for-startup-only");
    }
  } finally {
    await pool?.end();
    if (created) await parent.query(`DROP DATABASE ${name}`);
    await parent.end();
    await rm(directory, { recursive: true, force: true });
  }
});
