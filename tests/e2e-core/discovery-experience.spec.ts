import { test, expect, type Page } from "./fixture";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { resolveActor } from "../../src/server/security/authorization";
import { seedIds } from "../../src/server/db/seed";
import { imageVariants } from "../../src/server/media";
import { saveDesign, publishDesign } from "../../src/server/shop-design";
import { applyShopTheme } from "../../src/modules/shop-themes/catalogue";
import { SAVED_SHOPS_KEY } from "../../src/modules/discovery/saved-contract";
import { COMPARISON_KEY } from "../../src/modules/discovery/comparison";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const origin = "http://127.0.0.1:3101";
const shops: { id: string; slug: string; name: string; asset: string }[] = [];
test.use({ actionTimeout: 15_000 });
test.beforeAll(async () => {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw Error("Disposable database required");
  // Playwright restarts a worker after a failed assertion. Reuse this file's
  // completed fixture in that disposable DB instead of colliding with its URLs.
  const existing = (
    await pool.query(
      "SELECT s.id,s.slug,s.name,a.id AS asset FROM shops s JOIN media_assets a ON a.shop_id=s.id WHERE s.slug=ANY($1::text[])",
      [["northline-goods", "the-green-room", "field-and-found", "circuit-studio"]],
    )
  ).rows;
  if (existing.length === 4) {
    for (const slug of ["northline-goods", "the-green-room", "field-and-found", "circuit-studio"])
      shops.push(existing.find((entry) => entry.slug === slug)!);
    return;
  }
  const auth = createAuth(pool, coreConfig(), true);
  const account = {
    email: `discovery-${randomUUID()}@londos.invalid`,
    password: `Fictional-${randomUUID()}`,
  };
  const person = await auth.api.signUpEmail({
    body: { ...account, name: "Fictional discovery merchant" },
  });
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [person.user.id]);
  const response = await auth.handler(
    new Request(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(account),
    }),
  );
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const actor = await resolveActor(auth, new Headers({ cookie }));
  const merchant = randomUUID();
  await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Fictional discovery merchant')", [
    merchant,
  ]);
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    merchant,
    person.user.id,
  ]);
  const entries = [
    {
      name: "Northline Goods",
      slug: "northline-goods",
      category: "fashion",
      art: "shop-fashion",
      tagline: "Considered pieces for everyday adventures.",
      theme: "atelier",
    },
    {
      name: "The Green Room",
      slug: "the-green-room",
      category: "home",
      art: "shop-home",
      tagline: "Objects and small details that make a home.",
      theme: "harvest",
    },
    {
      name: "Field & Found",
      slug: "field-and-found",
      category: "food",
      art: "shop-food",
      tagline: "Good things, grown and gathered close to home.",
      theme: "harvest",
    },
    {
      name: "Circuit Studio",
      slug: "circuit-studio",
      category: "electronics",
      art: "shop-electronics",
      tagline: "Everyday technology, thoughtfully selected.",
      theme: "signal",
    },
  ];
  for (const entry of entries) {
    const id = randomUUID(),
      asset = randomUUID(),
      department = randomUUID(),
      product = randomUUID();
    const variants = await imageVariants(
      await sharp(await readFile(`public/illustrations/${entry.art}.svg`))
        .resize({ width: 1200 })
        .png()
        .toBuffer(),
      "image/png",
      AbortSignal.timeout(5000),
    );
    await pool.query(
      "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category,tagline) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [id, merchant, seedIds.mallA, entry.name, entry.slug, entry.category, entry.tagline],
    );
    await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [id]);
    await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [id]);
    await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [id]);
    await pool.query(
      "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) VALUES($1,$2,$3,'Everyday collection','everyday',0)",
      [department, id, merchant],
    );
    await pool.query(
      "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,description,currency,price_minor,availability) VALUES($1,$2,$3,$4,'product','City carry','city-carry','A fictional carry bag for layout verification.','UGX',125000,'available')",
      [product, id, merchant, department],
    );
    await pool.query(
      "INSERT INTO media_assets(id,shop_id,merchant_id,state,storage_key,created_by,alt,width,height) VALUES($1,$2,$3,'ready',$1::uuid::text,$4,'Fictional independent shop illustration',1200,860)",
      [asset, id, merchant, person.user.id],
    );
    for (const variant of variants)
      await pool.query(
        "INSERT INTO media_blobs(asset_id,variant,bytes,width,height) VALUES($1,$2,$3,$4,$5)",
        [asset, variant.variant, variant.bytes, variant.width, variant.height],
      );
    await pool.query(
      "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id) VALUES($1,$2,$3,$4)",
      [product, asset, id, merchant],
    );
    await pool.query(
      "INSERT INTO shop_contacts(shop_id,merchant_id,version,phone,whatsapp,enquiries_enabled,fulfilment,delivery_instructions,payment_instructions) VALUES($1,$2,1,'+256700000099','+256700000099',true,'pickup','Arrange collection directly with the shop.','Confirm payment details with the merchant.')",
      [id, merchant],
    );
    const draft = await saveDesign(pool, actor, id, {
      version: 0,
      summary: "Fictional discovery fixture",
      specification: applyShopTheme(
        {
          schemaVersion: 1,
          theme: "earth",
          announcement: "Discover the collection. Connect directly with our shop.",
          branding: { coverAssetId: asset, logoAssetId: null },
          actions: ["whatsapp", "call", "enquiry"],
          spaces: [
            {
              id: "collection",
              type: "department",
              version: 1,
              departmentId: department,
              limit: 8,
            },
          ],
        },
        entry.theme,
      ),
    });
    await publishDesign(pool, actor, id, { ...draft, confirm: true });
    shops.push({ id, slug: entry.slug, name: entry.name, asset });
  }
});
test.afterAll(async () => pool.end());
async function inspect(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
    ).violations.map((value) => ({ id: value.id, nodes: value.nodes.map((node) => node.target) })),
  ).toEqual([]);
}
async function shot(page: Page, name: string, fullPage = true) {
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({
    path: `docs/evidence/images/discovery-${name}-2026-10-26.png`,
    fullPage,
  });
}

