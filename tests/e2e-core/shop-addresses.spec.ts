import { test, expect } from "./fixture";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds } from "../../src/server/db/seed";

const id = "68a40e06-65f8-4e07-a5d5-61c7ed87d799";
const old = `nguzza-agricultural-suppliers-${id}`,
  clean = "nguzza-agricultural-suppliers";
const origin = "http://127.0.0.1:3101";

test("legacy UUID shop URL becomes a clean canonical address with permanent aliases, unique owner edits and unchanged publication gates", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw new Error("Disposable database required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const merchant = randomUUID(),
    other = randomUUID();
  const account = {
    email: `address-owner-${randomUUID()}@londos.invalid`,
    password: `Fictional-${randomUUID()}`,
  };
  const root = `/api/workspace/shops/${id}`;
  try {
    const created = await createAuth(pool, coreConfig(), true).api.signUpEmail({
      body: { ...account, name: "Address fixture owner" },
    });
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Address fixture merchant')", [
      merchant,
    ]);
    await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
      merchant,
      created.user.id,
    ]);
    for (const [shop, name, slug] of [
      [id, "Nguzza Agricultural Suppliers", old],
      [other, "Reserved fixture", "another-supplier"],
    ]) {
      await pool.query(
        "INSERT INTO shops(id,merchant_id,mall_id,name,slug) VALUES($1,$2,$3,$4,$5)",
        [shop, merchant, seedIds.mallA, name, slug],
      );
      await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [
        shop,
      ]);
      await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [shop]);
      await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [shop]);
    }
    await page.goto("/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    const saved = await page.request.put(`${root}/design`, {
      headers: { origin },
      data: {
        version: 0,
        summary: "Address fixture design",
        specification: {
          schemaVersion: 1,
          theme: "earth",
          announcement: "",
          spaces: [],
          actions: [],
        },
      },
    });
    expect(saved.status()).toBe(200);
    expect(
      (
        await page.request.post(`${root}/design/publish`, {
          headers: { origin },
          data: { ...(await saved.json()), confirm: true, photosReviewed: true },
        })
      ).status(),
    ).toBe(200);
    // Recreate an existing-deployment row, then exercise the same idempotent
    // data migration that Render's guarded startup migrator will apply once.
    await pool.query(await readFile("migrations/036_clean_legacy_shop_addresses.sql", "utf8"));
    const redirect = await request.get(`/shops/${old}`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(308);
    expect(new URL(redirect.headers().location!, origin).pathname).toBe(`/shops/${clean}`);
    expect((await request.get(`/shops/${clean}`)).status()).toBe(200);
    await page.goto(`/shops/${old}`);
    await expect(page).toHaveURL(`${origin}/shops/${clean}`);
    await expect(
      page.getByRole("heading", { name: "Nguzza Agricultural Suppliers", exact: true }),
    ).toBeVisible();
    await page.goto(`/shopkeeper/shops/${id}/address`);
    const address = page.getByLabel("Shop address (the part after /shops/)", { exact: true });
    await expect(address).toHaveValue(clean);
    await address.fill("another-supplier");
    await page
      .getByLabel("Reason for changing the address")
      .fill("Choose a readable public address");
    await page.getByRole("checkbox", { name: "I confirm this shop address change" }).check();
    await page.getByRole("button", { name: "Save shop address", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("already reserved");
    await address.fill("nguzza-agricultural-suppliers-mbale");
    await page.getByRole("button", { name: "Save shop address", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Shop address saved");
    const current = await (await page.request.get(root)).json();
    expect(
      (
        await page.request.post(`${root}/address`, {
          headers: { origin },
          data: {
            slug: old,
            version: current.version,
            reason: "ID suffix must not return",
            confirm: true,
          },
        })
      ).status(),
    ).toBe(422);
    for (const alias of [old, clean]) {
      const response = await request.get(`/shops/${alias}`, { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      expect(new URL(response.headers().location!, origin).pathname).toBe(
        "/shops/nguzza-agricultural-suppliers-mbale",
      );
    }
    const design = await (await page.request.get(`${root}/design`)).json();
    expect(
      (
        await page.request.post(`${root}/design/unpublish`, {
          headers: { origin },
          data: { version: design.version, confirm: true },
        })
      ).status(),
    ).toBe(200);
    for (const alias of [old, clean, "nguzza-agricultural-suppliers-mbale"])
      expect((await request.get(`/shops/${alias}`, { maxRedirects: 0 })).status()).toBe(404);
  } finally {
    await pool.end();
  }
});
