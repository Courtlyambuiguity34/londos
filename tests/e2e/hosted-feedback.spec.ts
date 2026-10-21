import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public help and policies work on narrow mobile and desktop without management navigation", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/about", "/install", "/privacy", "/terms", "/sign-in?next=/landlord"]) {
      await page.goto(path);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${path} at ${width}`,
      ).toBe(true);
      await expect(page.locator('.site-footer a[href="/landlord"]')).toHaveCount(0);
      await expect(page.locator("a.shopkeeper-link")).toHaveCount(0);
    }
  }
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "How to use Londos" })).toBeVisible();
  await page.getByRole("link", { name: "Privacy policy", exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to registration" })).toHaveAttribute(
    "href",
    "/register",
  );
  for (const path of ["/about", "/install", "/privacy", "/terms", "/sign-in?next=/landlord"]) {
    await page.goto(path);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
  }
});

test("install prompt survives navigation from the home page and dismissal is handled", async ({
  page,
}) => {
  await page.goto("/");
  // Wait for the shared client layout to mount before providing a simulated browser event.
  await page.getByRole("link", { name: "Skip to content" }).focus();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
  await page
    .locator(".site-footer")
    .getByRole("link", { name: "Install Londos", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Install Londos", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Install Londos", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("You can install later");
});