test("product information and mobile contact remain readable and follow current catalogue state", async ({
  page,
}) => {
  test.setTimeout(60000);
  const shop = shops[0]!,
    path = `/shops/${shop.slug}/products/city-carry`;
  const product = (
    await pool.query(
      "SELECT id,description,availability FROM products WHERE shop_id=$1 AND slug='city-carry'",
      [shop.id],
    )
  ).rows[0];
  const contact = (
    await pool.query(
      "SELECT phone,whatsapp,website,enquiries_enabled FROM shop_contacts WHERE shop_id=$1",
      [shop.id],
    )
  ).rows[0];
  try {
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "About this product", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("region", { name: "Product information" })).toContainText(
        product.description,
      );
      const action = page.getByRole("complementary", {
        name: "Quick product contact",
        exact: true,
      });
      if (width <= 600) {
        await expect(action).toBeInViewport();
        await expect(action).toContainText("125,000");
        await action.getByRole("link", { name: "Contact shop", exact: true }).click();
        await expect(page.locator("#product-contact")).toBeInViewport();
        await expect(
          page
            .locator("#product-contact")
            .getByRole("link", { name: "Send an enquiry", exact: true }),
        ).toHaveAttribute("href", `/contact/${shop.id}?product=${product.id}`);
        const footer = page
          .locator(".site-footer")
          .getByRole("link", { name: "Terms of use", exact: true });
        await footer.focus();
        await expect
          .poll(async () => {
            const link = await footer.boundingBox(),
              bar = await action.boundingBox();
            return Boolean(link && bar && link.y + link.height <= bar.y);
          })
          .toBe(true);
      } else {
        await expect(action).toBeHidden();
      }
      await inspect(page);
    }
    await pool.query("UPDATE products SET description='',version=version+1 WHERE id=$1", [
      product.id,
    ]);
    await page.reload();
    await expect(page.getByRole("region", { name: "Product information" })).toHaveCount(0);
    await pool.query(
      "UPDATE shop_contacts SET phone='',whatsapp='',website='',enquiries_enabled=false,version=version+1 WHERE shop_id=$1",
      [shop.id],
    );
    await page.reload();
    await expect(
      page.getByRole("complementary", { name: "Quick product contact", exact: true }),
    ).toHaveCount(0);
    await pool.query("UPDATE products SET availability='archived',version=version+1 WHERE id=$1", [
      product.id,
    ]);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "This item has moved or is unavailable.", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Quick product contact", exact: true }),
    ).toHaveCount(0);
  } finally {
    await pool.query(
      "UPDATE products SET description=$2,availability=$3,version=version+1 WHERE id=$1",
      [product.id, product.description, product.availability],
    );
    await pool.query(
      "UPDATE shop_contacts SET phone=$2,whatsapp=$3,website=$4,enquiries_enabled=$5,version=version+1 WHERE shop_id=$1",
      [shop.id, contact.phone, contact.whatsapp, contact.website, contact.enquiries_enabled],
    );
  }
});

