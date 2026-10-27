import { test, expect, type Page } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

test.use({ actionTimeout: 15_000 });
const categories = (page: Page) =>
  page.getByRole("navigation", { name: "Filter by category", exact: true });
const position = (page: Page) => categories(page).evaluate((element) => element.scrollLeft);
async function still(page: Page) {
  const before = await position(page);
  await page.waitForTimeout(350);
  expect(Math.abs((await position(page)) - before)).toBeLessThanOrEqual(1);
}
async function inspect(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (
      await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
    ).violations.map((entry) => ({ id: entry.id, nodes: entry.nodes.map((node) => node.target) })),
  ).toEqual([]);
}

test("overflowing categories loop seamlessly and pause for the reader, keyboard and manual scrolling", async ({
  page,
}) => {
  test.setTimeout(70_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  const rail = page.locator(".browse-rail--categories"),
    nav = categories(page);
  await nav.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(rail).toHaveAttribute("data-playing", "true");
  const start = await position(page);
  await expect.poll(() => position(page)).toBeGreaterThan(start + 5);
  await page.getByRole("button", { name: "Pause automatic scrolling", exact: true }).click();
  await expect(rail).toHaveAttribute("data-playing", "false");
  await still(page);
  const edge = await nav.evaluate((element) => {
    const first = element.querySelector<HTMLElement>(".browse-rail-group")!,
      repeat = element.querySelector<HTMLElement>(".browse-rail-repeat")!;
    const distance = repeat.offsetLeft - first.offsetLeft;
    element.scrollLeft = distance - 6;
    return { distance, position: element.scrollLeft };
  });
  expect(edge.position).toBeGreaterThan(edge.distance - 8);
  await page.getByRole("button", { name: "Resume automatic scrolling", exact: true }).click();
  await expect.poll(() => position(page)).toBeLessThan(35);
  await nav.hover();
  await expect(rail).toHaveAttribute("data-playing", "false");
  await still(page);
  await page.mouse.move(0, 0);
  await expect(rail).toHaveAttribute("data-playing", "true");
  // Screen readers and Tab see each destination once, not the visual repeat.
  await expect(nav.getByRole("link")).toHaveCount(7);
  const first = nav.getByRole("link", { name: "All shops", exact: true });
  await first.focus();
  await expect(rail).toHaveAttribute("data-playing", "false");
  await still(page);
  await page.keyboard.press("Tab");
  await expect(nav.getByRole("link", { name: "Fashion & style", exact: true })).toBeFocused();
  await nav
    .getByRole("link", { name: "Fashion & style", exact: true })
    .evaluate((element: HTMLElement) => element.blur());
  await nav.hover();
  await page.mouse.wheel(170, 0);
  await page.mouse.move(0, 0);
  await expect(rail).toHaveAttribute("data-playing", "false");
  await still(page);
  await expect(rail).toHaveAttribute("data-playing", "true", { timeout: 8000 });
  await page.getByRole("button", { name: "Pause automatic scrolling", exact: true }).click();
  await inspect(page);
  await mkdir("docs/evidence/images", { recursive: true });
  await nav.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await rail.screenshot({
    path: "docs/evidence/images/public-browsing-categories-390-2026-10-27.png",
  });
  await nav.getByRole("link", { name: "Local services", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL((url) => url.searchParams.get("category") === "services");
});

test("visual repeats keep working links and preserve the current search refinements", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/search?q=City&kind=product&availability=available");
  const nav = categories(page);
  await nav.scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Pause automatic scrolling", exact: true }).click();
  const repeated = nav.locator(".browse-rail-repeat a").filter({ hasText: "Fashion & style" });
  await repeated.click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("category") === "fashion" &&
      url.searchParams.get("q") === "City" &&
      url.searchParams.get("kind") === "product" &&
      url.searchParams.get("availability") === "available",
  );
  await expect(
    categories(page).getByRole("link", { name: "Fashion & style", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("fitting bars stay still and reduced-motion readers retain every category and keyboard link", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".browse-rail--categories")).toHaveAttribute("data-overflow", "false");
  await expect(
    page.getByRole("button", { name: "Pause automatic scrolling", exact: true }),
  ).toHaveCount(0);
  await inspect(page);
  await mkdir("docs/evidence/images", { recursive: true });
  await page.locator(".browse-rail--categories").screenshot({
    path: "docs/evidence/images/public-browsing-categories-1440-2026-10-27.png",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 850 });
  const rail = page.locator(".browse-rail--categories");
  await categories(page).scrollIntoViewIfNeeded();
  await expect(rail).toHaveAttribute("data-overflow", "true");
  await expect(rail).toHaveAttribute("data-playing", "false");
  await expect(
    page.getByRole("button", { name: "Pause automatic scrolling", exact: true }),
  ).toHaveCount(0);
  await still(page);
  await categories(page).getByRole("link", { name: "Local services", exact: true }).focus();
  await expect(
    categories(page).getByRole("link", { name: "Local services", exact: true }),
  ).toBeInViewport();
  await inspect(page);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL((url) => url.searchParams.get("category") === "services");
});

test("a phone swipe retains native scrolling, pauses motion during interaction and resumes afterwards", async ({
  browser,
}) => {
  test.setTimeout(30_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 850 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3101/");
    const nav = categories(page),
      rail = page.locator(".browse-rail--categories");
    await nav.scrollIntoViewIfNeeded();
    await expect(rail).toHaveAttribute("data-playing", "true");
    const before = await position(page),
      box = (await nav.boundingBox())!;
    const session = await context.newCDPSession(page),
      x = box.x + box.width - 25,
      y = box.y + box.height / 2;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await expect(rail).toHaveAttribute("data-playing", "false");
    for (const delta of [45, 95, 155]) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - delta, y }],
      });
      await page.waitForTimeout(35);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => position(page)).toBeGreaterThan(before + 40);
    await expect(rail).toHaveAttribute("data-playing", "false");
    await expect(rail).toHaveAttribute("data-playing", "true", { timeout: 8000 });
    const pause = page.getByRole("button", { name: "Pause automatic scrolling", exact: true });
    await pause.tap();
    await expect(rail).toHaveAttribute("data-playing", "false");
    await still(page);
    await session.detach();
  } finally {
    await context.close();
  }
});

test("category navigation works without JavaScript and does not create duplicate keyboard destinations", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 850 },
  });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3101/");
    await expect(categories(page).getByRole("link")).toHaveCount(7);
    await expect(
      page.getByRole("button", { name: "Pause automatic scrolling", exact: true }),
    ).toHaveCount(0);
    await categories(page).getByRole("link", { name: "Home & living", exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("category") === "home");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await context.close();
  }
});
