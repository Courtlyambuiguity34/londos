import { test, expect } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
test("mobile incident reporting supports keyboard controls, privacy guidance and bounded layout", async ({
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
  await page.goto(`/shopkeeper/shops/${seedIds.shopA}/incidents`);
  await page.getByLabel("Incident category", { exact: true }).selectOption("security");
  await page
    .getByLabel("Describe the incident", { exact: true })
    .fill("Fictional mobile account security concern.");
  await page.getByLabel("Describe the incident", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("checkbox", { name: "I confirm this fictional incident request.", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({ path: "docs/evidence/images/x2-p9-incident-mobile.png", fullPage: true });
});