test("mall cards, category context and exact product prices are accessible on desktop and phones", async ({
  page,
}) => {
  test.setTimeout(90_000);
  for (const width of [1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Good shops.");
    const card = page
      .locator(".discovery-card")
      .filter({ has: page.getByRole("heading", { name: shops[0]!.name, exact: true }) });
    await expect(card.locator("img")).toBeVisible();
    await expect
      .poll(() =>
        card
          .locator("img")
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    expect(await card.locator("a button").count()).toBe(0);
    await inspect(page);
    if (width === 1440 || width === 390) await shot(page, `mall-${width}`);
  }
  await page.goto(`/search?shop=${shops[0]!.id}&q=carry`);
  await expect(page.locator(".discovery-match-price")).toHaveText(/125,000/);
  await expect(
    page.getByRole("link", { name: "City carry at Northline Goods", exact: true }),
  ).toHaveAttribute("href", "/shops/northline-goods/products/city-carry");
  const categories = page.getByRole("navigation", { name: "Filter by category" });
  await categories.getByRole("link", { name: "Home & living", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("shop")).toBe(shops[0]!.id);
  await expect(page.getByText("No shops matched this search.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Clear category ×", exact: true }).click();
  await expect(page.locator(".discovery-match-price")).toHaveText(/125,000/);
  await inspect(page);
  await shot(page, "product-search-mobile");
  await page.goto(`/search?shop=${shops[0]!.id}&q=nothing-matches-here`);
  await page.getByRole("link", { name: "Browse this shop", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("shop") === shops[0]!.id && !url.searchParams.has("q"),
  );
  await expect(page.getByRole("link", { name: "Northline Goods", exact: true })).toBeVisible();
  await page.goto(`/search?shop=${shops[0]!.id}&q=carry`);
  await page.route(`**/api/public/shops/${shops[0]!.id}/media/**`, (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.reload();
  await expect(page.getByRole("img", { name: /image currently unavailable/i })).toBeVisible();
  await page.getByRole("link", { name: "City carry at Northline Goods", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("City carry");
});

test("saved shops persist IDs only, recheck visibility, sync tabs and recover from network/storage failures", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(100_000);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Save Northline Goods to saved shops", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove Northline Goods from saved shops", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const raw = await page.evaluate((key) => localStorage.getItem(key), SAVED_SHOPS_KEY);
  expect(JSON.parse(raw!)).toEqual([shops[0]!.id]);
  await page.goto("/saved");
  await expect(page.getByRole("heading", { name: "Northline Goods", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Northline Goods", exact: true })).toBeVisible();
  await inspect(page);
  await shot(page, "saved-desktop");
  const second = await context.newPage();
  await second.goto("/saved");
  await second
    .getByRole("button", { name: "Remove Northline Goods from saved shops", exact: true })
    .click();
  await expect(page.getByText("Keep your favourites close.", { exact: true })).toBeVisible();
  await second.close();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Save Northline Goods to saved shops", exact: true })
    .click();
  await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [shops[0]!.id]);
  try {
    await page.goto("/saved");
    await expect(
      page.getByText("These shops aren't available right now.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Northline Goods", exact: true })).toHaveCount(
      0,
    );
    expect(
      JSON.parse((await page.evaluate((key) => localStorage.getItem(key), SAVED_SHOPS_KEY))!),
    ).toEqual([shops[0]!.id]);
  } finally {
    await pool.query("UPDATE shop_moderation SET state='clear' WHERE shop_id=$1", [shops[0]!.id]);
  }
  await page.route("**/api/public/saved-shops", (route) =>
    route.fulfill({ status: 503, json: { error: "service_unavailable" } }),
  );
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "Saved shops could not be loaded." }),
  ).toBeVisible();
  await page.unroute("**/api/public/saved-shops");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Northline Goods", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await inspect(page);
  await shot(page, "saved-mobile");
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto(`${origin}/saved`);
  await expect(other.getByText("Keep your favourites close.", { exact: true })).toBeVisible();
  await fresh.close();
  await page.getByRole("button", { name: "Clear saved shops", exact: true }).click();
  await page.goto("/");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Unavailable", "SecurityError");
    };
  });
  await page
    .getByRole("button", { name: "Save Northline Goods to saved shops", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "This browser could not save" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save Northline Goods to saved shops", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("product contacts, scoped search and public share fallbacks work without leaking preview links", async ({
  page,
}) => {
  test.setTimeout(70_000);
  const path = "/shops/northline-goods/products/city-carry";
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { copied?: string }).copied = text;
        },
      },
    });
  });
  await page.goto(path + "?unwanted=private#not-for-sharing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("City carry");
  await expect(
    page.getByRole("searchbox", { name: "Search Northline Goods", exact: true }),
  ).toBeVisible();
  const contacts = page.locator("#product-contact");
  const whatsapp = contacts.getByRole("link", { name: "Message on WhatsApp", exact: true });
  const href = await whatsapp.getAttribute("href");
  expect(new URL(href!).hostname).toBe("wa.me");
  expect(new URL(href!).searchParams.get("text")).toContain(`${origin}${path}`);
  await expect(
    contacts.getByRole("link", { name: "Send an enquiry", exact: true }),
  ).toHaveAttribute("href", new RegExp(`^/contact/${shops[0]!.id}\\?product=[a-f0-9-]+$`));
  await page.getByRole("button", { name: "Share", exact: true }).click();
  expect(await page.evaluate(() => (window as Window & { copied?: string }).copied)).toBe(
    origin + path,
  );
  await expect(page.getByRole("status").filter({ hasText: "Link copied." })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error("blocked");
        },
      },
    });
  });
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Shop link", exact: true })).toHaveValue(
    origin + path,
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {} },
    });
  });
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Shop link", exact: true })).toHaveCount(0);
  await inspect(page);
  await shot(page, "product-desktop");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(
    page.getByRole("complementary", { name: "Quick product contact", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("complementary", { name: "Quick product contact", exact: true })
    .getByRole("link", { name: "Contact shop", exact: true })
    .click();
  await expect(contacts).toBeInViewport();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await inspect(page);
  // Capture the actual viewport after reaching contacts. A full-page capture
  // of a scrolled page misrepresents fixed UI and the offscreen skip link.
  await shot(page, "product-mobile", false);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("cancelled", "AbortError");
      },
    });
  });
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByText("This link cannot be shared.", { exact: true })).toHaveCount(0);
});

