import { test, expect, type Page } from "./fixture";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import { generate } from "otplib";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { resolveActor } from "../../src/server/security/authorization";
import { seedIds } from "../../src/server/db/seed";
import { imageVariants } from "../../src/server/media";
import { saveDesign, publishDesign } from "../../src/server/shop-design";
import { shopThemes, applyShopTheme } from "../../src/modules/shop-themes/catalogue";
import type { ShopSpecification } from "../../src/modules/shop-design/specification";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
test.use({ actionTimeout: 15_000 });
const owner = {
  email: `themes-owner-${randomUUID()}@londos.invalid`,
  password: `Fictional-${randomUUID()}`,
};
const operator = {
  email: `themes-operator-${randomUUID()}@londos.invalid`,
  password: `Fictional-${randomUUID()}`,
};
const shops = new Map<
  string,
  { id: string; slug: string; department: string; product: string; cover: string }
>();
test.beforeAll(async ({ browserName }, info) => {
  void browserName;
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw Error("Disposable database required");
  const auth = createAuth(pool, coreConfig(), true);
  const people = await Promise.all(
    [owner, operator].map((account) =>
      auth.api.signUpEmail({ body: { ...account, name: "Fictional theme tester" } }),
    ),
  );
  const user = people[0]!.user.id;
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=ANY($1::text[])', [
    people.map((person) => person.user.id),
  ]);
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'operations'),($1,'finance')",
    [people[1]!.user.id],
  );
  const response = await auth.handler(
    new Request(`${coreConfig().baseURL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: coreConfig().baseURL, "content-type": "application/json" },
      body: JSON.stringify(owner),
    }),
  );
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const actor = await resolveActor(auth, new Headers({ cookie }));
  const merchant = randomUUID();
  await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Fictional Northline merchant')", [
    merchant,
  ]);
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    merchant,
    user,
  ]);
  const variants = await Promise.all(
    ["shop-fashion", "product-bag", "product-shoe"].map(async (name) =>
      imageVariants(
        await sharp(await readFile(`public/illustrations/${name}.svg`))
          .resize({ width: 1200 })
          .png()
          .toBuffer(),
        "image/png",
        AbortSignal.timeout(5000),
      ),
    ),
  );
  for (const theme of shopThemes) {
    const id = randomUUID(),
      slug = `theme-${theme.id}-${["north", "east", "south", "west"][info.workerIndex % 4]}`;
    await pool.query(
      "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category,tagline) SELECT $1,$2,mall_id,'Northline Goods',$3,'fashion','Considered pieces for everyday adventures. Discover our collection and find your next favourite.' FROM shops WHERE id=$4",
      [id, merchant, slug, seedIds.shopA],
    );
    await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [id]);
    await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [id]);
    await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [id]);
    const assets = [];
    for (let index = 0; index < 3; index++) {
      const asset = randomUUID();
      assets.push(asset);
      await pool.query(
        "INSERT INTO media_assets(id,shop_id,merchant_id,state,storage_key,created_by,alt,width,height) VALUES($1,$2,$3,'ready',$1::uuid::text,$4,$5,$6,$7)",
        [
          asset,
          id,
          merchant,
          user,
          `Fictional ${index === 0 ? "shop cover" : "product illustration"}`,
          variants[index]!.find((item) => item.variant === "display")!.width,
          variants[index]!.find((item) => item.variant === "display")!.height,
        ],
      );
      for (const variant of variants[index]!)
        await pool.query(
          "INSERT INTO media_blobs(asset_id,variant,bytes,width,height) VALUES($1,$2,$3,$4,$5)",
          [asset, variant.variant, variant.bytes, variant.width, variant.height],
        );
    }
    const departments = [randomUUID(), randomUUID()];
    let firstProduct = "";
    for (let index = 0; index < 2; index++) {
      await pool.query(
        "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) VALUES($1,$2,$3,$4,$5,$6)",
        [
          departments[index],
          id,
          merchant,
          index ? "Everyday essentials" : "Bags & carry",
          index ? "essentials" : "bags",
          index,
        ],
      );
      for (let item = 0; item < 3; item++) {
        const product = randomUUID();
        if (!firstProduct) firstProduct = product;
        await pool.query(
          "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,description,currency,price_minor,availability,position) VALUES($1,$2,$3,$4,'product',$5,$6,'An original illustrated fixture for storefront layout verification.','UGX',$7,'available',$8)",
          [
            product,
            id,
            merchant,
            departments[index],
            index ? `Everyday piece ${item + 1}` : `City carry ${item + 1}`,
            `piece-${index}-${item}`,
            String(25000 + item * 5000),
            item,
          ],
        );
        await pool.query(
          "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id) VALUES($1,$2,$3,$4)",
          [product, assets[index + 1], id, merchant],
        );
      }
    }
    const intro = {
      id: "intro",
      type: "entrance" as const,
      version: 1 as const,
      title: "Collected for everyday life.",
      body: "Explore our thoughtfully arranged collection and get in touch with the shop.",
    };
    const specification: ShopSpecification = applyShopTheme(
      {
        schemaVersion: 1,
        theme: "earth",
        announcement: "Explore the collection. Contact the shop for availability.",
        branding: { coverAssetId: assets[0]!, logoAssetId: null },
        spaces: [
          intro,
          { ...intro, id: "repeated-intro" },
          { id: "bags", type: "department", version: 1, departmentId: departments[0]!, limit: 6 },
          {
            id: "essentials",
            type: "department",
            version: 1,
            departmentId: departments[1]!,
            limit: 6,
          },
        ],
        actions: [],
      },
      theme.id,
    );
    const draft = await saveDesign(pool, actor, id, {
      version: 0,
      summary: "Fictional theme preview",
      specification,
    });
    await publishDesign(pool, actor, id, { ...draft, confirm: true });
    shops.set(theme.id, {
      id,
      slug,
      department: departments[0]!,
      product: firstProduct,
      cover: assets[0]!,
    });
  }
});
test.afterAll(async () => pool.end());
async function login(page: Page, account = owner, next = "/shopkeeper") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function inspect(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
    ).violations.map((value) => ({ id: value.id, nodes: value.nodes.map((node) => node.target) })),
  ).toEqual([]);
}
async function shot(page: Page, name: string) {
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({ path: `docs/evidence/images/${name}-2026-10-26.png`, fullPage: true });
}

test("all six original themes render real catalogue links, one introduction and responsive collection/product layouts", async ({
  page,
}) => {
  test.setTimeout(150_000);
  for (const theme of shopThemes) {
    const shop = shops.get(theme.id)!;
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/shops/${shop.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Northline Goods");
      await expect(
        page.getByRole("heading", { name: "Collected for everyday life.", exact: true }),
      ).toHaveCount(1);
      await expect(page.locator(".storefront")).toHaveClass(new RegExp(`storefront-${theme.id}`));
      await expect
        .poll(() =>
          page
            .locator(".storefront-cover img")
            .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
        )
        .toBe(true);
      await expect(page.locator(".canonical-product")).toHaveCount(6);
      await inspect(page);
      await shot(page, `theme-${theme.id}-${width}`);
    }
    await page.getByRole("link", { name: "Bags & carry", exact: false }).last().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bags & carry");
    await expect(page.locator(".canonical-product")).toHaveCount(3);
    await page.getByRole("link", { name: "City carry 1", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("City carry 1");
    await inspect(page);
  }
});

test("theme selection, section cleanup and review preserve drafts and require explicit publication", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const shop = shops.get("atelier")!,
    base = `/shopkeeper/shops/${shop.id}/design`;
  await login(page);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.goto(base);
  await page.getByRole("button", { name: "Use Harvest", exact: true }).click();
  await expect(page.getByRole("note").filter({ hasText: "unsaved design changes" })).toBeVisible();
  await page.getByRole("tab", { name: /^Branding/ }).click();
  await page
    .getByLabel("Shop announcement", { exact: true })
    .fill("Our merchant-written announcement.");
  await page.getByRole("tab", { name: /^Sections/ }).click();
  await page
    .getByRole("button", { name: "Remove repeated sections from draft", exact: true })
    .click();
  const section = page.locator(".editor-section-card").first();
  await section.locator("summary").click();
  await section.getByLabel("Section text", { exact: true }).fill("");
  await section
    .getByLabel("Section text", { exact: true })
    .fill("A story written and edited by the merchant.");
  await page.getByRole("tab", { name: /^Branding/ }).click();
  await expect(page.getByLabel("Shop announcement", { exact: true })).toHaveValue(
    "Our merchant-written announcement.",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved.");
  expect(await (await request.get(`/shops/${shop.slug}`)).text()).toContain("storefront-atelier");
  await page.getByRole("link", { name: "Preview saved draft", exact: true }).click();
  await expect(page.locator(".storefront")).toHaveClass(/storefront-harvest/);
  await expect(
    page.getByText("A story written and edited by the merchant.", { exact: true }),
  ).toBeVisible();
  await page.goto(`${base}#review`);
  await page
    .getByRole("checkbox", {
      name: "I reviewed this saved draft and confirm publication",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Publish reviewed draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Shop published.");
  await page.goto(`/shops/${shop.slug}`);
  await expect(page.locator(".storefront")).toHaveClass(/storefront-harvest/);
  await page.goto(base);
  await shot(page, "theme-picker-desktop");
  await page.setViewportSize({ width: 390, height: 900 });
  await inspect(page);
  await shot(page, "theme-picker-mobile");
  await page.goto(`/shopkeeper/shops/${shop.id}/catalogue`);
  await expect(page.getByRole("tabpanel", { name: "Products", exact: true })).toBeVisible();
  await page
    .getByLabel("Product or service name", { exact: true })
    .fill("Keep this unsaved product");
  const tabs = page.getByRole("tablist", { name: "Catalogue sections" });
  await tabs.getByRole("tab", { name: /^Images/ }).click();
  await expect(page.getByRole("tabpanel", { name: "Images", exact: true })).toBeVisible();
  await tabs.getByRole("tab", { name: /^Products/ }).click();
  await expect(page.getByLabel("Product or service name", { exact: true })).toHaveValue(
    "Keep this unsaved product",
  );
  await tabs.getByRole("tab", { name: /^Products/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tabpanel", { name: "Departments", exact: true })).toBeVisible();
  await inspect(page);
  await shot(page, "catalogue-focused-panels-mobile");
});

test("landlord forms separate payments, campaigns and promotions without losing entered values", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page, operator, "/landlord");
  await expect(page).toHaveURL(/\/security$/);
  await page.getByLabel("Confirm your password", { exact: true }).fill(operator.password);
  await page.getByRole("button", { name: "Set up MFA", exact: true }).click();
  const setup = page.getByLabel("Authenticator setup URI", { exact: true });
  await expect(setup).toBeVisible();
  const secret = new URL(await setup.inputValue()).searchParams.get("secret")!;
  await page.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
  await page.getByRole("button", { name: "Verify MFA", exact: true }).click();
  await expect(page).toHaveURL(/\/security\?verified=1$/);
  await page.goto("/landlord/communications");
  await page.getByLabel("Support email", { exact: true }).fill("fictional-support@londos.invalid");
  const tabs = page.getByRole("tablist", { name: "Communications tools" });
  await tabs.getByRole("tab", { name: /^Email campaigns/ }).click();
  await page.getByLabel("Subject", { exact: true }).fill("Keep this unsent campaign");
  await tabs.getByRole("tab", { name: /^Promotions/ }).click();
  await page.getByLabel("Promo code", { exact: true }).fill("FICTIONAL_OFFER");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of [/^Payment details/, /^Email campaigns/, /^Promotions/]) {
      await tabs.getByRole("tab", { name }).click();
      await inspect(page);
    }
  }
  await tabs.getByRole("tab", { name: /^Payment details/ }).click();
  await expect(page.getByLabel("Support email", { exact: true })).toHaveValue(
    "fictional-support@londos.invalid",
  );
  await shot(page, "landlord-payment-panels-mobile");
  await tabs.getByRole("tab", { name: /^Email campaigns/ }).click();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "Keep this unsent campaign",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await shot(page, "landlord-campaign-panels-desktop");
  expect(
    (
      await pool.query("SELECT count(*)::int AS n FROM email_campaigns WHERE subject=$1", [
        "Keep this unsent campaign",
      ])
    ).rows[0].n,
  ).toBe(0);
});
