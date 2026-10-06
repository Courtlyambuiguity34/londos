import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
test("mobile assistant supports keyboard, explicit review, bounded canonical preview and rejection", async ({
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