test("saved public API rejects cross-site, malformed and oversized requests and pages beyond twenty shops", async ({
  request,
}) => {
  test.setTimeout(60_000);
  const endpoint = "/api/public/saved-shops";
  expect(
    (
      await request.post(endpoint, {
        headers: { origin: "https://untrusted.invalid" },
        data: { ids: [shops[0]!.id] },
      })
    ).status(),
  ).toBe(403);
  for (const data of [
    { ids: ["not-an-id"] },
    { ids: [], includePrivate: true },
    { ids: Array.from({ length: 41 }, () => randomUUID()) },
  ])
    expect((await request.post(endpoint, { headers: { origin }, data })).status()).toBe(422);
  expect(
    (
      await request.post(endpoint, {
        headers: { origin, "content-type": "application/json" },
        data: "x".repeat(9000),
      })
    ).status(),
  ).toBe(422);
  const original = shops[0]!.id;
  const ids = [original];
  for (let index = 0; index < 23; index++) {
    const id = randomUUID();
    ids.push(id);
    await pool.query(
      "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category) SELECT $1,merchant_id,mall_id,'Fictional saved pagination',$2,category FROM shops WHERE id=$3",
      [id, `saved-boundary-${id}`, original],
    );
    await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [id]);
    await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [id]);
    await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'active')", [id]);
    await pool.query(
      'INSERT INTO shop_revisions(id,shop_id,merchant_id,revision,schema_version,design,summary,author_id) SELECT gen_random_uuid(),$1,merchant_id,1,1,\'{"schemaVersion":1,"theme":"earth","announcement":"","spaces":[],"actions":[]}\'::jsonb,\'Saved pagination fixture\',author_id FROM shop_revisions WHERE shop_id=$2 LIMIT 1',
      [id, original],
    );
    await pool.query(
      "INSERT INTO shop_designs(shop_id,merchant_id,published_id) SELECT $1,merchant_id,id FROM shop_revisions WHERE shop_id=$1",
      [id],
    );
  }
  const response = await request.post(endpoint, {
    headers: { origin },
    data: { ids: [...ids, original, randomUUID()] },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(body.results).toHaveLength(24);
  expect(new Set(body.results.map((value: { id: string }) => value.id)).size).toBe(24);
  for (const result of body.results) {
    expect(result).not.toHaveProperty("merchant_id");
    expect(result).not.toHaveProperty("created_by");
    expect(ids).toContain(result.id);
  }
});

