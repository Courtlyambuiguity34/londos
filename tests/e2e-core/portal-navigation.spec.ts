import { test, expect } from "./fixture";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds } from "../../src/server/db/seed";
import { availableShopAddress } from "../../src/server/shop-address";
import { transaction } from "../../src/server/db/pool";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const shop = randomUUID(),
  merchant = randomUUID();
let slug: string;
const account = {
  email: `portal-${randomUUID()}@londos.invalid`,
  password: `Fictional-${randomUUID()}`,
};
const staff = {
  email: `portal-staff-${randomUUID()}@londos.invalid`,
  password: `Fictional-${randomUUID()}`,
};
let staffId: string;
const base = `/shopkeeper/shops/${shop}`;
test.beforeAll(async () => {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw Error("Disposable test database required");
  const authentication = createAuth(pool, coreConfig(), true);
  const owner = await authentication.api.signUpEmail({
    body: { ...account, name: "Portal test owner" },
  });
  const employee = await authentication.api.signUpEmail({
    body: { ...staff, name: "Portal test staff" },
  });
  staffId = employee.user.id;
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=ANY($1::text[])', [
    [owner.user.id, staffId],
  ]);
  await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Portal test business')", [merchant]);
  await pool.query(
    "INSERT INTO memberships(merchant_id,user_id,role,permissions) VALUES($1,$2,'owner','{}'),($1,$3,'staff',ARRAY['finance'])",
    [merchant, owner.user.id, staffId],
  );
  await transaction(pool, async (client) => {
    slug = await availableShopAddress(client, "Portal test shop");
    await client.query(
      "INSERT INTO shops(id,merchant_id,mall_id,name,slug) SELECT $1,$2,mall_id,'Portal test shop',$3 FROM shops WHERE id=$4",
      [shop, merchant, slug, seedIds.shopA],
    );
  });
  await pool.query(
    "INSERT INTO staff_shop_grants(merchant_id,user_id,shop_id,permissions) VALUES($1,$2,$3,ARRAY['finance'])",
    [merchant, staffId, shop],
  );
  await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [shop]);
  await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [shop]);
  await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [shop]);
});
test.afterAll(async () => pool.end());

async function signIn(page: import("@playwright/test").Page, credentials = account) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
}

