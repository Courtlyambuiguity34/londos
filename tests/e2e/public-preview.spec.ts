import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("anonymous search enters Annette’s shoes and keeps the rest of the shop accessible", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Good shops.");
  await expect(page.locator(".preview-notice")).toContainText("Fictional shops");
  await page.getByRole("searchbox", { name: "Search shops and what they sell" }).fill("shoes");
  await page.getByRole("button", { name: "Search the mall" }).click();
  await expect(page).toHaveURL(/\/search\?q=shoes/);
  await page.getByRole("link", { name: "Annette Fashion House", exact: true }).click();
  await expect(page).toHaveURL(/\/shops\/annette-fashion-house\/departments\/shoes/);
  await page.getByRole("link", { name: "Everyday canvas sneakers", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Everyday canvas sneakers");
  await expect(page.getByText("Illustrative sample price", { exact: true })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole("link", { name: "Explore the rest of the shop" }).click();
  await page
    .getByRole("navigation", { name: "Shop departments" })
    .getByRole("link", { name: "Dresses" })
    .click();
  await expect(
    page.getByRole("link", { name: "Terracotta wrap dress", exact: true }),
  ).toBeVisible();
});

test("categories filter and empty results provide a route back", async ({ page }) => {
  await page.goto("/categories/electronics");
  await expect(page.getByRole("link", { name: "Circuit & Co.", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Annette Fashion House", exact: true })).toHaveCount(
    0,
  );
  await page.goto("/search?q=unobtainium");
  await expect(
    page.getByRole("heading", { name: "A different direction, perhaps?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Explore the mall", exact: true }).first(),
  ).toBeVisible();
});

test("closed samples are absent from discovery and restricted details are unavailable", async ({
  page,
}) => {
  await page.goto("/search");
  await expect(page.getByRole("link", { name: "Studio Sunday", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Made by Kato", exact: true })).toHaveCount(0);
  await page.goto("/shops/studio-sunday");
  await expect(
    page.getByRole("heading", { name: "This shop is temporarily closed." }),
  ).toBeVisible();
  const response = await page.goto("/shops/studio-sunday/products/daily-care-serum");
  expect(response?.status()).toBe(404);
  await expect(page.locator("main")).not.toContainText("Daily care serum");
});

test("cross-shop product URLs and unknown departments return 404", async ({ page }) => {
  let response = await page.goto("/shops/rooted-home/products/everyday-canvas-sneakers");
  expect(response?.status()).toBe(404);
  response = await page.goto("/shops/annette-fashion-house/departments/unknown");
  expect(response?.status()).toBe(404);
});

test("private workspaces advertise their real capability without private records", async ({
  page,
}) => {
  for (const path of ["/shopkeeper", "/landlord"]) {
    await page.goto(path);
    await expect(
      page.getByText("This workspace is not open in the preview.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /approve|suspend|pay/i })).toHaveCount(0);
  }
});

test("keyboard users can skip directly to content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("primary pages have no automated WCAG A/AA violations or horizontal overflow", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/search?q=shoes",
    "/shops/annette-fashion-house",
    "/shops/annette-fashion-house/products/everyday-canvas-sneakers",
    "/rent-a-shop",
    "/help",
    "/shopkeeper",
  ]) {
    await page.goto(path);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      scan.violations,
      `${path}: ${JSON.stringify(scan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test("health discloses preview capability and mutation methods are not accepted", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    status: "preview",
    mode: "fixture-preview",
    database: false,
    authentication: false,
    transactions: false,
    ai: false,
  });
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect((await request.post("/api/health", { data: { approve: true } })).status()).toBe(405);
});
