import { test, expect, type Page } from "./fixture";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds } from "../../src/server/db/seed";
import { availableShopAddress } from "../../src/server/shop-address";
import { transaction } from "../../src/server/db/pool";
import { readFile, mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import type { SeedAccounts } from "../../src/server/db/seed";

const origin = "http://127.0.0.1:3101";

async function ownShop(page: Page) {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw new Error("Disposable browser database required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const shop = randomUUID(),
    merchant = randomUUID();
  const account = {
    email: `catalogue-feedback-${randomUUID()}@londos.invalid`,
    password: `Fictional-${randomUUID()}`,
  };
  try {
    const created = await createAuth(pool, coreConfig(), true).api.signUpEmail({
      body: { ...account, name: "Fictional catalogue owner" },
    });
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Fictional catalogue merchant')", [
      merchant,
    ]);
    await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
      merchant,
      created.user.id,
    ]);
    let slug = "";
    await transaction(pool, async (client) => {
      // Each fictional same-name shop deliberately chooses distinct words;
      // tests must respect the production address reservation rule.
      const count = (
        await client.query(
          "SELECT count(*)::int AS n FROM shops WHERE name='Fictional catalogue shop'",
        )
      ).rows[0].n;
      const choices = [
        "central",
        "north",
        "south",
        "east",
        "west",
        "riverside",
        "hillside",
        "lakeside",
      ];
      slug = await availableShopAddress(
        client,
        "Fictional catalogue shop",
        `fictional-catalogue-${choices[count] ?? `district-${String.fromCharCode(97 + count)}`}`,
      );
      await client.query(
        "INSERT INTO shops(id,merchant_id,mall_id,name,slug) SELECT $1,$2,mall_id,'Fictional catalogue shop',$3 FROM shops WHERE id=$4",
        [shop, merchant, slug, seedIds.shopA],
      );
    });
    await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [
      shop,
    ]);
    await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [shop]);
    await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [shop]);
    await page.goto("/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    return { pool, shop, slug, root: `/api/workspace/shops/${shop}` };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

async function createDepartment(page: Page, name: string, slug: string) {
  await page.getByRole("tab", { name: /^Departments/ }).click();
  await page.getByLabel("Department name", { exact: true }).fill(name);
  const options = page.locator(".merchant-department-options");
  if ((await options.getAttribute("open")) === null) await options.locator("summary").click();
  await page.getByLabel("Department address", { exact: true }).fill(slug);
  const submission = page.waitForResponse(
    (response) => response.url().endsWith("/departments") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create department", exact: true }).click();
  return submission;
}

async function createProduct(page: Page, name: string, slug: string) {
  await page.getByRole("tab", { name: /^Products/ }).click();
  await page.getByLabel("Product or service name", { exact: true }).fill(name);
  const options = page.locator(".merchant-product-options");
  if ((await options.getAttribute("open")) === null) await options.locator("summary").click();
  await page.getByLabel("Product address", { exact: true }).fill(slug);
  await page.getByLabel("Price", { exact: false }).fill("5000");
  const submission = page.waitForResponse(
    (response) => response.url().endsWith("/products") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create product or service", exact: true }).click();
  return submission;
}

test("archived departments explain the empty selector, activation connects it, and names stay unique", async ({
  page,
}) => {
  test.setTimeout(60000);
  const fixture = await ownShop(page);
  try {
    await page.goto(`/shopkeeper/shops/${fixture.shop}/catalogue`);
    const rows = [];
    for (const name of ["Crops", "Seeds"]) {
      const response = await createDepartment(page, name, name.toLowerCase()),
        row = await response.json();
      expect(response.status()).toBe(200);
      rows.push(row);
      expect(
        (
          await page.request.patch(`${fixture.root}/departments/${row.id}`, {
            headers: { origin },
            data: {
              name,
              slug: name.toLowerCase(),
              position: rows.length,
              archived: true,
              version: row.version,
            },
          })
        ).status(),
      ).toBe(200);
    }
    await page.getByRole("button", { name: "Reload catalogue", exact: true }).click();
    await page.getByRole("tab", { name: /^Products/ }).click();
    await expect(
      page.getByRole("button", { name: "Create your first department", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "View archived departments", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Department", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Department", { exact: true }).locator("option")).toHaveText([
      "No active departments — activate one first",
    ]);
    await page.getByRole("button", { name: "View archived departments", exact: true }).click();
    await page.getByRole("button", { name: "Activate Crops", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Department activated.");
    await page.getByRole("button", { name: "Activate Seeds", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Department activated.");
    await page.getByRole("button", { name: "Open full editor for Crops", exact: true }).click();
    const select = page.getByLabel("Department", { exact: true });
    await expect(select.locator("option")).toHaveText([
      "Choose an active department",
      "Crops",
      "Seeds",
    ]);
    await select.selectOption({ label: "Seeds" });
    await expect(select).toHaveValue(rows[1]!.id);
    await select.selectOption({ label: "Crops" });
    await expect(select).toHaveValue(rows[0]!.id);
    await page.getByLabel("Product or service name", { exact: true }).fill("Connected maize");
    await page.getByRole("button", { name: "Create product or service", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Product or service saved.");
    expect(
      (await (await page.request.get(`${fixture.root}/catalogue`)).json()).products[0]
        .department_id,
    ).toBe(rows[0]!.id);
    const duplicate = await createDepartment(page, " crops ", "another-crops");
    expect(duplicate.status()).toBe(409);
    await expect(page.getByRole("status")).toContainText(
      "A department with this name already exists",
    );
  } finally {
    await fixture.pool.end();
  }
});

test("owners confirm deletion, recover a department and its products, and revert edits from history", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const fixture = await ownShop(page),
    history = `${fixture.root}/catalogue/history`;
  try {
    await page.goto(`/shopkeeper/shops/${fixture.shop}/catalogue`);
    const departmentResponse = await createDepartment(page, "Crops", "crops"),
      department = await departmentResponse.json();
    expect((await createProduct(page, "Maize recovery", "maize-recovery")).status()).toBe(200);
    await page.getByRole("button", { name: "Edit Maize recovery", exact: true }).click();
    await page.getByLabel("Price (optional)", { exact: true }).fill("7500");
    await page.getByRole("button", { name: "Save product or service", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Product or service saved.");
    await page.getByRole("tab", { name: /^History & deleted items/ }).click();
    // Details hide buttons until expanded, so select the known edited record.
    const edited = page
      .locator(".catalogue-history-entry")
      .filter({ has: page.locator("summary", { hasText: "Edited" }) })
      .first();
    await edited.locator("summary").click();
    await expect(edited).toContainText("7,500");
    await expect(edited).toContainText("5,000");
    page.once("dialog", (dialog) => dialog.accept());
    await edited.getByRole("button", { name: "Revert this change", exact: true }).click();
    await expect(page.locator(".catalogue-history-message")).toContainText(
      "Previous values restored",
    );
    expect(
      (await (await page.request.get(`${fixture.root}/catalogue`)).json()).products[0].price_minor,
    ).toBe("5000");
    await page.getByRole("tab", { name: /^Products/ }).click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Delete Maize recovery", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Edit Maize recovery", exact: true }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete Maize recovery", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Product moved to Deleted items");
    await page.getByRole("tab", { name: /^History & deleted items/ }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Restore Maize recovery", exact: true }).click();
    await expect(page.locator(".catalogue-history-message")).toContainText("Restored.");
    await page.getByRole("tab", { name: /^Departments/ }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete Crops", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Department and its products moved");
    await page.getByRole("tab", { name: /^History & deleted items/ }).click();
    await expect(page.getByRole("button", { name: "Restore Crops", exact: true })).toBeVisible();
    const snapshot = await (await page.request.get(history)).json();
    await expect(
      page.getByRole("button", { name: "Restore Maize recovery", exact: true }),
    ).toBeVisible();
    expect((await request.get(history)).status()).toBe(401);
    expect(
      (
        await request.delete(`${fixture.root}/departments/${department.id}`, {
          headers: { origin },
          data: { version: 1, confirm: true },
        })
      ).status(),
    ).toBe(401);
    await mkdir("docs/evidence/images", { recursive: true });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
          .violations,
      ).toEqual([]);
      if (width !== 320)
        await page.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
          window.scrollTo(0, 0);
        });
      if (width !== 320)
        await page.screenshot({
          path: `docs/evidence/images/catalogue-recovery-${width}-2026-10-27.png`,
          fullPage: true,
        });
    }
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Restore Crops", exact: true }).click();
    await expect(page.locator(".catalogue-history-message")).toContainText("Restored.");
    const current = await (await page.request.get(`${fixture.root}/catalogue`)).json();
    expect(current.departments).toHaveLength(1);
    expect(current.products).toHaveLength(1);
    expect(current.products[0]).toMatchObject({
      department_id: department.id,
      price_minor: "5000",
      availability: "available",
    });
    // A stale replay cannot restore the same batch twice.
    const deleted = snapshot.deleted.find((row: { kind: string }) => row.kind === "department");
    expect(
      (
        await page.request.post(history, {
          headers: { origin },
          data: {
            action: "restore",
            kind: "department",
            id: deleted.id,
            version: deleted.version,
            confirm: true,
          },
        })
      ).status(),
    ).toBe(409);
  } finally {
    await fixture.pool.end();
  }
});

test("a merchant publishes connected department and product pages, then deletes and restores their public visibility", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const fixture = await ownShop(page),
    base = `/shopkeeper/shops/${fixture.shop}`;
  try {
    await page.goto(`${base}/catalogue`);
    await page.getByRole("button", { name: "Add a department", exact: true }).click();
    await page.getByLabel("Department name", { exact: true }).fill("Crops");
    await expect(page.getByLabel("Department address", { exact: true })).toHaveValue("");
    await page.getByRole("button", { name: "Create department", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Department saved.");
    await expect(page.getByText(/position 0/)).toHaveCount(0);
    await page.getByRole("button", { name: "Open full editor for Crops", exact: true }).click();
    await expect(page.getByLabel("Product or service name", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Department", { exact: true })).toHaveValue(
      (await (await page.request.get(`${fixture.root}/catalogue`)).json()).departments[0].id,
    );
    await page.getByLabel("Product or service name", { exact: true }).fill("Maize seed");
    await page.getByLabel("Currency", { exact: true }).selectOption("USD");
    await page.getByLabel("Price (optional)", { exact: true }).fill("19.95");
    await page.getByRole("button", { name: "Upload a product photo", exact: true }).click();
    await expect(page.getByRole("tabpanel", { name: "Shop images", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /^Products/ }).click();
    await expect(page.getByLabel("Product or service name", { exact: true })).toHaveValue(
      "Maize seed",
    );
    await expect(page.getByLabel("Price (optional)", { exact: true })).toHaveValue("19.95");
    await page.getByRole("button", { name: "Create product or service", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Product or service saved.");
    const catalogue = await (await page.request.get(`${fixture.root}/catalogue`)).json();
    expect(catalogue.departments[0].slug).toBe("crops");
    expect(catalogue.products[0]).toMatchObject({
      slug: "maize-seed",
      currency: "USD",
      price_minor: "1995",
      department_id: catalogue.departments[0].id,
    });
    await page.getByRole("button", { name: "Edit Maize seed", exact: true }).click();
    await expect(page.getByLabel("Price (optional)", { exact: true })).toHaveValue("19.95");
    await page
      .getByLabel("Description", { exact: true })
      .fill("Keep this description while adding a photo.");
    await page.getByRole("button", { name: "Upload a product photo", exact: true }).click();
    await page.getByLabel("Image file", { exact: true }).setInputFiles({
      name: "fictional-seed.png",
      mimeType: "image/png",
      buffer: await sharp({ create: { width: 64, height: 48, channels: 3, background: "#497044" } })
        .png()
        .toBuffer(),
    });
    await page.getByLabel("Image description", { exact: true }).fill("Fictional seed photo");
    await page.getByRole("button", { name: "Upload image", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Image uploaded. Processing will appear below.",
    );
    await page.getByRole("tab", { name: /^Products/ }).click();
    await expect(page.getByLabel("Product or service name", { exact: true })).toHaveValue(
      "Maize seed",
    );
    await expect(page.getByLabel("Price (optional)", { exact: true })).toHaveValue("19.95");
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
      "Keep this description while adding a photo.",
    );
    await mkdir("docs/evidence/images", { recursive: true });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
          .violations,
      ).toEqual([]);
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      if (width !== 320)
        await page.screenshot({
          path: `docs/evidence/images/merchant-clarity-products-${width}-2026-10-27.png`,
          fullPage: true,
        });
    }
    await page.getByRole("button", { name: "Save product or service", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Product or service saved.");
    expect(
      (await (await page.request.get(`${fixture.root}/catalogue`)).json()).products[0].description,
    ).toBe("Keep this description while adding a photo.");
    await page.goto(`${base}/design#sections`);
    await expect(page.getByRole("status")).toHaveText("Design loaded.");
    await page.getByRole("tab", { name: /^Style/ }).click();
    await page.getByRole("button", { name: "Customise layout & colours", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Products per row on phones", exact: true })
      .selectOption({ label: "One large product per row" });
    await page
      .getByRole("combobox", { name: "Space between items", exact: true })
      .selectOption("airy");
    await page.getByRole("tab", { name: /^Sections/ }).click();
    await page.getByLabel("What would you like to add?", { exact: true }).selectOption("entrance");
    await page.getByLabel("New section title", { exact: true }).fill("Grown for your garden");
    await page
      .getByLabel("New section text", { exact: true })
      .fill("Browse our crop selection and contact us for details.");
    await page.getByRole("button", { name: "Add section", exact: true }).click();
    await page.getByLabel("What would you like to add?", { exact: true }).selectOption("contact");
    await page.getByRole("button", { name: "Add section", exact: true }).click();
    const departmentCard = page
      .locator(".editor-section-card")
      .filter({ has: page.locator("summary strong", { hasText: /^Crops$/ }) });
    await departmentCard.locator("summary").click();
    await departmentCard
      .getByLabel("Products shown here", { exact: true })
      .selectOption({ label: "Show up to 3 products" });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved.");
    expect(
      (await (await page.request.get(`${fixture.root}/design`)).json()).specification.presentation
        .productColumns.mobile,
    ).toBe(1);
    await expect(
      departmentCard.getByRole("link", { name: "Preview Crops page →", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: "docs/evidence/images/merchant-clarity-sections-320-2026-10-27.png",
      fullPage: true,
    });
    await departmentCard.getByRole("link", { name: "Preview Crops page →", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Crops");
    await page.getByRole("link", { name: "Maize seed", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Maize seed");
    expect(new URL(page.url()).searchParams.get("product")).toBe("maize-seed");
    await page.goto(`${base}/design#review`);
    await page
      .getByRole("checkbox", {
        name: "I reviewed this saved draft and confirm publication",
        exact: true,
      })
      .check();
    if (
      await page
        .getByRole("checkbox", {
          name: "I have reviewed the missing photos and want to publish this version anyway",
          exact: true,
        })
        .isVisible()
    )
      await page
        .getByRole("checkbox", {
          name: "I have reviewed the missing photos and want to publish this version anyway",
          exact: true,
        })
        .check();
    await page.getByRole("button", { name: "Publish reviewed draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Shop published.");
    await page.goto(`/shops/${fixture.slug}`);
    await expect(
      page.getByRole("heading", { name: "Grown for your garden", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Contact this shop", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "View all Crops", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/shops/${fixture.slug}/departments/crops$`));
    await page.getByRole("link", { name: "Maize seed", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/shops/${fixture.slug}/products/maize-seed$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Maize seed");
    const latest = await (await page.request.get(`${fixture.root}/catalogue`)).json(),
      item = latest.products[0],
      department = latest.departments[0],
      productUrl = `/shops/${fixture.slug}/products/maize-seed`,
      departmentUrl = `/shops/${fixture.slug}/departments/crops`;
    // Confirmation and accepted origin are enforced independently of the UI.
    expect(
      (
        await page.request.delete(`${fixture.root}/products/${item.id}`, {
          headers: { origin },
          data: { version: item.version },
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await page.request.delete(`${fixture.root}/products/${item.id}`, {
          headers: { origin: "https://foreign.example.invalid" },
          data: { version: item.version, confirm: true },
        })
      ).status(),
    ).toBe(403);
    const deletion = await page.request.delete(`${fixture.root}/products/${item.id}`, {
      headers: { origin },
      data: { version: item.version, confirm: true },
    });
    expect(deletion.status()).toBe(200);
    async function expectUnavailable(path: string) {
      // A missing item in an otherwise live shop uses its existing helpful
      // unavailable page (HTTP 200), with no product content and no indexing.
      const response = await request.get(path),
        html = await response.text();
      expect(html).toContain("This item has moved or is unavailable.");
      expect(html).toContain("noindex");
      expect(html).not.toContain("Maize seed");
    }
    await expectUnavailable(productUrl);
    expect(
      (
        await page.request.post(`${fixture.root}/catalogue/history`, {
          headers: { origin },
          data: {
            action: "restore",
            kind: "product",
            id: item.id,
            version: (await deletion.json()).version,
            confirm: true,
          },
        })
      ).status(),
    ).toBe(200);
    expect(await (await request.get(productUrl)).text()).toContain("Maize seed");
    const departmentDeletion = await page.request.delete(
      `${fixture.root}/departments/${department.id}`,
      { headers: { origin }, data: { version: department.version, confirm: true } },
    );
    expect(departmentDeletion.status()).toBe(200);
    await expectUnavailable(departmentUrl);
    await expectUnavailable(productUrl);
    expect(
      (
        await page.request.post(`${fixture.root}/catalogue/history`, {
          headers: { origin },
          data: {
            action: "restore",
            kind: "department",
            id: department.id,
            version: (await departmentDeletion.json()).version,
            confirm: true,
          },
        })
      ).status(),
    ).toBe(200);
    expect((await request.get(departmentUrl)).status()).toBe(200);
    expect(await (await request.get(productUrl)).text()).toContain("Maize seed");
  } finally {
    await fixture.pool.end();
  }
});

test("catalogue has one main heading; consecutive creates reset their forms while rejected writes preserve input", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const fixture = await ownShop(page);
  try {
    await page.goto(`/shopkeeper/shops/${fixture.shop}/catalogue`);
    await page.getByRole("tab", { name: /^Departments/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Products & contacts");
    await expect(
      page.getByRole("button", { name: "Create department", exact: true }),
    ).toBeEnabled();
    for (const [name, slug] of [
      ["First department", "first-department"],
      ["Second department", "second-department"],
    ]) {
      expect((await createDepartment(page, name!, slug!)).status()).toBe(200);
      await expect(page.getByRole("status")).toHaveText("Department saved.");
      await expect(page.getByLabel("Department name", { exact: true })).toHaveValue("");
      await expect(page.getByLabel("Department address", { exact: true })).toHaveValue("");
    }
    for (const [name, slug] of [
      ["First product", "first-product"],
      ["Second product", "second-product"],
    ]) {
      expect((await createProduct(page, name!, slug!)).status()).toBe(200);
      await expect(page.getByRole("status")).toHaveText("Product or service saved.");
      await expect(page.getByLabel("Product or service name", { exact: true })).toHaveValue("");
      await expect(page.getByLabel("Product address", { exact: true })).toHaveValue("");
      await expect(page.getByLabel("Price", { exact: false })).toHaveValue("");
    }
    expect(
      (await createDepartment(page, "Keep my department input", "first-department")).status(),
    ).toBe(409);
    await expect(page.getByRole("status")).toContainText("already used in this shop");
    await expect(page.getByLabel("Department name", { exact: true })).toHaveValue(
      "Keep my department input",
    );
    await expect(page.getByLabel("Department address", { exact: true })).toHaveValue(
      "first-department",
    );
    expect((await createProduct(page, "Keep my product input", "first-product")).status()).toBe(
      409,
    );
    await expect(page.getByRole("status")).toContainText("already used in this shop");
    await expect(page.getByLabel("Product or service name", { exact: true })).toHaveValue(
      "Keep my product input",
    );
    await expect(page.getByLabel("Product address", { exact: true })).toHaveValue("first-product");
    expect(
      (
        await fixture.pool.query("SELECT count(*)::int AS n FROM departments WHERE shop_id=$1", [
          fixture.shop,
        ])
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await fixture.pool.query("SELECT count(*)::int AS n FROM products WHERE shop_id=$1", [
          fixture.shop,
        ])
      ).rows[0].n,
    ).toBe(2);
  } finally {
    await fixture.pool.end();
  }
});

test("confirmed catalogue write survives a failed read refresh and requires reload before another mutation", async ({
  page,
}) => {
  const fixture = await ownShop(page);
  try {
    await page.goto(`/shopkeeper/shops/${fixture.shop}/catalogue`);
    await page.getByRole("tab", { name: /^Departments/ }).click();
    await expect(
      page.getByRole("button", { name: "Create department", exact: true }),
    ).toBeEnabled();
    let rejectRefresh = false;
    let submissions = 0;
    await page.route(`**${fixture.root}/departments`, async (route) => {
      submissions++;
      const response = await route.fetch();
      rejectRefresh = response.ok();
      await route.fulfill({ response });
    });
    await page.route(`**${fixture.root}/catalogue?*`, async (route) => {
      if (rejectRefresh) {
        rejectRefresh = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "service_unavailable" }),
        });
      } else await route.continue();
    });
    expect(
      (await createDepartment(page, "Confirmed department", "confirmed-department")).status(),
    ).toBe(200);
    await expect(page.getByRole("status")).toHaveText(
      "Department saved. The latest catalogue could not reload. Reload the catalogue before making another change.",
    );
    await expect(
      page.getByRole("button", { name: "Create department", exact: true }),
    ).toBeDisabled();
    expect(
      (
        await fixture.pool.query(
          "SELECT count(*)::int AS n FROM departments WHERE shop_id=$1 AND slug='confirmed-department'",
          [fixture.shop],
        )
      ).rows[0].n,
    ).toBe(1);
    await page.getByRole("button", { name: "Reload catalogue", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Catalogue reloaded.");
    await expect(
      page.getByRole("button", { name: "Create department", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Edit Confirmed department", exact: true }),
    ).toBeVisible();
    expect(submissions).toBe(1);
  } finally {
    await fixture.pool.end();
  }
});

test("hero browse action targets the actual collection and falls back to department navigation without publishing", async ({
  page,
  request,
}) => {
  const fixture = await ownShop(page);
  try {
    const department = await page.request.post(`${fixture.root}/departments`, {
      headers: { origin },
      data: {
        name: "Fictional collection",
        slug: "fictional-collection",
        position: 0,
        archived: false,
        version: 0,
      },
    });
    expect(department.status()).toBe(200);
    const departmentId = (await department.json()).id;
    const product = await page.request.post(`${fixture.root}/products`, {
      headers: { origin },
      data: {
        departmentId,
        name: "Fictional collection product",
        slug: "fictional-product",
        description: "Fictional collection specimen",
        currency: "UGX",
        priceMinor: "5000",
        kind: "product",
        availability: "available",
        position: 0,
        mediaId: null,
        version: 0,
      },
    });
    expect(product.status()).toBe(200);
    const productId = (await product.json()).id;
    const hero = {
      id: "welcome",
      type: "hero",
      version: 1,
      variant: "editorial",
      title: { text: "Our fictional storefront", provenance: "merchant" },
      subtitle: null,
      featuredProductId: null,
      cta: "browse",
    };
    const specification = {
      schemaVersion: 1,
      theme: "earth",
      announcement: "",
      actions: [],
      spaces: [
        hero,
        {
          id: "our-collection",
          type: "product_section",
          version: 1,
          variant: "grid",
          title: { text: "Our collection", provenance: "merchant" },
          departmentId,
          productIds: [productId],
        },
      ],
    };
    const saved = await page.request.put(`${fixture.root}/design`, {
      headers: { origin },
      data: { version: 0, summary: "Fictional hero and collection", specification },
    });
    expect(saved.status()).toBe(200);
    await page.goto(`/shopkeeper/shops/${fixture.shop}/preview`);
    const browse = page.getByRole("link", { name: "Browse collection", exact: true });
    await expect(browse).toHaveAttribute("href", "#our-collection");
    await browse.click();
    await expect(page).toHaveURL(/#our-collection$/);
    await expect(
      page.locator("#our-collection").getByRole("heading", { name: "Our collection", exact: true }),
    ).toBeInViewport();
    await expect(page.locator("#our-collection")).toContainText("Fictional collection product");
    await expect(page.locator("#shop-contact")).toContainText("Make a connection");
    const current = await saved.json();
    expect(
      (
        await page.request.put(`${fixture.root}/design`, {
          headers: { origin },
          data: {
            version: current.version,
            summary: "Fictional hero without a collection",
            specification: { ...specification, spaces: [hero] },
          },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`/shopkeeper/shops/${fixture.shop}/preview`);
    await expect(browse).toHaveAttribute("href", "#shop-departments");
    await browse.click();
    await expect(
      page.getByRole("navigation", { name: "Shop navigation", exact: true }),
    ).toBeInViewport();
    expect((await request.get(`/shops/${fixture.slug}`)).status()).toBe(404);
  } finally {
    await fixture.pool.end();
  }
});

test("product search opens an exact later-page item and immediately respects archive and unpublish", async ({
  page,
  request,
}) => {
  const fixture = await ownShop(page);
  try {
    const department = await page.request.post(`${fixture.root}/departments`, {
      headers: { origin },
      data: {
        name: "Fictional shelves",
        slug: "fictional-shelves",
        position: 0,
        archived: false,
        version: 0,
      },
    });
    expect(department.status()).toBe(200);
    const departmentId = (await department.json()).id;
    await fixture.pool.query(
      "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,availability,position) SELECT gen_random_uuid(),s.id,s.merchant_id,$2,'product','Fictional shelf item '||i,'shelf-'||i,'UGX','available',i FROM shops s CROSS JOIN generate_series(1,21) g(i) WHERE s.id=$1",
      [fixture.shop, departmentId],
    );
    const value = {
      departmentId,
      name: "Zebraneedle browser satchel",
      slug: "zebraneedle-browser-satchel",
      description: "A fictional search specimen",
      currency: "UGX",
      priceMinor: "5000",
      kind: "product",
      availability: "available",
      position: 99,
      mediaId: null,
      version: 0,
    };
    const created = await page.request.post(`${fixture.root}/products`, {
      headers: { origin },
      data: value,
    });
    expect(created.status()).toBe(200);
    const product = await created.json();
    const design = await page.request.put(`${fixture.root}/design`, {
      headers: { origin },
      data: {
        version: 0,
        summary: "Fictional search shelves",
        specification: {
          schemaVersion: 1,
          theme: "earth",
          announcement: "",
          actions: [],
          spaces: [{ id: "shelves", type: "department", version: 1, departmentId, limit: 8 }],
        },
      },
    });
    expect(design.status()).toBe(200);
    const draft = await design.json();
    const published = await page.request.post(`${fixture.root}/design/publish`, {
      headers: { origin },
      data: { ...draft, confirm: true, photosReviewed: true },
    });
    expect(published.status()).toBe(200);
    const publicState = await published.json();
    await page.goto(`/shops/${fixture.slug}/departments/fictional-shelves`);
    await expect(page.getByRole("main")).not.toContainText(value.name);
    await expect(page.getByRole("link", { name: "Next products", exact: true })).toBeVisible();
    const searchPath = `/search?q=zebraneedle&shop=${fixture.shop}`;
    await page.goto(searchPath);
    const shopLink = page
      .getByRole("main")
      .getByRole("link", { name: `${value.name} at Fictional catalogue shop`, exact: true });
    const productPath = `/shops/${fixture.slug}/products/${value.slug}`;
    await expect(shopLink).toHaveAttribute("href", productPath);
    await shopLink.click();
    await expect(page).toHaveURL(new RegExp(`${productPath}$`));
    await expect(
      page.getByRole("heading", { name: value.name, exact: true, level: 1 }),
    ).toBeVisible();
    const archived = await page.request.patch(`${fixture.root}/products/${product.id}`, {
      headers: { origin },
      data: { ...value, version: product.version, availability: "archived" },
    });
    expect(archived.status()).toBe(200);
    await page.goto(searchPath);
    await expect(page.getByRole("main")).toContainText("No shops matched this search.");
    await page.goto(productPath);
    await expect(page.getByRole("main")).toContainText("This item has moved or is unavailable.");
    await expect(page.getByRole("main")).not.toContainText(value.name);
    const restored = await page.request.patch(`${fixture.root}/products/${product.id}`, {
      headers: { origin },
      data: { ...value, version: (await archived.json()).version },
    });
    expect(restored.status()).toBe(200);
    await page.goto(searchPath);
    await expect(shopLink).toHaveAttribute("href", productPath);
    expect(
      (
        await page.request.post(`${fixture.root}/design/unpublish`, {
          headers: { origin },
          data: { version: publicState.version, confirm: true },
        })
      ).status(),
    ).toBe(200);
    await page.goto(searchPath);
    await expect(page.getByRole("main")).toContainText("No shops matched this search.");
    expect((await request.get(productPath)).status()).toBe(404);
  } finally {
    await fixture.pool.end();
  }
});

test("unpublished saved and proposal previews keep their identity through private catalogue navigation and images", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(90_000);
  const fixture = await ownShop(page);
  const foreign = await browser.newContext();
  try {
    const department = await page.request.post(`${fixture.root}/departments`, {
      headers: { origin },
      data: {
        name: "Preview shelves",
        slug: "preview-shelves",
        position: 0,
        archived: false,
        version: 0,
      },
    });
    expect(department.status()).toBe(200);
    const departmentId = (await department.json()).id;
    await fixture.pool.query(
      "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,availability,position) SELECT gen_random_uuid(),s.id,s.merchant_id,$2,'product','Preview catalogue item '||i,'preview-item-'||i,'UGX','available',i FROM shops s CROSS JOIN generate_series(1,22) g(i) WHERE s.id=$1",
      [fixture.shop, departmentId],
    );
    const asset = randomUUID();
    const mediaPath = `${fixture.root}/media/${asset}`;
    async function expectPrivateImage() {
      const pictures = page.getByRole("img", {
        name: "Fictional private preview image",
        exact: true,
      });
      expect(await pictures.count()).toBeGreaterThan(0);
      for (const picture of await pictures.all()) {
        // Covers, collection tiles and product cards may share an owned image.
        // Check every rendered copy and bring lazy images into view first.
        await picture.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            picture.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
          )
          .toBe(true);
        const source = await picture.evaluate((image: HTMLImageElement) => image.currentSrc);
        expect(new URL(source).pathname).toMatch(
          new RegExp(`^${mediaPath}/(thumbnail|card|display)$`),
        );
        const response = await page.request.get(source);
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toBe("image/webp");
        expect(response.headers()["cache-control"]).toContain("private");
        const bytes = await response.body();
        expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
        expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
      }
    }
    const image = await sharp({
      create: { width: 64, height: 48, channels: 3, background: "#604050" },
    })
      .webp()
      .toBuffer();
    await fixture.pool.query(
      "INSERT INTO media_assets(id,shop_id,merchant_id,state,storage_key,alt,width,height) SELECT $1,id,merchant_id,'ready',$2,'Fictional private preview image',64,48 FROM shops WHERE id=$3",
      [asset, `private:${asset}`, fixture.shop],
    );
    for (const variant of ["thumbnail", "card", "display"])
      await fixture.pool.query(
        "INSERT INTO media_blobs(asset_id,variant,bytes,width,height) VALUES($1,$2,$3,64,48)",
        [asset, variant, image],
      );
    await fixture.pool.query(
      "INSERT INTO media_blobs(asset_id,variant,bytes,width,height) VALUES($1,'source',$2,64,48)",
      [asset, Buffer.from("PRIVATE-SOURCE-ONLY")],
    );
    await fixture.pool.query(
      "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id) SELECT id,$1,shop_id,merchant_id FROM products WHERE shop_id=$2 AND slug IN ('preview-item-1','preview-item-22')",
      [asset, fixture.shop],
    );
    const specification = {
      schemaVersion: 1,
      theme: "earth",
      announcement: "PRIVATE-SAVED-PREVIEW",
      actions: [],
      spaces: [{ id: "preview-shelves", type: "department", version: 1, departmentId, limit: 8 }],
    };
    const first = await page.request.put(`${fixture.root}/design`, {
      headers: { origin },
      data: { version: 0, summary: "First private layout", specification },
    });
    expect(first.status()).toBe(200);
    const firstDraft = await first.json();
    expect(
      (
        await page.request.put(`${fixture.root}/design`, {
          headers: { origin },
          data: {
            version: firstDraft.version,
            summary: "Newer private layout",
            specification: { ...specification, theme: "plum" },
          },
        })
      ).status(),
    ).toBe(200);
    const base = `/shopkeeper/shops/${fixture.shop}/preview?revision=${firstDraft.revision}`;
    await page.goto(base);
    await expect(page.getByLabel("Private preview")).toContainText(
      `Revision ${firstDraft.revision}`,
    );
    await expect(page.locator(".canonical-shop")).toHaveClass(/theme-earth/);
    await expectPrivateImage();
    const navigation = page.getByRole("navigation", { name: "Shop navigation", exact: true });
    await expect(
      navigation.getByRole("link", { name: "Preview shelves", exact: true }),
    ).toHaveAttribute("href", `${base}&department=preview-shelves`);
    await navigation.getByRole("link", { name: "Preview shelves", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Preview shelves", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Next products", exact: true })).toHaveAttribute(
      "href",
      new RegExp(`revision=${firstDraft.revision}&department=preview-shelves&after=`),
    );
    await page.getByRole("link", { name: "Next products", exact: true }).click();
    await expect(page).toHaveURL(/revision=1&department=preview-shelves&after=/);
    await page.getByRole("link", { name: "Preview catalogue item 22", exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/preview\\?revision=${firstDraft.revision}&product=preview-item-22$`),
    );
    await expect(
      page.getByRole("heading", { name: "Preview catalogue item 22", exact: true, level: 1 }),
    ).toBeVisible();
    await expect(page.locator(".canonical-shop")).toHaveClass(/theme-earth/);
    await expectPrivateImage();
    await navigation.getByRole("link", { name: "Whole shop", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/preview\\?revision=${firstDraft.revision}$`));
    expect((await page.request.get(`${mediaPath}/card`)).status()).toBe(200);
    expect((await page.request.get(`${mediaPath}/source`)).status()).toBe(422);
    expect((await request.get(`${mediaPath}/card`)).status()).toBe(401);
    expect(
      (await request.get(`/api/public/shops/${fixture.shop}/media/${asset}/card`)).status(),
    ).toBe(404);
    const accounts: SeedAccounts = JSON.parse(
      await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"),
    );
    expect(
      (
        await foreign.request.post(`${origin}/api/auth/sign-in/email`, {
          headers: { origin },
          data: accounts.ownerB,
        })
      ).status(),
    ).toBe(200);
    expect((await foreign.request.get(`${origin}${mediaPath}/card`)).status()).toBe(404);
    const protectedPath = `${base}&product=preview-item-22`;
    for (const client of [request, foreign.request]) {
      for (const headers of [{}, { RSC: "1" }]) {
        const result = await client.get(`${origin}${protectedPath}`, { headers });
        expect(await result.text()).not.toContain("PRIVATE-SAVED-PREVIEW");
      }
    }
    for (const query of [
      "&department=../foreign",
      "&department=preview-shelves&product=preview-item-22",
      "&product=preview-item-22&after=bad",
      "&department=preview-shelves&department=other",
    ])
      expect((await page.request.get(`${base}${query}`)).status()).toBe(404);
    const current = await (await page.request.get(`${fixture.root}/design`)).json();
    const proposal = await page.request.post(`${fixture.root}/design/assistant`, {
      headers: { origin },
      data: {
        key: randomUUID(),
        version: current.version,
        instruction: "Use blue theme",
        externalConsent: false,
        qualityReview: false,
      },
    });
    expect(proposal.status()).toBe(200);
    const candidate = await proposal.json();
    expect(candidate.status).toBe("proposed");
    const proposalBase = `/shopkeeper/shops/${fixture.shop}/design/assistant/${candidate.id}/preview`;
    await page.goto(proposalBase);
    await expect(page.getByLabel("Private preview")).toContainText("Private proposal preview");
    await expect(page.locator(".canonical-shop")).toHaveClass(/theme-blue/);
    await expect(
      navigation.getByRole("link", { name: "Preview shelves", exact: true }),
    ).toHaveAttribute("href", `${proposalBase}?department=preview-shelves`);
    await navigation.getByRole("link", { name: "Preview shelves", exact: true }).click();
    await page.getByRole("link", { name: "Next products", exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/assistant/${candidate.id}/preview\\?department=preview-shelves&after=`),
    );
    await page.getByRole("link", { name: "Preview catalogue item 22", exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/assistant/${candidate.id}/preview\\?product=preview-item-22$`),
    );
    await expect(
      page.getByRole("heading", { name: "Preview catalogue item 22", exact: true, level: 1 }),
    ).toBeVisible();
    await expect(page.locator(".canonical-shop")).toHaveClass(/theme-blue/);
    await navigation.getByRole("link", { name: "Whole shop", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/assistant/${candidate.id}/preview$`));
    expect((await (await page.request.get(`${fixture.root}/design`)).json()).version).toBe(
      current.version,
    );
    for (const client of [request, foreign.request]) {
      const denied = await client.get(`${origin}${proposalBase}?product=preview-item-22`, {
        headers: { RSC: "1" },
      });
      expect(await denied.text()).not.toContain("PRIVATE-SAVED-PREVIEW");
    }
    expect((await request.get(`/shops/${fixture.slug}/products/preview-item-22`)).status()).toBe(
      404,
    );
  } finally {
    await foreign.close();
    await fixture.pool.end();
  }
});

test("a merchant creates a department inline, repeats product entry and duplicates without changing the source", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const fixture = await ownShop(page);
  try {
    await page.goto(`/shopkeeper/shops/${fixture.shop}`);
    await expect(
      page.getByRole("link", { name: "Continue: Create your first department →", exact: true }),
    ).toBeVisible();
    await page.goto(`/shopkeeper/shops/${fixture.shop}/catalogue`);
    await page.getByLabel("Product or service name", { exact: true }).fill("Blue carry bag");
    await page
      .getByLabel("Description", { exact: true })
      .fill("Keep this description while creating a room.");
    await page.getByLabel("Currency", { exact: true }).selectOption("USD");
    await page.getByLabel("Price (optional)", { exact: true }).fill("19.95");
    await page.getByRole("button", { name: "Create a department here", exact: true }).click();
    await page.getByLabel("New department name", { exact: true }).fill("Bags");
    await page.getByRole("button", { name: "Create & select department", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Department created and selected");
    await expect(page.getByLabel("Product or service name", { exact: true })).toHaveValue(
      "Blue carry bag",
    );
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
      "Keep this description while creating a room.",
    );
    const department = (
      await fixture.pool.query("SELECT id FROM departments WHERE shop_id=$1 AND name='Bags'", [
        fixture.shop,
      ])
    ).rows[0].id;
    await expect(page.getByLabel("Department", { exact: true })).toHaveValue(department);
    await page.getByRole("button", { name: "Save & add another", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Ready for the next item");
    await expect(page.getByLabel("Product or service name", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Currency", { exact: true })).toHaveValue("USD");
    await expect(page.getByLabel("Department", { exact: true })).toHaveValue(department);
    await page.getByLabel("Product or service name", { exact: true }).fill("Green carry bag");
    await page.getByLabel("Price (optional)", { exact: true }).fill("25.00");
    await page.getByRole("button", { name: "Create product or service", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Product or service saved.");
    await page.getByRole("button", { name: "Duplicate Blue carry bag", exact: true }).click();
    await expect(page.getByLabel("Product or service name", { exact: true })).toHaveValue(
      "Blue carry bag (copy)",
    );
    await expect(page.getByLabel("Price (optional)", { exact: true })).toHaveValue("19.95");
    await expect(page.getByLabel("Availability", { exact: true })).toHaveValue("archived");
    expect(
      (
        await fixture.pool.query("SELECT count(*)::int AS n FROM products WHERE shop_id=$1", [
          fixture.shop,
        ])
      ).rows[0].n,
    ).toBe(2);
    await page.getByLabel("Product or service name", { exact: true }).fill("Travel carry bag");
    await page.getByRole("button", { name: "Create product or service", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Product or service saved.");
    const rows = (
      await fixture.pool.query(
        "SELECT name,price_minor::text,currency,availability FROM products WHERE shop_id=$1 ORDER BY position",
        [fixture.shop],
      )
    ).rows;
    expect(rows).toEqual([
      { name: "Blue carry bag", price_minor: "1995", currency: "USD", availability: "available" },
      { name: "Green carry bag", price_minor: "2500", currency: "USD", availability: "available" },
      { name: "Travel carry bag", price_minor: "1995", currency: "USD", availability: "archived" },
    ]);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
          .violations,
      ).toEqual([]);
      if (width === 390 || width === 1280) {
        await mkdir("docs/evidence/images", { recursive: true });
        await page.evaluate(() => {
          (document.activeElement as HTMLElement)?.blur();
          window.scrollTo({ top: 0, behavior: "instant" });
        });
        if (width === 390)
          await page
            .getByRole("heading", { name: "Create product or service", exact: true })
            .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `docs/evidence/images/merchant-product-entry-${width}-2026-10-29.png`,
          fullPage: width !== 390,
        });
      }
    }
  } finally {
    await fixture.pool.end();
  }
});

test("catalogue filters find later products and arrangement works for products and departments", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const fixture = await ownShop(page);
  try {
    const merchant = (
      await fixture.pool.query("SELECT merchant_id FROM shops WHERE id=$1", [fixture.shop])
    ).rows[0].merchant_id;
    const department = randomUUID(),
      other = randomUUID();
    await fixture.pool.query(
      "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) VALUES($1,$3,$4,'Accessories','accessories',0),($2,$3,$4,'Home','home',1)",
      [department, other, fixture.shop, merchant],
    );
    const ids: string[] = [];
    for (let index = 0; index < 24; index++) {
      const id = randomUUID();
      ids.push(id);
      await fixture.pool.query(
        "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,price_minor,availability,position) VALUES($1,$2,$3,$4,'product',$5,$6,'UGX',5000,'available',$7)",
        [id, fixture.shop, merchant, department, `Bag ${index}`, `bag-${index}`, index],
      );
    }
    await page.goto(`/shopkeeper/shops/${fixture.shop}/catalogue`);
    await page.getByLabel("Find a product", { exact: true }).fill("Bag 23");
    await page.getByRole("button", { name: "Find products", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit Bag 23", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit Bag 0", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Clear product filters", exact: true }).click();
    await page.getByLabel("In department", { exact: true }).selectOption(department);
    await page.getByRole("button", { name: "Find products", exact: true }).click();
    await page.getByRole("button", { name: "Next products", exact: true }).click();
    await page.getByRole("button", { name: "Move Bag 20 up", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Display order updated.");
    const ordered = (
      await fixture.pool.query("SELECT name FROM products WHERE shop_id=$1 ORDER BY position,id", [
        fixture.shop,
      ])
    ).rows.map((row) => row.name);
    expect(ordered[19]).toBe("Bag 20");
    expect(ordered[20]).toBe("Bag 19");
    await page.getByRole("tab", { name: /^Departments/ }).click();
    await page.getByRole("button", { name: "Move Home up", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Display order updated.");
    expect(
      (
        await fixture.pool.query(
          "SELECT name FROM departments WHERE shop_id=$1 ORDER BY position,id",
          [fixture.shop],
        )
      ).rows.map((row) => row.name),
    ).toEqual(["Home", "Accessories"]);
    const move = { kind: "product", id: ids[0], version: 1, direction: "down" };
    expect(
      (
        await page.request.post(`${fixture.root}/catalogue/move`, {
          headers: { origin: "https://untrusted.invalid" },
          data: move,
        })
      ).status(),
    ).toBe(403);
    const anonymous = await browser.newContext();
    try {
      expect(
        (
          await anonymous.request.post(`${origin}${fixture.root}/catalogue/move`, {
            headers: { origin },
            data: move,
          })
        ).status(),
      ).toBe(401);
    } finally {
      await anonymous.close();
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.getByRole("heading", { name: "Departments", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "docs/evidence/images/merchant-department-order-390-2026-10-29.png",
      fullPage: false,
    });
  } finally {
    await fixture.pool.end();
  }
});

test("replacing a dirty product editor asks before discarding its contents", async ({ page }) => {
  const fixture = await ownShop(page);
  try {
    await page.goto(`/shopkeeper/shops/${fixture.shop}/catalogue`);
    await createDepartment(page, "Draft room", "draft-room");
    await expect(page.getByRole("status")).toHaveText("Department saved.");
    await page.getByRole("tab", { name: /^Products/ }).click();
    await expect(
      page.getByRole("button", { name: "Create a department here", exact: true }),
    ).toBeEnabled();
    await page
      .getByLabel("Product or service name", { exact: true })
      .fill("Keep this unfinished product");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("link", { name: "Add a product", exact: true }).click();
    await expect(page.getByLabel("Product or service name", { exact: true })).toHaveValue(
      "Keep this unfinished product",
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("link", { name: "Add a product", exact: true }).click();
    await expect(page.getByLabel("Product or service name", { exact: true })).toHaveValue("");
  } finally {
    await fixture.pool.end();
  }
});
