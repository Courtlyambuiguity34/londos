import { test, expect } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
test("mobile catalogue is accessible, bounded and denies an ungranted tenant", async ({ page }) => {
  const accounts = JSON.parse(
    await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"),
  ) as SeedAccounts;
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.staff.email);
  await page.getByLabel("Password", { exact: true }).fill(accounts.staff.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.goto(`/shopkeeper/shops/${seedIds.shopA}/catalogue`);
  await page.getByRole("tab", { name: /^Departments/ }).click();
  await expect(page.getByRole("button", { name: "Create department", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const response = await page.request.get(`/shopkeeper/shops/${seedIds.shopB}/catalogue`);
  expect(response.status()).toBe(404);
});
