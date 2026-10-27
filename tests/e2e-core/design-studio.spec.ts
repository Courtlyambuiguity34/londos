import { test, expect, type Page } from "./fixture";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds } from "../../src/server/db/seed";
import { imageVariants } from "../../src/server/media";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const merchant = randomUUID(),
  shop = randomUUID(),
  cover = randomUUID();
const account = {
  email: `studio-${randomUUID()}@londos.invalid`,
  password: `Fictional-${randomUUID()}`,
};
const root = `/api/workspace/shops/${shop}/design`,
  api = `${root}/assistant`,
  editor = `/shopkeeper/shops/${shop}/design`,
  studio = `${editor}/assistant`;
let owner: string, slug: string;
test.beforeAll(async () => {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw Error("Disposable browser database required");
  const created = await createAuth(pool, coreConfig(), true).api.signUpEmail({
    body: { ...account, name: "Fictional studio owner" },
  });
  owner = created.user.id;
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [owner]);
  await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Fictional design business')", [
    merchant,
  ]);
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    merchant,
    owner,
  ]);
  slug = `fictional-seed-${["meadow", "grove", "field", "garden"][test.info().workerIndex % 4]}`;
  await pool.query(
    "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category,tagline) VALUES($1,$2,$3,'Fictional Seed & Tools',$4,'food','Useful things for growing gardens')",
    [shop, merchant, seedIds.mallA, slug],
  );
  await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [shop]);
  await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [shop]);
  await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [shop]);
  const variants = await imageVariants(
    await sharp(await readFile("public/illustrations/shop-food.svg"))
      .resize({ width: 1000 })
      .png()
      .toBuffer(),
    "image/png",
    AbortSignal.timeout(5000),
  );
  const display = variants.find((item) => item.variant === "display")!;
  await pool.query(
    "INSERT INTO media_assets(id,shop_id,merchant_id,state,storage_key,created_by,alt,width,height) VALUES($1,$2,$3,'ready',$1::uuid::text,$4,'Fictional produce illustration',$5,$6)",
    [cover, shop, merchant, owner, display.width, display.height],
  );
  for (const variant of variants)
    await pool.query(
      "INSERT INTO media_blobs(asset_id,variant,bytes,width,height) VALUES($1,$2,$3,$4,$5)",
      [cover, variant.variant, variant.bytes, variant.width, variant.height],
    );
  const department = randomUUID();
  await pool.query(
    "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) VALUES($1,$2,$3,'Garden essentials','garden',0)",
    [department, shop, merchant],
  );
  for (const [index, name] of ["Seed selection", "Garden toolkit"].entries()) {
    const product = randomUUID();
    await pool.query(
      "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,description,currency,price_minor,availability,position) VALUES($1,$2,$3,$4,'product',$5,$6,'Fictional catalogue item.','UGX',25000,'available',$7)",
      [product, shop, merchant, department, name, `item-${index}`, index],
    );
    await pool.query(
      "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id) VALUES($1,$2,$3,$4)",
      [product, cover, shop, merchant],
    );
  }
});
test.afterAll(async () => pool.end());
async function login(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
}
async function freshDraft(page: Page) {
  const current = await (await page.request.get(root)).json();
  const response = await page.request.put(root, {
    headers: { origin: coreConfig().baseURL },
    data: {
      version: current.version,
      summary: "Fictional studio starting point",
      specification: {
        schemaVersion: 1,
        theme: "earth",
        announcement: "",
        branding: { coverAssetId: cover, logoAssetId: null },
        spaces: [],
        actions: [],
      },
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { version: number; revision: number };
}
async function propose(page: Page, instruction = "Use Mosaic theme") {
  const current = await (await page.request.get(root)).json();
  const response = await page.request.post(api, {
    headers: { origin: coreConfig().baseURL },
    data: {
      key: randomUUID(),
      version: current.version,
      instruction,
      externalConsent: false,
      qualityReview: false,
    },
  });
  expect(response.status()).toBe(200);
  return await response.json();
}
async function runningFixture(sourceId: string) {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO ai_design_requests(id,merchant_id,shop_id,actor_id,request_key,fingerprint,base_version,context_digest,lease_token,lease_until,status,expires_at,reserved_tokens,reserved_cost_microusd) SELECT $1,merchant_id,shop_id,actor_id,$2,fingerprint,base_version,context_digest,$3,clock_timestamp()+interval '40 seconds','running',clock_timestamp()+interval '15 minutes',0,0 FROM ai_design_requests WHERE id=$4",
    [id, randomUUID(), randomUUID(), sourceId],
  );
  return id;
}
async function layout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}
async function screenshot(page: Page, name: string, width: number) {
  if (width !== 1440 && width !== 390) return;
  await mkdir("docs/evidence/images", { recursive: true });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: `docs/evidence/images/design-studio-${name}-${width}-2026-10-27.png`,
    fullPage: true,
  });
}

