import { test, expect } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import type { SeedAccounts } from "../../src/server/db/seed";
test("mobile owner can sign in, edit its profile and access account security without overflow", async ({
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
  await page.getByRole("link", { name: "Merchant B Studio", exact: true }).click();
  await page.getByLabel("Shop name", { exact: true }).fill("Mobile fixture shop B");
  await page.getByRole("button", { name: "Save shop profile", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved. Background processing is queued.");
  for (const path of ["/shopkeeper", "/security"]) {
    await page.goto(path);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
