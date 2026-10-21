import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const width of [320, 390, 430]) {
  test(`mobile menu is complete, keyboard accessible and bounded at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/");
    const trigger = page.locator(".mobile-navigation summary");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const nav = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(nav).toBeVisible();
    for (const name of [
      "Explore shops",
      "Our mall",
      "Open your shop",
      "Sign in",
      "Fashion & style",
    ])
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Shopkeeper", exact: true })).toHaveCount(0);
    for (const link of await nav.getByRole("link").all())
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).include(".site-header").analyze()).violations).toEqual(
      [],
    );
    await nav.getByRole("link", { name: "Sign in", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(nav).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await nav.getByRole("link", { name: "Fashion & style", exact: true }).click();
    await expect(page).toHaveURL(/\/categories\/fashion$/);
    await expect(nav).not.toBeVisible();
  });
}
