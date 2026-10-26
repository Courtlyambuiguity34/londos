import { test, expect, type Page } from "./fixture";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import { generate } from "otplib";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds } from "../../src/server/db/seed";
import { availableShopAddress } from "../../src/server/shop-address";
import { transaction } from "../../src/server/db/pool";
import { processMedia } from "../../src/server/media";
import { claim, acknowledge } from "../../src/server/jobs/queue";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const shop = randomUUID(),
  merchant = randomUUID();
let slug: string;
const owner = {
  email: `appearance-${randomUUID()}@londos.invalid`,
  password: `Fictional-${randomUUID()}`,
};
const operator = {
  email: `appearance-operator-${randomUUID()}@londos.invalid`,
  password: `Fictional-${randomUUID()}`,
};
const base = `/shopkeeper/shops/${shop}`;

test.beforeAll(async ({ browserName }, info) => {
  void browserName;
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw Error("Disposable database required");
  const authentication = createAuth(pool, coreConfig(), true);
  const accounts = await Promise.all(
    [owner, operator].map((account) =>
      authentication.api.signUpEmail({ body: { ...account, name: "Fictional workspace tester" } }),
    ),
  );
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=ANY($1::text[])', [
    accounts.map((account) => account.user.id),
  ]);
  await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Fictional workspace merchant')", [
    merchant,
  ]);
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    merchant,
    accounts[0]!.user.id,
  ]);
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'review'),($1,'finance'),($1,'operations'),($1,'jobs')",
    [accounts[1]!.user.id],
  );
  await transaction(pool, async (client) => {
    slug = await availableShopAddress(
      client,
      `Fictional Harvest Store ${["north", "south", "east", "west"][info.workerIndex % 4]}`,
    );
    await client.query(
      "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category,tagline) SELECT $1,$2,mall_id,'Fictional Harvest Store',$3,'food','A fictional shop for layout and image verification' FROM shops WHERE id=$4",
      [shop, merchant, slug, seedIds.shopA],
    );
  });
  await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [shop]);
  await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [shop]);
  await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [shop]);
});
test.afterAll(async () => pool.end());

async function login(page: Page, account = owner, next = "/shopkeeper") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function accessibleLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
    ).violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
}
async function screenshot(page: Page, name: string) {
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({
    path: `docs/evidence/images/${name}-themes-2026-10-26.png`,
    fullPage: true,
  });
}

