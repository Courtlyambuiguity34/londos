import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { brevoMessage } from "../src/server/jobs/brevo";

// Fictional preview only: no env loader, credentials, authentication token or email send.
const origin = "https://londos.onrender.com";
const message = brevoMessage(
  {
    template: "campaign",
    to: "preview@londos.invalid",
    campaignId: "11111111-1111-4111-8111-111111111111",
    subject: "Your shop, all in one place.",
    body: "Good shops deserve to be discovered. Your Londos workspace brings your products, shop details and customer enquiries together.\n\nKeep your catalogue up to date and make it easier for people to find what makes your shop special.",
    ctaLabel: "Open your workspace",
    ctaPath: "/shopkeeper",
  },
  origin,
);
await mkdir("docs/previews", { recursive: true });
await writeFile("docs/previews/email-branding.html", message.html);

if (process.argv.includes("--check")) {
  const { chromium } = await import("@playwright/test");
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const logo = await readFile("public/brand/londos-logo.png");
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  try {
    for (const width of [320, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage();
      // Never fetch deployed content, tracking pixels or external assets during checks.
      await page.route("**/*", (route) =>
        route.request().url() === `${origin}/brand/londos-logo.png`
          ? route.fulfill({ contentType: "image/png", body: logo })
          : route.abort(),
      );
      await page.setContent(message.html, { waitUntil: "networkidle" });
      const layout = await page.evaluate(() => ({
        noOverflow: document.documentElement.scrollWidth <= innerWidth,
        logoLoaded: document.querySelector("img")!.naturalWidth > 0,
        buttonHeight: [...document.querySelectorAll("a")]
          .find((a) => a.textContent === "Open your workspace")!
          .getBoundingClientRect().height,
      }));
      assert(layout.noOverflow);
      assert(layout.logoLoaded);
      assert(layout.buttonHeight >= 44);
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.equal(accessibility.violations.length, 0);
      if (width === 390 || width === 1280)
        await page.screenshot({
          path: `docs/previews/email-branding-${width === 390 ? "mobile" : "desktop"}.png`,
          fullPage: true,
        });
      console.log(JSON.stringify({ width, ...layout, accessibilityViolations: 0 }));
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 320, height: 1000 } });
    const page = await context.newPage();
    await page.route("**/*", (route) => route.abort());
    await page.setContent(message.html, { waitUntil: "networkidle" });
    assert(await page.getByRole("heading", { name: "Your shop, all in one place." }).isVisible());
    assert(await page.getByRole("link", { name: "Open your workspace" }).isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log(JSON.stringify({ blockedImagesReadable: true }));
    await context.close();
  } finally {
    await browser.close();
  }
}
