import { test, expect, type Page } from "./fixture";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds } from "../../src/server/db/seed";
import { availableShopAddress } from "../../src/server/shop-address";
import { transaction } from "../../src/server/db/pool";
import { readFile } from "node:fs/promises";
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
  await page.getByLabel("Product address", { exact: true }).fill(slug);
  await page.getByLabel("Price in minor units", { exact: false }).fill("5000");
  const submission = page.waitForResponse(
    (response) => response.url().endsWith("/products") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create product or service", exact: true }).click();
  return submission;
}

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
      await expect(page.getByLabel("Price in minor units", { exact: false })).toHaveValue("");
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
      data: { ...draft, confirm: true },
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
