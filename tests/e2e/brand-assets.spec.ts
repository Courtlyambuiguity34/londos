import { expect, test } from "@playwright/test";

test("website logos render and all three install manifests serve usable image assets", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const logos = page.locator("a[aria-label='Londos home'] img");
  await expect(logos).toHaveCount(2);
  for (const logo of await logos.all()) {
    await expect(logo).toBeVisible();
    await logo.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        logo.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
      )
      .toBe(true);
  }
  await expect(page.locator(".shopkeeper-link")).toHaveCount(0);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  const favicon = await page.locator('link[rel="icon"]').first().getAttribute("href");
  for (const path of [apple, favicon]) {
    expect(path).toBeTruthy();
    const response = await request.get(path!);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/");
  }
  for (const surface of ["public", "shopkeeper", "landlord"]) {
    const response = await request.get(`/pwa/${surface}/manifest.webmanifest`);
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === "maskable")).toBe(
      true,
    );
    for (const icon of manifest.icons) {
      const asset = await request.get(icon.src);
      expect(asset.ok()).toBe(true);
      expect(asset.headers()["content-type"]).toContain("image/png");
      // Verify real PNG dimensions, not merely manifest strings or a successful HTML fallback.
      const bytes = await asset.body();
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
    }
  }
});
