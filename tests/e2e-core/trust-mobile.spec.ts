import { test, expect } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { seedIds } from "../../src/server/db/seed";
test("mobile anonymous concern form is labelled, keyboard reachable and bounded", async ({
  page,
}) => {
  await page.goto(`/report/${seedIds.shopA}`);
  await expect(
    page.getByRole("heading", { name: "Report a shop concern", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Concern category", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("What happened?", { exact: true })).toBeFocused();
  await page
    .getByLabel("What happened?", { exact: true })
    .fill("Fictional mobile report with a privacy-aware local review.");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "docs/evidence/images/x2-p9-report-mobile.png", fullPage: true });
});
