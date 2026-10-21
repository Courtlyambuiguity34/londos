import { test, expect } from "./fixture";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
import AxeBuilder from "@axe-core/playwright";

test("merchant gets mobile navigation and an advisory setup checklist without foreign-shop access", async ({
  page,
}) => {
  const accounts = JSON.parse(
    await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"),
  ) as SeedAccounts;
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.ownerA.email);
  await page.getByLabel("Password", { exact: true }).fill(accounts.ownerA.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.locator(".mobile-navigation summary").click();
  await expect(
    page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "Shopkeeper", exact: true }),
  ).toBeVisible();
  await page.goto(`/shopkeeper/shops/${seedIds.shopA}`);
  await expect(page.getByRole("progressbar", { name: "Shop setup progress" })).toBeVisible();
  await expect(page.getByText(/Three products is a suggestion/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add three products or services", exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.request.get(`/api/workspace/shops/${seedIds.shopB}/catalogue`)).status()).toBe(
    404,
  );
});

test("guest can save a concern reference without downloading private upload access or report text", async ({
  page,
}) => {
  await page.goto(`/report/${seedIds.shopA}`);
  const message = "Fictional audit follow-up concern, private text must not enter the receipt.";
  await page.getByLabel("What happened?", { exact: true }).fill(message);
  await page.getByRole("checkbox").check();
  const posted = page.waitForRequest(
    (r) => r.url().endsWith("/api/guest/reports") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Send concern", exact: true }).click();
  const input = (await posted).postDataJSON();
  await expect(page.getByRole("heading", { name: "Your submission receipt" })).toBeVisible();
  await expect(page.locator(".report-receipt code")).toHaveText(input.key);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save receipt", exact: true }).click();
  const file = await download;
  const content = await readFile((await file.path())!, "utf8");
  expect(file.suggestedFilename()).toBe("londos-submission-receipt.txt");
  expect(content).toContain(input.key);
  expect(content).not.toContain(input.capability);
  expect(content).not.toContain(message);
  // Confirm the reference identifies the submitted report in this disposable DB.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    expect(
      (
        await pool.query("SELECT id FROM trust_reports WHERE id=$1 AND shop_id=$2", [
          input.key,
          seedIds.shopA,
        ])
      ).rowCount,
    ).toBe(1);
  } finally {
    await pool.end();
  }
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
});