test("merchant dashboard, catalogue and designer stay organised at desktop, tablet and small phone widths", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  for (const width of [1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/shopkeeper");
    await expect(page.getByRole("region", { name: "Your shop summary" })).toContainText(
      "Shops you manage",
    );
    await accessibleLayout(page);
    const dock = page.getByRole("navigation", { name: "Workspace shortcuts" });
    if (width <= 900) {
      await expect(dock).toBeVisible();
      await dock.getByRole("button", { name: "More", exact: true }).click();
      await expect(page.getByRole("button", { name: "Shop menu", exact: true })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await page
        .getByRole("navigation", { name: "Merchant sections", exact: true })
        .getByRole("link", { name: "Applications", exact: true })
        .click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shop applications");
    } else await expect(dock).toBeHidden();
    await page.goto(base);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fictional Harvest Store");
    await accessibleLayout(page);
    if (width === 1440 || width === 390) await screenshot(page, `workspace-shopkeeper-${width}`);
    for (const section of ["catalogue", "design"]) {
      await page.goto(`${base}/${section}`);
      if (section === "catalogue") await page.getByRole("tab", { name: /^Departments/ }).click();
      await expect(
        page.getByRole("button", {
          name: section === "catalogue" ? "Create department" : "Save draft",
          exact: true,
        }),
      ).toBeEnabled();
      await accessibleLayout(page);
      if (width === 1440 || width === 390) await screenshot(page, `workspace-${section}-${width}`);
    }
  }
  expect((await page.request.get("/api/operator/applications")).status()).toBe(403);
});

test("uploaded shop image is selected, previewed and published onto the main mall listing", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  await login(page);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.goto(`${base}/catalogue#images`);
  await expect(page.getByRole("button", { name: "Upload image", exact: true })).toBeEnabled();
  const bytes = await sharp({
    create: { width: 960, height: 480, channels: 3, background: "#af4d28" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Image file", { exact: true })
    .setInputFiles({ name: "fictional-cover.png", mimeType: "image/png", buffer: bytes });
  await page.getByLabel("Image description", { exact: true }).fill("Fictional harvest shop cover");
  const started = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/shops/${shop}/media`) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  const asset = await (await started).json();
  await expect(page.getByRole("status")).toContainText("Image uploaded.");
  await pool.query(
    "UPDATE jobs SET state='done',lease_token=NULL,lease_until=NULL WHERE state IN ('pending','running') AND NOT (kind='media.process' AND payload->>'assetId'=$1)",
    [asset.id],
  );
  const job = await claim(pool);
  expect(job?.payload.assetId).toBe(asset.id);
  await processMedia(pool, job!, AbortSignal.timeout(5000));
  expect(await acknowledge(pool, job!)).toBe(true);
  await expect(
    page.getByRole("img", { name: "Fictional harvest shop cover", exact: true }),
  ).toBeVisible();
  expect((await request.get(`/api/public/shops/${shop}/media/${asset.id}/card`)).status()).toBe(
    404,
  );
  await page.goto(`${base}/design`);
  await page.getByRole("tab", { name: /^Branding/ }).click();
  await page.getByLabel("Shop cover image", { exact: true }).selectOption(asset.id);
  await page.getByLabel("Shop logo", { exact: true }).selectOption(asset.id);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved.");
  await page.getByRole("link", { name: "Preview saved draft", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".storefront-cover img")
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await expect(page.locator(".storefront-logo img")).toBeVisible();
  expect((await request.get(`/api/public/shops/${shop}/media/${asset.id}/card`)).status()).toBe(
    404,
  );
  await page.goto(`${base}/design`);
  await page.getByRole("tab", { name: /^Review & publish/ }).click();
  await page
    .getByRole("checkbox", {
      name: "I reviewed this saved draft and confirm publication",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Publish reviewed draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Shop published.");
  await page.goto("/");
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Fictional Harvest Store", exact: true }) });
  await expect(
    card.getByRole("img", { name: "Fictional harvest shop cover", exact: true }),
  ).toBeVisible();
  expect(
    await card
      .locator("img")
      .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
  await screenshot(page, "mall-shop-cover-desktop");
  await page.setViewportSize({ width: 390, height: 900 });
  await accessibleLayout(page);
  await screenshot(page, "mall-shop-cover-mobile");
  await card.getByRole("link", { name: "Fictional Harvest Store", exact: false }).click();
  await expect(page).toHaveURL(new RegExp(`/shops/${slug}$`));
  await expect(page.locator(".storefront-cover img")).toBeVisible();
  await page.goto(`${base}/design`);
  await page.getByRole("tab", { name: /^Review & publish/ }).click();
  await page
    .getByRole("checkbox", {
      name: "I reviewed this saved draft and confirm publication",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Unpublish shop", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Shop unpublished.");
  expect((await request.get(`/api/public/shops/${shop}/media/${asset.id}/card`)).status()).toBe(
    404,
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Fictional Harvest Store", exact: true }),
  ).toHaveCount(0);
});

test("landlord dashboard and scoped operations retain clear mobile navigation and MFA protection", async ({
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
  for (const width of [1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/landlord");
    await expect(
      page.getByRole("heading", { name: "Manage your mall with clarity.", exact: true }),
    ).toBeVisible();
    await accessibleLayout(page);
    const navigation = page.getByRole("navigation", { name: "Management sections", exact: true });
    if (width <= 900)
      await page.getByRole("button", { name: "Management menu", exact: true }).click();
    await expect(navigation.getByRole("link", { name: "Privacy review", exact: true })).toHaveCount(
      0,
    );
    await expect(
      navigation.getByRole("link", { name: "Review applications", exact: true }),
    ).toBeVisible();
    if (width <= 900)
      await page.getByRole("button", { name: "Management menu", exact: true }).click();
    if (width === 1440 || width === 390) await screenshot(page, `workspace-landlord-${width}`);
    await page.goto("/landlord/operations");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mall and shop operations");
    await accessibleLayout(page);
    expect((await page.request.get(`/api/workspace/shops/${shop}`)).status()).toBe(404);
  }
});
