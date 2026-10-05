import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
test("mobile team controls support labels, keyboard access and bounded layout", async ({
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
  await page.goto(`/shopkeeper/merchants/${seedIds.merchantB}/team`);
  await expect(
    page.getByRole("heading", { name: "Manage Fictional Merchant B", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Invitee email", { exact: true }).focus();
  await expect(page.getByLabel("Invitee email", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Membership role", { exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({ path: "docs/evidence/images/x2-p8-team-mobile.png", fullPage: true });
});