test("listing refinements preserve search context, recover empty results and work without browser JavaScript", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const circuit = shops[3]!;
  const row = (
    await pool.query(
      "SELECT merchant_id,department_id FROM products WHERE shop_id=$1 AND slug='city-carry'",
      [circuit.id],
    )
  ).rows[0];
  const id = randomUUID();
  await pool.query(
    "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,description,currency,price_minor,availability) VALUES($1,$2,$3,$4,'service','City repair','city-repair','Fictional repair service for refinement verification.','UGX',45000,'available')",
    [id, circuit.id, row.merchant_id, row.department_id],
  );
  await pool.query(
    "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id) VALUES($1,$2,$3,$4)",
    [id, circuit.asset, circuit.id, row.merchant_id],
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/search?q=City&category=electronics");
  await page.locator(".search-refinements > summary").click();
  await page.getByLabel("Listing type", { exact: true }).selectOption("service");
  await page.getByLabel("Availability", { exact: true }).selectOption("available");
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === "City" &&
      url.searchParams.get("category") === "electronics" &&
      url.searchParams.get("kind") === "service" &&
      url.searchParams.get("availability") === "available",
  );
  await expect(
    page.getByRole("link", { name: "City repair at Circuit Studio", exact: true }),
  ).toHaveAttribute("href", "/shops/circuit-studio/products/city-repair");
  await expect(page.locator(".discovery-card")).toHaveCount(1);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByLabel("Listing type", { exact: true })).toHaveValue("service");
    await expect(page.getByLabel("Availability", { exact: true })).toHaveValue("available");
    await inspect(page);
    if (width !== 320) await shot(page, `refinements-${width}`);
  }
  await page
    .getByRole("navigation", { name: "Filter by category" })
    .getByRole("link", { name: "Fashion & style", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No shops matched this search.", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("kind")).toBe("service");
  await page.getByRole("link", { name: "Search without these refinements", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === "City" &&
      url.searchParams.get("category") === "fashion" &&
      !url.searchParams.has("kind") &&
      !url.searchParams.has("availability"),
  );
  await expect(
    page.getByRole("link", { name: "City carry at Northline Goods", exact: true }),
  ).toBeVisible();
  await page.goto(`/search?q=City&shop=${circuit.id}&kind=service&availability=available`);
  await page.getByRole("searchbox").fill("repair");
  await page.getByRole("button", { name: "Search this shop", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === "repair" &&
      url.searchParams.get("shop") === circuit.id &&
      url.searchParams.get("kind") === "service" &&
      url.searchParams.get("availability") === "available",
  );
  await page
    .getByRole("navigation", { name: "Applied search filters" })
    .getByRole("link", { name: "Services ×", exact: true })
    .click();
  await expect(page.getByLabel("Listing type", { exact: true })).toHaveValue("all");
  await expect(page.getByLabel("Availability", { exact: true })).toHaveValue("available");
  await expect(page.getByRole("searchbox")).toHaveValue("repair");
  await page.getByRole("link", { name: "Clear refinements", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("shop") === circuit.id &&
      url.searchParams.get("q") === "repair" &&
      !url.searchParams.has("kind") &&
      !url.searchParams.has("availability"),
  );
  await page.goto("/search?kind=archived");
  await expect(
    page.getByRole("heading", { name: "Check this search.", exact: true }),
  ).toBeVisible();
  const context = await browser.newContext({ javaScriptEnabled: false });
  const basic = await context.newPage();
  await basic.goto(`${origin}/search?q=City&category=electronics`);
  await basic.locator(".search-refinements > summary").click();
  await basic.getByLabel("Listing type", { exact: true }).selectOption("service");
  await basic.getByLabel("Availability", { exact: true }).selectOption("available");
  await basic.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(
    basic.getByRole("link", { name: "City repair at Circuit Studio", exact: true }),
  ).toBeVisible();
  await expect(basic.locator(".discovery-card")).toHaveCount(1);
  await context.close();
});

test("budget discovery preserves context, shows the qualifying price and works without JavaScript", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const shop = shops[3]!,
    row = (
      await pool.query("SELECT merchant_id,department_id FROM products WHERE shop_id=$1 LIMIT 1", [
        shop.id,
      ])
    ).rows[0];
  for (const [slug, kind, currency, price, availability] of [
    ["budget-repair", "service", "UGX", "45000", "available"],
    ["budget-dollar", "product", "USD", "1299", "available"],
    ["budget-quote", "service", "UGX", null, "available"],
    ["budget-archived", "service", "UGX", "45000", "archived"],
  ] as const)
    await pool.query(
      "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,price_minor,availability) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(shop_id,slug) DO NOTHING",
      [
        randomUUID(),
        shop.id,
        row.merchant_id,
        row.department_id,
        kind,
        slug.replaceAll("-", " "),
        slug,
        currency,
        price,
        availability,
      ],
    );
  await page.goto(`/search?q=budget&category=electronics&shop=${shop.id}`);
  await page.locator(".search-refinements > summary").click();
  await page.getByLabel("Listing type", { exact: true }).selectOption("service");
  await page.getByLabel("Availability", { exact: true }).selectOption("available");
  await page.getByLabel("Minimum price", { exact: true }).fill("45000");
  await page.getByLabel("Maximum price", { exact: true }).fill("45000");
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  const path = new URL(page.url()).pathname + new URL(page.url()).search;
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("shop") === shop.id &&
      url.searchParams.get("maxPrice") === "45000" &&
      url.searchParams.get("currency") === "UGX",
  );
  const hit = page.getByRole("link", { name: "budget repair at Circuit Studio", exact: true });
  await expect(hit).toHaveAttribute("href", "/shops/circuit-studio/products/budget-repair");
  await expect(page.locator(".discovery-card")).toHaveCount(1);
  await expect(page.locator(".discovery-card")).toContainText("45,000");
  for (const width of [1440, 390, 320, 900]) {
    await page.setViewportSize({ width, height: 1000 });
    await inspect(page);
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `docs/evidence/images/competitor-budget-${width}-2026-10-29.png`,
        fullPage: true,
      });
  }
  await page.getByRole("searchbox").fill("repair");
  await page.getByRole("button", { name: "Search this shop", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("maxPrice")).toBe("45000");
  await page
    .getByRole("navigation", { name: "Filter by category" })
    .getByRole("link", { name: "Fashion & style", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No shops matched this search.", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("minPrice")).toBe("45000");
  await page.goto(path);
  await page
    .getByRole("navigation", { name: "Applied search filters" })
    .getByRole("link", { name: /45,000.*×/ })
    .click();
  await expect(page.getByLabel("Maximum price", { exact: true })).toHaveValue("");
  expect(new URL(page.url()).searchParams.get("kind")).toBe("service");
  expect(new URL(page.url()).searchParams.get("shop")).toBe(shop.id);
  await page.goto(`/search?q=budget&shop=${shop.id}&currency=USD&minPrice=12.99&maxPrice=12.99`);
  await expect(
    page.getByRole("link", { name: "budget dollar at Circuit Studio", exact: true }),
  ).toBeVisible();
  for (const range of ["minPrice=10&maxPrice=9", "minPrice=1.01", "maxPrice=10&maxPrice=20"]) {
    await page.goto(`/search?${range}`);
    await expect(
      page.getByRole("heading", { name: "Check this search.", exact: true }),
    ).toBeVisible();
  }
  // Keep the expanded native form in view; Chromium's smooth auto-scroll can
  // stall Playwright's stability polling when page JavaScript is disabled.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 1200 },
  });
  try {
    const basic = await context.newPage();
    await basic.bringToFront();
    await basic.goto(`${origin}/search?q=budget&shop=${shop.id}`);
    await basic.locator(".search-refinements > summary").click();
    await basic.getByLabel("Maximum price", { exact: true }).fill("45000");
    await basic.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(
      basic.getByRole("link", { name: "budget repair at Circuit Studio", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("merchant fulfilment facts use clear labels on product and enquiry pages", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const shop = shops[0]!,
    original = (
      await pool.query(
        "SELECT fulfilment,delivery_instructions,payment_instructions FROM shop_contacts WHERE shop_id=$1",
        [shop.id],
      )
    ).rows[0];
  try {
    for (const [value, label] of [
      ["pickup", "Collection offered"],
      ["delivery", "Delivery offered"],
      ["pickup_and_delivery", "Collection and delivery offered"],
      ["contact", "Ask the shop about collection or delivery"],
    ]) {
      await pool.query(
        "UPDATE shop_contacts SET version=version+1,fulfilment=$2,delivery_instructions='Confirm your collection point or delivery area.',payment_instructions='Ask for the full total before paying.' WHERE shop_id=$1",
        [shop.id, value],
      );
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(`/shops/${shop.slug}/products/city-carry`);
      const details = page.locator("#product-contact .shop-buying-details");
      await expect(details).toContainText(label!);
      await expect(details).toContainText("Provided by this shop");
      await expect(details).toContainText("Confirm your collection point or delivery area.");
      await expect(details).toContainText("Ask for the full total before paying.");
    }
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await inspect(page);
    }
    await page.screenshot({
      path: "docs/evidence/images/competitor-buying-details-1280-2026-10-29.png",
      fullPage: true,
    });
    await page.goto(`/contact/${shop.id}`);
    await expect(page.locator(".shop-buying-details")).toContainText(
      "Ask the shop about collection or delivery",
    );
    await inspect(page);
  } finally {
    await pool.query(
      "UPDATE shop_contacts SET version=version+1,fulfilment=$2,delivery_instructions=$3,payment_instructions=$4 WHERE shop_id=$1",
      [shop.id, original.fulfilment, original.delivery_instructions, original.payment_instructions],
    );
  }
});

test("shopping help is discoverable, keyboard accessible and usable without JavaScript", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/search");
  await page.getByText("Menu", { exact: true }).click();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "How to shop", exact: true })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  const question = page
    .locator("summary")
    .filter({ hasText: "Can I pay or place an order through Londos?" });
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Londos does not collect payment for purchases from shops.", { exact: false }),
  ).toBeVisible();
  for (const width of [320, 390, 900, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await inspect(page);
    if (width === 390) {
      await page.evaluate(() => {
        (document.activeElement as HTMLElement)?.blur();
        window.scrollTo({ top: 0, behavior: "instant" });
      });
      await page.screenshot({
        path: "docs/evidence/images/competitor-shopping-help-390-2026-10-29.png",
        fullPage: true,
      });
    }
  }
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const basic = await context.newPage();
    await basic.bringToFront();
    await basic.goto(`${origin}/help`);
    await basic.locator("summary").filter({ hasText: "Where are my saved shops?" }).click();
    await expect(
      basic.getByText("They are stored in this browser on this device", { exact: false }),
    ).toBeVisible();
    await basic.getByRole("link", { name: "Open your own shop", exact: true }).click();
    await expect(basic).toHaveURL(/\/rent-a-shop$/);
  } finally {
    await context.close();
  }
});