test("shop workspace is organised on desktop and mobile; search traps focus; unpublished shops are not advertised as live", async ({
  page,
}) => {
  await signIn(page);
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Portal test shop", exact: true }) });
  await expect(card).toContainText("Not published yet");
  await expect(card.getByRole("link", { name: "Open public shop" })).toHaveCount(0);
  await card.getByRole("link", { name: "Manage shop", exact: false }).click();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Portal test shop");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width <= 900) {
      const menu = page.getByRole("button", { name: "Shop menu" });
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
    }
    const navigation = page.getByRole("navigation", { name: "Merchant sections" });
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(
      navigation.getByRole("link", { name: "Shop overview", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Search workspace" }).click();
    const dialog = page.getByRole("dialog", { name: "Jump to workspace page" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox")).toBeFocused();
    await dialog.getByRole("textbox").fill("not-a-real-page");
    await expect(dialog).toContainText("No matching pages");
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.querySelector("dialog")!.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Search workspace" })).toBeFocused();
    const violations = (
      await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
    ).violations;
    expect(violations.map((violation) => violation.id)).toEqual([]);
    if (width !== 320) {
      if (width <= 900) await page.getByRole("button", { name: "Shop menu" }).click();
      await mkdir("docs/evidence/images", { recursive: true });
      await page.screenshot({
        path: `docs/evidence/images/shopkeeper-${width === 390 ? "mobile" : "desktop"}-2026-10-25.png`,
        fullPage: true,
      });
    }
  }
});

test("publishing activates the public link and address edits preserve redirects", async ({
  page,
}) => {
  await signIn(page);
  const draft = await page.request.put(`/api/workspace/shops/${shop}/design`, {
    headers: { origin: coreConfig().baseURL },
    data: {
      version: 0,
      summary: "Portal fixture design",
      specification: {
        schemaVersion: 1,
        theme: "earth",
        announcement: "Portal published fixture",
        spaces: [],
        actions: [],
      },
    },
  });
  expect(draft.status()).toBe(200);
  const saved = await draft.json();
  expect(
    (
      await page.request.post(`/api/workspace/shops/${shop}/design/publish`, {
        headers: { origin: coreConfig().baseURL },
        data: { ...saved, confirm: true, photosReviewed: true },
      })
    ).status(),
  ).toBe(200);
  await page.goto(base);
  const publicLink = page.getByRole("region", { name: "Public shop link" });
  await expect(publicLink).toContainText("Live on the mall");
  await expect(
    publicLink.getByRole("link", { name: "Open public shop", exact: false }),
  ).toHaveAttribute("href", `/shops/${slug}`);
  await publicLink.getByRole("link", { name: "Edit address", exact: true }).click();
  const clean = `portal-clean-${shop.slice(0, 8)}`;
  await page.getByLabel("Shop address (the part after /shops/)", { exact: true }).fill(clean);
  await page
    .getByLabel("Reason for changing the address")
    .fill("Fictional owner selects a readable address");
  await page.getByRole("checkbox", { name: "I confirm this shop address change" }).check();
  await page.getByRole("button", { name: "Save shop address", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Shop address saved");
  await page.goto(base);
  await expect(page.getByRole("region", { name: "Public shop link" })).toContainText(
    `/shops/${clean}`,
  );
  await page.goto(`/shops/${slug}`);
  await expect(page).toHaveURL(new RegExp(`/shops/${clean}$`));
  await expect(page.getByText("Portal published fixture", { exact: true })).toBeVisible();
  for (const path of ["/shopkeeper/applications/not-a-uuid", "/shopkeeper/invoices/not-a-uuid"])
    expect((await page.request.get(path)).status()).toBe(404);
  await pool.query(
    `UPDATE session SET "createdAt"=clock_timestamp()-interval '6 minutes'
     WHERE "userId"=(SELECT id FROM "user" WHERE email=$1)`,
    [account.email],
  );
  await page.goto(`${base}/address`);
  await expect(
    page.getByRole("heading", { name: "Confirm your identity", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save shop address", exact: true })).toHaveCount(0);
  const current = await (await page.request.get(`/api/workspace/shops/${shop}`)).json();
  expect(
    (
      await page.request.post(`/api/workspace/shops/${shop}/address`, {
        headers: { origin: coreConfig().baseURL },
        data: {
          slug: `${clean}-new`,
          version: current.version,
          reason: "Fictional stale-session change must fail",
          confirm: true,
        },
      })
    ).status(),
  ).toBe(403);
});

test("finance-only and design-only staff see their granted workspace without catalogue access", async ({
  page,
}) => {
  await signIn(page, staff);
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Portal test shop", exact: true }) });
  await expect(card.getByRole("link", { name: "Manage shop", exact: false })).toHaveAttribute(
    "href",
    `${base}/rent`,
  );
  await card.getByRole("link", { name: "Manage shop", exact: false }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rent & tenancy");
  expect((await page.request.get(`/api/workspace/shops/${shop}`)).status()).toBe(404);
  await pool.query(
    "UPDATE memberships SET permissions=ARRAY['design'] WHERE merchant_id=$1 AND user_id=$2",
    [merchant, staffId],
  );
  await pool.query(
    "UPDATE staff_shop_grants SET permissions=ARRAY['design'] WHERE shop_id=$1 AND user_id=$2",
    [shop, staffId],
  );
  await page.goto("/shopkeeper");
  await expect(card.getByRole("link", { name: "Manage shop", exact: false })).toHaveAttribute(
    "href",
    `${base}/design`,
  );
  await card.getByRole("link", { name: "Manage shop", exact: false }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Design & publish");
  await page.setViewportSize({ width: 1280, height: 900 });
  const nav = page.getByRole("navigation", { name: "Merchant sections" });
  await expect(nav.getByRole("link", { name: "Products & contacts", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Rent & invoices", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Upload or manage shop images", exact: false }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: /^Branding/ }).click();
  await expect(
    page.getByText("Ask a catalogue editor to upload images for this shop.", { exact: false }),
  ).toBeVisible();
});
