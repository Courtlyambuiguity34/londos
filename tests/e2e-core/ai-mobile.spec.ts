import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { seedIds } from "../../src/server/db/seed";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
let account: { email: string; password: string };
test.beforeAll(async () => {
  // The full desktop suite intentionally stresses the shared owner's sign-in budget.
  // A separate authorized designer keeps this UI test independent of that history.
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw new Error("Disposable browser database required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    account = {
      email: `mobile-designer-${randomUUID()}@londos.invalid`,
      password: `Fictional-${randomUUID()}`,
    };
    const created = await createAuth(pool, coreConfig(), true).api.signUpEmail({
      body: { ...account, name: "Fictional mobile designer" },
    });
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    await pool.query(
      "INSERT INTO memberships(merchant_id,user_id,role,permissions) VALUES($1,$2,'staff',ARRAY['design'])",
      [seedIds.merchantA, created.user.id],
    );
    await pool.query(
      "INSERT INTO staff_shop_grants(merchant_id,user_id,shop_id,permissions) VALUES($1,$2,$3,ARRAY['design'])",
      [seedIds.merchantA, created.user.id, seedIds.shopA],
    );
  } finally {
    await pool.end();
  }
});
test("mobile assistant supports keyboard, explicit review, bounded canonical preview and rejection", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.goto(`/shopkeeper/shops/${seedIds.shopA}/design/assistant`);
  await page
    .getByLabel("Describe your design change", { exact: true })
    .fill("Remove the call button");
  const button = page.getByRole("button", { name: "Propose design change", exact: true });
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("validated proposal");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/images/x2-p10-assistant-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Preview proposal", exact: true }).click();
  await expect(page.getByLabel("Private preview")).toContainText("Not saved");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Return to proposal review", exact: true }).click();
  await page.getByRole("button", { name: "Reject proposal", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Proposal rejected. Your saved design is unchanged.",
  );
});
