import { test, expect } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
test("mobile owner can preview and publish a safe theme without overflow", async ({ page }) => {
  const accounts = JSON.parse(
    await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"),
  ) as SeedAccounts;
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.ownerB.email);
  await page.getByLabel("Password", { exact: true }).fill(accounts.ownerB.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.goto(`/shopkeeper/shops/${seedIds.shopB}/design`);
  await expect(page.getByRole("status")).toHaveText("Design loaded.");
  await page.getByLabel("Shop theme", { exact: true }).selectOption("blue");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved. Preview before publishing.");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .getByRole("checkbox", { name: "I reviewed this saved draft and confirm publication" })
    .check();
  await page.getByRole("button", { name: "Publish reviewed draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Shop published.");
  await page.goto("/shops/merchant-b-studio");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
