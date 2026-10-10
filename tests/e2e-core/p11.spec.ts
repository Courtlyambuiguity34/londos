import { test, expect, type Page } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import sharp from "sharp";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
const origin = "http://127.0.0.1:3101";
async function setup() {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw Error("Requires guarded browser database");
  const p = new Pool({ connectionString: process.env.DATABASE_URL }),
    shop = randomUUID(),
    department = randomUUID(),
    asset = randomUUID(),
    product = randomUUID(),
    slug = `p11-${shop}`;
  try {
    await p.query(
      "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category)VALUES($1,$2,$3,'P11 Fictional Shop',$4,'fashion')",
      [shop, seedIds.merchantB, seedIds.mallB, slug],
    );
    await p.query(
      "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position)VALUES($1,$2,$3,'Shoes','shoes',0)",
      [department, shop, seedIds.merchantB],
    );
    await p.query(
      "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,price_minor,availability,position)VALUES($1,$2,$3,$4,'product','Featured shoe','featured-shoe','UGX',1000,'available',0)",
      [product, shop, seedIds.merchantB, department],
    );
    await p.query(
      "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,price_minor,availability,position) SELECT gen_random_uuid(),$1,$2,$3,'product','Shoe '||i,'shoe-'||i,'UGX',1000,'available',i/3 FROM generate_series(1,45)g(i)",
      [shop, seedIds.merchantB, department],
    );
    await p.query("INSERT INTO shop_publication(shop_id,state)VALUES($1,'unpublished')", [shop]);
    await p.query("INSERT INTO tenancies(shop_id,state)VALUES($1,'active')", [shop]);
    await p.query("INSERT INTO shop_moderation(shop_id,state)VALUES($1,'clear')", [shop]);
    await p.query(
      "INSERT INTO media_assets(id,shop_id,merchant_id,state,alt,width,height,storage_key)VALUES($1,$2,$3,'ready','Fictional shoe photograph',600,400,$1::uuid::text)",
      [asset, shop, seedIds.merchantB],
    );
    const bytes = await sharp({
      create: { width: 600, height: 400, channels: 3, background: "#9c6c49" },
    })
      .webp()
      .toBuffer();
    for (const variant of ["thumbnail", "card", "display", "source"])
      await p.query(
        "INSERT INTO media_blobs(asset_id,variant,bytes,width,height)VALUES($1,$2,$3,600,400)",
        [asset, variant, bytes],
      );
    await p.query(
      "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id)VALUES($1,$2,$3,$4)",
      [product, asset, shop, seedIds.merchantB],
    );
    return { shop, department, slug };
  } finally {
    await p.end();
  }
}
async function login(page: Page) {
  const accounts = JSON.parse(
    await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"),
  ) as SeedAccounts;
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.ownerB.email);
  await page.getByLabel("Password", { exact: true }).fill(accounts.ownerB.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
}
test("semantic sections can be configured, previewed and published through native forms with safe text and keyboard labels", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const { shop, slug } = await setup();
  await login(page);
  await page.goto(`/shopkeeper/shops/${shop}/design`);
  await expect(page.getByRole("status")).toHaveText("Design loaded.");
  await page.getByRole("checkbox", { name: "Show Shoes department", exact: true }).uncheck();
  for (const type of [
    "entrance",
    "display",
    "collection",
    "story",
    "offer",
    "service_desk",
    "gallery",
    "contact",
  ]) {
    await page.getByLabel("New section type", { exact: true }).selectOption(type);
    if (type !== "contact")
      await page.getByLabel("New section title", { exact: true }).fill(`P11 ${type}`);
    if (["entrance", "story", "offer", "service_desk"].includes(type))
      await page
        .getByLabel("New section text", { exact: true })
        .fill(
          type === "story"
            ? "<script>window.p11Injected=true</script>"
            : "Fictional merchant information.",
        );
    if (["display", "gallery"].includes(type))
      await page.getByRole("checkbox", { name: "Featured shoe", exact: true }).check();
    await page.getByRole("button", { name: "Add section", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Add section", exact: true })).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved. Preview before publishing.");
  await page.getByRole("link", { name: "Preview saved draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "P11 gallery", exact: true })).toBeVisible();
  await expect(
    page.getByText("<script>window.p11Injected=true</script>", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => "p11Injected" in window)).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const snapshot = await page.locator(".canonical-shop").ariaSnapshot();
  expect(snapshot).toContain('heading "P11 entrance"');
  expect(snapshot).toContain("Fictional shoe photograph");
  await page.goto(`/shopkeeper/shops/${shop}/design`);
  await expect(page.getByRole("status")).toHaveText("Design loaded.");
  await page
    .getByRole("checkbox", { name: "I reviewed this saved draft and confirm publication" })
    .check();
  await page.getByRole("button", { name: "Publish reviewed draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Shop published.");
  await page.goto(`/shops/${slug}`);
  await expect(page.getByRole("heading", { name: "P11 gallery", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Shoes", exact: true }).focus();
  await expect(page.getByRole("link", { name: "Shoes", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Shoes", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({
    path: `docs/evidence/images/x2-p11-catalogue-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
test("public catalogue pages reach every item and offer a clear restart after concurrent merchant edits", async ({
  page,
}) => {
  const { shop, slug, department } = await setup();
  await login(page);
  const root = `/api/workspace/shops/${shop}/design`,
    state = await (await page.request.get(root)).json();
  expect(
    (
      await page.request.put(root, {
        headers: { origin },
        data: {
          version: state.version,
          summary: "Pagination fixture",
          specification: state.specification,
        },
      })
    ).status(),
  ).toBe(200);
  const saved = await (await page.request.get(root)).json();
  expect(
    (
      await page.request.post(`${root}/publish`, {
        headers: { origin },
        data: { version: saved.version, revision: saved.revision, confirm: true },
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/shops/${slug}/departments/shoes`);
  const seen = await page.locator(".canonical-product h3 a").allTextContents();
  await page.getByRole("link", { name: "Next products", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "First page", exact: true })).toBeVisible();
  seen.push(...(await page.locator(".canonical-product h3 a").allTextContents()));
  await page.getByRole("link", { name: "Next products", exact: true }).click();
  await expect(page.getByRole("link", { name: "Next products", exact: true })).toHaveCount(0);
  seen.push(...(await page.locator(".canonical-product h3 a").allTextContents()));
  expect(seen).toHaveLength(46);
  expect(new Set(seen).size).toBe(46);
  const stale = page.url(),
    p = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await p.query("UPDATE products SET position=position+1 WHERE shop_id=$1 AND department_id=$2", [
      shop,
      department,
    ]);
  } finally {
    await p.end();
  }
  await page.goto(stale);
  await expect(
    page.getByRole("heading", { name: "The catalogue has changed.", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Restart department", exact: true }).click();
  await expect(page.locator(".canonical-product")).toHaveCount(20);
});
test("media failure preserves canonical text and an accessible retry restores the normalized image", async ({
  page,
}) => {
  const { shop, slug } = await setup();
  await login(page);
  const root = `/api/workspace/shops/${shop}/design`,
    state = await (await page.request.get(root)).json();
  expect(
    (
      await page.request.put(root, {
        headers: { origin },
        data: {
          version: state.version,
          summary: "Media recovery fixture",
          specification: state.specification,
        },
      })
    ).status(),
  ).toBe(200);
  const saved = await (await page.request.get(root)).json();
  expect(
    (
      await page.request.post(`${root}/publish`, {
        headers: { origin },
        data: { version: saved.version, revision: saved.revision, confirm: true },
      })
    ).status(),
  ).toBe(200);
  const pattern = `**/api/public/shops/${shop}/media/**`;
  await page.route(pattern, (route) => route.abort("failed"));
  await page.goto(`/shops/${slug}/products/featured-shoe`);
  await expect(page.getByRole("heading", { name: "Featured shoe", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry image", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.unroute(pattern);
  await page.getByRole("button", { name: "Retry image", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("img", { name: "Fictional shoe photograph", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole("img", { name: "Fictional shoe photograph", exact: true })
        .evaluate((e) => (e as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
});