test("local design directions preview on real phone/desktop canvases, apply as drafts and publish separately", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await login(page);
  const before = await freshDraft(page);
  await page.goto(studio);
  await page
    .getByRole("button", { name: "Create a nature-inspired storefront", exact: true })
    .click();
  await page.getByRole("button", { name: "Propose design change", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "A validated proposal is ready. Preview it before applying.",
  );
  expect((await (await page.request.get(root)).json()).version).toBe(before.version);
  const preview = await page
    .getByRole("link", { name: "Preview proposal", exact: true })
    .getAttribute("href");
  const headers = (await page.request.get(preview!)).headers();
  expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'self'");
  expect(headers["cache-control"]).toContain("no-store");
  expect((await request.get(preview!, { maxRedirects: 0 })).status()).toBe(307);
  expect((await page.request.get(editor)).headers()["x-frame-options"]).toBe("DENY");
  await page.getByRole("button", { name: "Preview here", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Proposed storefront preview"]');
  await expect(frame.locator(".canonical-shop")).toHaveClass(/storefront-botanica/);
  await expect(page.locator(".assistant-preview-loading")).toHaveCount(0);
  await page.getByRole("button", { name: "Proposal", exact: true }).click();
  await expect(page.locator(".assistant-preview-loading")).toHaveCount(0);
  expect(
    await frame
      .locator(".designer-hero")
      .evaluate(
        (element) =>
          element.getBoundingClientRect().top <
          document.querySelector("#shop-collections")!.getBoundingClientRect().top,
      ),
  ).toBe(true);
  await expect(
    frame.getByRole("heading", { level: 1, name: "Fictional Seed & Tools", exact: true }),
  ).toHaveCount(1);
  expect(
    await page
      .locator("iframe")
      .evaluate((element: HTMLIFrameElement) => element.contentWindow!.innerWidth),
  ).toBe(1100);
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  expect(
    await page
      .locator("iframe")
      .evaluate((element: HTMLIFrameElement) => element.contentWindow!.innerWidth),
  ).toBe(390);
  await page.getByRole("button", { name: "Saved draft", exact: true }).click();
  await expect(
    page.frameLocator('iframe[title="Saved draft preview"]').locator(".canonical-shop"),
  ).toHaveClass(/theme-earth/);
  await expect(page.locator(".assistant-preview-loading")).toHaveCount(0);
  await page.getByRole("button", { name: "Saved draft", exact: true }).click();
  await expect(page.locator(".assistant-preview-loading")).toHaveCount(0);
  await page.getByRole("button", { name: "Proposal", exact: true }).click();
  await expect(frame.locator(".canonical-shop")).toHaveClass(/storefront-botanica/);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await layout(page);
    await screenshot(page, "assistant", width);
  }
  await page
    .getByRole("checkbox", {
      name: "I previewed this proposal and confirm applying it as a draft.",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Apply reviewed proposal as draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Applied as a new draft");
  const draft = await (await page.request.get(root)).json();
  expect(draft.version).toBe(before.version + 1);
  expect(draft.publishedRevision).toBeNull();
  await page.goto(`${editor}#sections`);
  const hero = page
    .locator(".editor-section-card")
    .filter({ has: page.locator("small", { hasText: /^Welcome banner$/ }) });
  await hero.locator("summary").click();
  await hero.getByLabel("Section layout", { exact: true }).selectOption("editorial");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.getByRole("tab", { name: /Review & publish/ }).click();
  await page
    .getByRole("checkbox", {
      name: "I reviewed this saved draft and confirm publication",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Publish reviewed draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Shop published");
  await page.goto(`/shops/${slug}`);
  await expect(page.locator(".designer-hero--editorial")).toBeVisible();
  await expect(page.locator(".canonical-product")).toHaveCount(2);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await layout(page);
    await screenshot(page, "published", width);
  }
  expect(
    (
      await pool.query("SELECT count(*)::int AS count FROM ai_provider_attempts WHERE shop_id=$1", [
        shop,
      ])
    ).rows[0].count,
  ).toBe(0);
});

test("a reloaded running proposal keeps polling until complete, and cancellation re-enables the brief", async ({
  page,
}) => {
  await login(page);
  await freshDraft(page);
  const source = await propose(page),
    running = await runningFixture(source.id);
  await page.goto(studio);
  await expect(page.getByRole("button", { name: "Cancel request", exact: true })).toBeVisible();
  await pool.query(
    "UPDATE ai_design_requests target SET status='proposed',version=target.version+1,candidate=source.candidate,patches=source.patches,decisions=source.decisions,path=source.path FROM ai_design_requests source WHERE target.id=$1 AND source.id=$2",
    [running, source.id],
  );
  await expect(page.getByRole("status")).toContainText("A validated proposal is ready");
  await expect(page.getByRole("link", { name: "Preview proposal", exact: true })).toHaveAttribute(
    "href",
    `${studio}/${running}/preview`,
  );
  const cancel = await runningFixture(source.id);
  await page.reload();
  await page.getByRole("button", { name: "Cancel request", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Proposal cancelled");
  await expect(
    page.getByRole("button", { name: "Propose design change", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Describe your design change", { exact: true })).toBeEnabled();
  expect(
    (await pool.query("SELECT status FROM ai_design_requests WHERE id=$1", [cancel])).rows[0]
      .status,
  ).toBe("cancelled");
});

test("an interrupted submit reconciles the saved request without making a second proposal", async ({
  page,
}) => {
  await login(page);
  await freshDraft(page);
  await page.goto(studio);
  let key = "";
  await page.route(`**${api}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    key = route.request().postDataJSON().key;
    const actual = await route.fetch();
    expect(actual.status()).toBe(200);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "service_unavailable" }),
    });
  });
  await page.getByLabel("Describe your design change", { exact: true }).fill("Use Folio theme");
  await page.getByRole("button", { name: "Propose design change", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("A validated proposal is ready");
  await expect(page.getByRole("link", { name: "Preview proposal", exact: true })).toBeVisible();
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM ai_design_requests WHERE actor_id=$1 AND request_key=$2",
        [owner, key],
      )
    ).rows[0].count,
  ).toBe(1);
  await page.unroute(`**${api}`);
});

test("reference-only requests explain the limitation and let the merchant choose a usable direction", async ({
  page,
}) => {
  await login(page);
  await freshDraft(page);
  await page.goto(studio);
  await page
    .getByLabel("Describe your design change", { exact: true })
    .fill("I want the look of www.example.invalid which is my website");
  await page.getByRole("button", { name: "Propose design change", exact: true }).click();
  const decisions = page.getByRole("region", { name: "Design decisions", exact: true });
  await expect(decisions).toContainText("cannot open reference websites");
  await expect(
    page.getByRole("button", { name: "Apply reviewed proposal as draft", exact: true }),
  ).toHaveCount(0);
  await decisions
    .getByRole("button", { name: "Create a nature-inspired storefront", exact: true })
    .click();
  await page.getByRole("button", { name: "Propose design change", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("A validated proposal is ready");
});
