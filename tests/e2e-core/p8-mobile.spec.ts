import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import type { SeedAccounts } from "../../src/server/db/seed";
test("mobile application form has usable labels, keyboard navigation and no overflow", async ({
  page,
}) => {
  const accounts = JSON.parse(
    await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"),
  ) as SeedAccounts;
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.ownerB.email);
  await page.getByLabel("Password", { exact: true }).fill(accounts.ownerB.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.goto("/shopkeeper/applications/new");
  await page.getByLabel("Business name", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Business category", { exact: true })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/images/x2-p8-application-mobile.png",
    fullPage: true,
  });
});