test("comparison keeps only IDs, syncs tabs, rechecks prices and reads shared links without JavaScript", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const first = shops[0]!,
    second = shops[1]!;
  const items = (
    await pool.query(
      "SELECT id,shop_id,price_minor::text FROM products WHERE shop_id=ANY($1::uuid[]) AND slug='city-carry'",
      [[first.id, second.id]],
    )
  ).rows;
  const firstId = items.find((row) => row.shop_id === first.id).id,
    secondId = items.find((row) => row.shop_id === second.id).id;
  await page.goto(`/search?q=City&category=fashion`);
  await page.getByRole("button", { name: "Compare City carry", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Compare City carry", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const other = await page.context().newPage();
  try {
    await other.goto(`/shops/${second.slug}/products/city-carry`);
    await other.getByRole("button", { name: "Compare City carry", exact: true }).click();
    await expect(
      page
        .locator(".product-compare-control")
        .getByRole("link", { name: "View comparison (2)", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), COMPARISON_KEY),
    ).toEqual([firstId, secondId]);
    await other
      .locator(".storefront-product-detail")
      .getByRole("link", { name: "View comparison (2)", exact: true })
      .click();
    await expect(other.getByRole("table")).toContainText(first.name);
    await expect(other.getByRole("table")).toContainText(second.name);
    const shared = other.url();
    for (const width of [320, 390, 900, 1440]) {
      await other.setViewportSize({ width, height: 1000 });
      await inspect(other);
      if (width === 390 || width === 1440) {
        await other.evaluate(() => {
          (document.activeElement as HTMLElement)?.blur();
          window.scrollTo({ top: 0, behavior: "instant" });
        });
        await other.screenshot({
          path: `docs/evidence/images/platform-comparison-${width}-2026-10-29.png`,
          fullPage: true,
        });
      }
    }
    await pool.query("UPDATE products SET price_minor=99001 WHERE id=$1", [firstId]);
    await other.reload();
    await expect(other.getByRole("table")).toContainText("99,001");
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1280, height: 1200 },
    });
    try {
      const basic = await context.newPage();
      await basic.goto(shared);
      await expect(basic.getByRole("table")).toContainText("99,001");
    } finally {
      await context.close();
    }
    await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [first.id]);
    await other.reload();
    await expect(other.getByRole("table")).not.toContainText(first.name);
    await expect(
      other.getByText("Some selections are no longer public and have been left out.", {
        exact: true,
      }),
    ).toBeVisible();
    await other.getByRole("link", { name: "Remove City carry", exact: true }).click();
    await expect(other.getByRole("table")).toHaveCount(0);
    expect(
      await other.evaluate((key) => JSON.parse(localStorage.getItem(key)!), COMPARISON_KEY),
    ).toEqual([firstId]);
    for (const query of [
      "products=invalid",
      `products=${Array.from({ length: 5 }, () => randomUUID()).join(",")}`,
      `products=${firstId}&products=${secondId}`,
    ]) {
      await other.goto(`/compare?${query}`);
      await expect(
        other.getByRole("heading", { name: "Check these selections.", exact: true }),
      ).toBeVisible();
    }
  } finally {
    await other.close();
    await pool.query("UPDATE products SET price_minor=$2 WHERE id=$1", [
      firstId,
      items.find((row) => row.id === firstId).price_minor,
    ]);
    await pool.query("UPDATE shop_moderation SET state='clear' WHERE shop_id=$1", [first.id]);
  }
});

