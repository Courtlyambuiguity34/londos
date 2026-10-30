import { test, expect, type Page } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Pool } from "pg";
import sharp from "sharp";
import { generate } from "otplib";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
let accounts: SeedAccounts;
let reviewer: { email: string; password: string };
const headers = { Origin: "http://127.0.0.1:3101" };
test.beforeAll(async () => {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw Error("Disposable database required");
  accounts = JSON.parse(await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"));
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  try {
    reviewer = {
      email: `review-${randomUUID()}@londos.invalid`,
      password: `Fictional-${randomUUID()}`,
    };
    const created = await createAuth(db, coreConfig(), true).api.signUpEmail({
      body: { ...reviewer, name: "Journey reviewer" },
    });
    await db.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    await db.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'review')", [
      created.user.id,
    ]);
    // Independent queue fixture; the preceding browser scenario exercises real submission.
    await db.query(
      "INSERT INTO applications(id,merchant_id,applicant_id,state,business_name,submitted_at) VALUES($1,$2,$3,'submitted','Journey queue review business',now())",
      [randomUUID(), seedIds.merchantA, accounts.ownerA.id],
    );
  } finally {
    await db.end();
  }
});
async function login(
  page: Page,
  account: { email: string; password: string },
  next = "/shopkeeper",
) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function photo() {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: "#809a65" } })
    .png()
    .toBuffer();
}
async function fillApplication(page: Page, name: string) {
  await page.getByLabel("Business name", { exact: true }).fill(name);
  await page.getByLabel("Business location", { exact: true }).fill("Kampala test market");
  await page
    .getByLabel("What does your business offer?", { exact: true })
    .fill("Fictional fresh produce for journey testing only.");
  await page
    .getByLabel("Business telephone, including country code", { exact: true })
    .fill("+256700000001");
  await page.getByRole("checkbox", { name: /I have read and agree/ }).check();
  await page
    .getByLabel("Private verification photo", { exact: true })
    .setInputFiles({ name: "private.png", mimeType: "image/png", buffer: await photo() });
}

