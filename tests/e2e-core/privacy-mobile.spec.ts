import { test, expect } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
test("mobile owner privacy download controls and confirmed cancellation remain accessible within the viewport", async ({
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
  await page.goto(`/shopkeeper/merchants/${seedIds.merchantA}/privacy`);
  await page.getByLabel("Export section", { exact: true }).focus();
  await expect(page.getByLabel("Export section", { exact: true })).toBeFocused();
  await page.getByLabel("Data to review", { exact: true }).selectOption(`history:${seedIds.shopA}`);
  await page
    .getByLabel("Why are you requesting this review?", { exact: true })
    .fill("Fictional mobile review of retained history.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Request privacy review", exact: true }).click();
  await expect(
    page.getByText("Request recorded. Manual review is required; no data has been erased."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel history request", exact: true }).click();
  await expect(
    page.getByText("Request cancelled. Any active retention hold remains."),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({ path: "docs/evidence/images/x2-p9-privacy-mobile.png", fullPage: true });
});