test("comparison recovers from full and blocked browser storage", async ({ page, browser }) => {
  const shop = shops[0]!,
    product = (
      await pool.query("SELECT id FROM products WHERE shop_id=$1 AND slug='city-carry'", [shop.id])
    ).rows[0];
  await page.goto(`/shops/${shop.slug}/products/city-carry`);
  await page.evaluate(
    ({ key, ids }) => {
      localStorage.setItem(key, JSON.stringify(ids));
      dispatchEvent(new StorageEvent("storage", { key }));
    },
    { key: COMPARISON_KEY, ids: Array.from({ length: 4 }, () => randomUUID()) },
  );
  await page.getByRole("button", { name: "Compare City carry", exact: true }).click();
  await expect(
    page.getByText("Compare up to 4 products. Remove a selection first.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).length, COMPARISON_KEY),
  ).toBe(4);
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("blocked", "SecurityError");
      };
    });
    const blocked = await context.newPage();
    await blocked.goto(`${origin}/shops/${shop.slug}/products/city-carry`);
    await blocked.getByRole("button", { name: "Compare City carry", exact: true }).click();
    await expect(
      blocked.getByText(
        "Your browser could not save this selection. Allow local storage and try again.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      await blocked.evaluate(
        ({ key, id }) => {
          try {
            return localStorage.getItem(key)?.includes(id) ?? false;
          } catch {
            return false;
          }
        },
        { key: COMPARISON_KEY, id: product.id },
      ),
    ).toBe(false);
  } finally {
    await context.close();
  }
});

