import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
test("mobile owner analytics exposes labelled aggregates, window links and bounded layout", async ({
  page,
}) => {
  const a = JSON.parse(
    await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"),
  ) as SeedAccounts;
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(a.ownerA.email);
  await page.getByLabel("Password", { exact: true }).fill(a.ownerA.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.goto(`/shopkeeper/shops/${seedIds.shopA}/analytics`);
  await page.getByRole("link", { name: "7 days", exact: true }).focus();
  await expect(page.getByRole("link", { name: "7 days", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/days=7/);
  await expect(page.getByText(/Last 7 UTC calendar days/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/images/x2-p9-analytics-mobile.png",
    fullPage: true,
  });
});