test("photo-first product entry auto attaches processed images and offers an explicit hidden fallback", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const worker = spawn(process.execPath, ["dist/worker.mjs"], {
    stdio: "ignore",
    env: process.env,
  });
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, accounts.ownerA);
    await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    const base = `/shopkeeper/shops/${seedIds.shopA}`,
      root = `/api/workspace/shops/${seedIds.shopA}`;
    await page.goto(base);
    await page.getByRole("link", { name: "Add product", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${base}/products/new$`));
    await page
      .getByLabel("Product or service name", { exact: true })
      .fill("Journey photographed crop");
    let first = true;
    await page.route(`**/api/workspace/shops/${seedIds.shopA}/media/*`, async (route) => {
      if (first && route.request().method() === "PUT") {
        first = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"service_unavailable"}',
        });
      } else await route.continue();
    });
    await page
      .getByLabel("Take or choose a product photo", { exact: true })
      .setInputFiles({ name: "crop.png", mimeType: "image/png", buffer: await photo() });
    await expect(
      page.getByRole("status", { name: "Product photo status", exact: true }),
    ).toContainText("not uploaded completely");
    await expect(page.getByLabel("Product or service name", { exact: true })).toHaveValue(
      "Journey photographed crop",
    );
    await page
      .getByLabel("Take or choose a product photo", { exact: true })
      .setInputFiles({ name: "crop.png", mimeType: "image/png", buffer: await photo() });
    await expect(
      page.getByRole("status", { name: "Product photo status", exact: true }),
    ).toHaveText("Photo ready and selected for this product.", { timeout: 20_000 });
    const asset = await page.getByLabel("Product photo", { exact: true }).inputValue();
    expect(asset).toMatch(/^[a-f0-9-]{36}$/);
    await expect(page.getByRole("img", { name: "Selected product photo preview" })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await mkdir("docs/evidence/images", { recursive: true });
    await page.locator(".product-photo-picker").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "docs/evidence/images/photo-first-product-390-2026-10-30.png" });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "A few useful details", exact: true }),
    ).toBeFocused();
    await page.getByText("Create a department here", { exact: true }).click();
    await page.getByLabel("New department name", { exact: true }).fill("Journey harvest");
    await page.getByRole("button", { name: "Create & select department", exact: true }).click();
    await expect(
      page.getByRole("status", { name: "Product setup status", exact: true }),
    ).toHaveText("Department created and selected.");
    await page.getByLabel("Price (optional)", { exact: true }).fill("7500");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.setViewportSize({ width: 320, height: 780 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: "docs/evidence/images/product-review-320-2026-10-30.png" });
    await page.getByRole("button", { name: "Save product", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your product is saved", exact: true }),
    ).toBeVisible();
    expect(
      (
        await db.query(
          "SELECT p.price_minor::text AS price,pm.asset_id FROM products p JOIN product_media pm ON pm.product_id=p.id WHERE p.shop_id=$1 AND p.slug='journey-photographed-crop'",
          [seedIds.shopA],
        )
      ).rows[0],
    ).toMatchObject({ price: "7500", asset_id: asset });
    await page.getByRole("button", { name: "Add another product", exact: true }).click();
    await expect(page.getByLabel("Product or service name", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Product photo", { exact: true })).toHaveValue("");
    await page.getByLabel("Product or service name", { exact: true }).fill("Journey hidden crop");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("status", { name: "Product setup status", exact: true }),
    ).toContainText("Add a photo");
    await page.getByRole("button", { name: "Add the photo later", exact: true }).click();
    await expect(
      page.getByLabel("Department", { exact: true }).locator("option:checked"),
    ).toHaveText("Journey harvest");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Save hidden for later", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Saved for later", exact: true })).toBeVisible();
    expect(
      (
        await db.query(
          "SELECT availability FROM products WHERE shop_id=$1 AND slug='journey-hidden-crop'",
          [seedIds.shopA],
        )
      ).rows[0].availability,
    ).toBe("archived");
    await page.goto(base);
    await expect(page.getByRole("region", { name: "Shop photo check", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({
      path: "docs/evidence/images/shop-photo-readiness-2026-10-30.png",
      fullPage: true,
    });
    const rejected = await page.request.post(`${root}/products/guided`, {
      headers,
      data: {
        name: "Unsafe crop",
        slug: "unsafe-crop",
        departmentId: (
          await db.query("SELECT id FROM departments WHERE shop_id=$1 LIMIT 1", [seedIds.shopA])
        ).rows[0].id,
        kind: "product",
        description: "",
        currency: "UGX",
        priceMinor: null,
        availability: "available",
        mediaId: null,
        position: 0,
        version: 0,
      },
    });
    expect(rejected.status()).toBe(422);
    await page.goto(`${base}/catalogue#departments`);
    await page.getByRole("link", { name: "Add product to Journey harvest", exact: true }).click();
    await expect(page).toHaveURL(/products\/new\?department=/);
    await page
      .getByLabel("Product or service name", { exact: true })
      .fill("Preselected department draft");
    await page.getByRole("button", { name: "Add the photo later", exact: true }).click();
    await expect(
      page.getByLabel("Department", { exact: true }).locator("option:checked"),
    ).toHaveText("Journey harvest");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("link", { name: "Back to shop setup", exact: true }).click();
    await expect(page).toHaveURL(/products\/new\?department=/);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("link", { name: "Back to shop setup", exact: true }).click();
    await expect(page).toHaveURL(base);
    const foreign = await browser.newContext();
    try {
      const other = await foreign.newPage();
      await login(other, accounts.ownerB);
      await expect(other.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
      expect((await other.request.get(`${base}/products/new`)).status()).toBe(404);
    } finally {
      await foreign.close();
    }
  } finally {
    worker.kill("SIGTERM");
    if (worker.exitCode === null)
      await Promise.race([
        once(worker, "exit"),
        new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            worker.kill("SIGKILL");
            resolve();
          }, 5000);
          timer.unref();
        }),
      ]);
    await db.end();
  }
});

test("one application form uploads private evidence and submits; an upload failure keeps a resumable draft", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, accounts.ownerA);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.goto("/shopkeeper/applications/new");
  await fillApplication(page, "Journey one form business");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Send for review", exact: true }).click();
  await expect(page).toHaveURL(/\/shopkeeper\/applications\/[a-f0-9-]{36}$/);
  await expect(page.getByText("Application status: submitted", { exact: true })).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  const application = await page.request.get(`/api/workspace/applications/${id}`);
  expect((await application.json()).evidence).toHaveLength(1);
  await page.goto("/shopkeeper/applications/new");
  await fillApplication(page, "Journey resumable business");
  await page.route("**/api/workspace/applications/*/evidence/1", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 503, body: '{"error":"service_unavailable"}' });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Send for review", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "draft is saved, but the photo was not confirmed",
  );
  await expect(page.getByLabel("Business name", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send for review", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Continue your saved application →", exact: true }).click();
  await expect(page.getByText("Application status: draft", { exact: true })).toBeVisible();
});

test("landlord can filter review work and control optional application alerts with MFA", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page, reviewer, "/landlord");
  await expect(page).toHaveURL(/\/security$/);
  await page.getByLabel("Confirm your password", { exact: true }).fill(reviewer.password);
  await page.getByRole("button", { name: "Set up MFA", exact: true }).click();
  const secret = new URL(
    await page.getByLabel("Authenticator setup URI", { exact: true }).inputValue(),
  ).searchParams.get("secret")!;
  await page.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
  await page.getByRole("button", { name: "Verify MFA", exact: true }).click();
  await expect(page).toHaveURL(/verified=1/);
  await page.goto("/landlord/applications");
  const alerts = page.getByRole("checkbox", {
    name: "Email me when applications need review",
    exact: true,
  });
  await expect(alerts).not.toBeChecked();
  await alerts.check();
  await expect(
    page.getByRole("status", { name: "Application alert preference", exact: true }),
  ).toContainText("enabled");
  await page.reload();
  await expect(alerts).toBeChecked();
  await page.getByLabel("Find a business", { exact: true }).fill("Journey queue review business");
  await page.getByRole("button", { name: "Find applications", exact: true }).click();
  await expect(page.locator(".workspace-list li")).toHaveCount(1);
  await expect(page.locator(".workspace-list li")).toContainText("Journey queue review business");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.locator(".catalogue-filters").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/evidence/images/landlord-review-390-2026-10-30.png",
    fullPage: false,
  });
  await alerts.uncheck();
  await expect(
    page.getByRole("status", { name: "Application alert preference", exact: true }),
  ).toContainText("turned off");
});