test("related listings and product enquiries carry through to the merchant inbox", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const shop = shops[0]!,
    source = (
      await pool.query(
        "SELECT id,merchant_id,department_id FROM products WHERE shop_id=$1 AND slug='city-carry'",
        [shop.id],
      )
    ).rows[0];
  for (const [slug, name, availability] of [
    ["weekender", "Weekender bag", "available"],
    ["retired-bag", "Retired bag", "archived"],
    ["unavailable-bag", "Unavailable bag", "unavailable"],
  ])
    await pool.query(
      "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,price_minor,availability) VALUES($1,$2,$3,$4,'product',$5,$6,'UGX',65000,$7) ON CONFLICT(shop_id,slug) DO NOTHING",
      [randomUUID(), shop.id, source.merchant_id, source.department_id, name, slug, availability],
    );
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(`/shops/${shop.slug}/products/city-carry`);
  const related = page.getByRole("region", { name: "More from this department", exact: true });
  await expect(related.getByRole("link", { name: "Weekender bag", exact: true })).toBeVisible();
  await expect(related).not.toContainText("Retired bag");
  await expect(related).not.toContainText("Unavailable bag");
  await inspect(page);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await related.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/evidence/images/platform-related-products-390-2026-10-29.png",
    fullPage: false,
  });
  await page
    .locator("#product-contact")
    .getByRole("link", { name: "Send an enquiry", exact: true })
    .click();
  await expect(page).toHaveURL((url) => url.searchParams.get("product") === source.id);
  await expect(
    page.getByRole("region", { name: "Product enquiry details", exact: true }),
  ).toContainText("City carry");
  await page.getByLabel("Your name", { exact: true }).fill("Fictional sourcing customer");
  await page
    .getByLabel("Email or international phone number", { exact: true })
    .fill("sourcing@londos.invalid");
  await page
    .getByLabel("Message to the shop", { exact: true })
    .fill("Please quote for three bags, blue, needed next month.");
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Request received.");
  await inspect(page);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: "docs/evidence/images/platform-product-enquiry-390-2026-10-29.png",
    fullPage: true,
  });
  expect(
    (
      await pool.query(
        "SELECT product_id FROM guest_requests WHERE shop_id=$1 AND reply_to='sourcing@londos.invalid'",
        [shop.id],
      )
    ).rows[0]?.product_id,
  ).toBe(source.id);
  const foreign = (
    await pool.query("SELECT id FROM products WHERE shop_id=$1 LIMIT 1", [shops[1]!.id])
  ).rows[0];
  expect((await page.goto(`/contact/${shop.id}?product=${foreign.id}`))?.status()).toBe(404);
  const auth = createAuth(pool, coreConfig(), true),
    account = {
      email: `sourcing-owner-${randomUUID()}@londos.invalid`,
      password: `Fictional-${randomUUID()}`,
    };
  const person = await auth.api.signUpEmail({
    body: { ...account, name: "Fictional sourcing owner" },
  });
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [person.user.id]);
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    source.merchant_id,
    person.user.id,
  ]);
  const context = await browser.newContext();
  try {
    const owner = await context.newPage();
    await owner.goto(`${origin}/sign-in?next=/shopkeeper`);
    await owner.getByLabel("Email", { exact: true }).fill(account.email);
    await owner.getByLabel("Password", { exact: true }).fill(account.password);
    await owner.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(owner).toHaveURL((url) => url.pathname === "/shopkeeper");
    await owner.goto(`${origin}/shopkeeper/shops/${shop.id}/catalogue`);
    await owner.getByRole("tab", { name: /^Customer requests/ }).click();
    await expect(owner.getByText("About: City carry", { exact: true })).toBeVisible();
    await expect(
      owner.getByText("Please quote for three bags, blue, needed next month.", { exact: true }),
    ).toBeVisible();
    await owner
      .getByRole("button", {
        name: "Acknowledge request from Fictional sourcing customer",
        exact: true,
      })
      .click();
    await expect(owner.getByRole("status")).toContainText("Request acknowledged.");
  } finally {
    await context.close();
  }
});
