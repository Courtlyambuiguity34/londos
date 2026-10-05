import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
let accounts: SeedAccounts;
test.beforeAll(async () => {
  accounts = JSON.parse(
    await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"),
  ) as SeedAccounts;
});
async function login(page: Page, account: SeedAccounts[keyof SeedAccounts]) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
}
const origin = "http://127.0.0.1:3101",
  root = `/api/workspace/shops/${seedIds.shopA}/design`;
test("manual templates, private preview, publication, canonical rollback and anonymous discovery work together", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await login(page, accounts.ownerA);
  const profile = await (await page.request.get(`/api/workspace/shops/${seedIds.shopA}`)).json();
  expect(
    (
      await page.request.patch(`/api/workspace/shops/${seedIds.shopA}`, {
        headers: { origin },
        data: {
          name: "Annette Fashion House",
          category: "fashion",
          tagline: "A fictional boutique.",
          version: profile.version,
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/shopkeeper/shops/${seedIds.shopA}/design`);
  await expect(page.getByRole("status")).toHaveText("Design loaded.");
  const choices = page.getByRole("checkbox", { name: /Show .* department/ });
  for (const choice of await choices.all()) if (await choice.isChecked()) await choice.uncheck();
  for (const name of ["Dresses", "Shoes", "Handbags", "New Arrivals"])
    await page.getByRole("checkbox", { name: `Show ${name} department`, exact: true }).check();
  await page.getByLabel("Shop theme", { exact: true }).selectOption("plum");
  await page
    .getByLabel("Shop announcement", { exact: true })
    .fill("A fictional boutique, arranged by its merchant.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved. Preview before publishing.");
  const state = await (await page.request.get(root)).json();
  const spaces = state.specification.spaces as { id: string; departmentId: string }[],
    departments = state.departments as { id: string; name: string }[];
  const section = (name: string) =>
    spaces.find((s) => departments.find((d) => d.id === s.departmentId)?.name === name)!.id;
  await page.getByLabel("Move section", { exact: true }).selectOption(section("Shoes"));
  await page.getByLabel("Before section", { exact: true }).selectOption(section("Handbags"));
  let releasePatch!: () => void;
  const patchPending = new Promise<void>((resolve) => {
    releasePatch = resolve;
  });
  await page.route(`**${root}/patch`, async (route) => {
    await patchPending;
    await route.continue();
  });
  await page.getByRole("button", { name: "Move section in draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saving draft…");
  await expect(
    page.getByRole("button", { name: "Preview saved draft", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("link", { name: "Preview saved draft", exact: true })).toHaveCount(0);
  releasePatch();
  await expect(page.getByRole("status")).toHaveText("Draft saved. Preview before publishing.");
  await page.unroute(`**${root}/patch`);
  await expect(
    page.getByRole("link", { name: "Preview saved draft", exact: true }),
  ).toHaveAttribute("href", `/shopkeeper/shops/${seedIds.shopA}/preview?revision=2`);
  await page.getByRole("link", { name: "Preview saved draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Annette Fashion House", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Private preview")).toContainText("Revision 2");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const guest = await browser.newContext(),
    anonymous = await guest.newPage();
  try {
    const denied = await anonymous.request.get(
      `/shopkeeper/shops/${seedIds.shopA}/preview?revision=2`,
      { headers: { RSC: "1" } },
    );
    expect(await denied.text()).not.toContain("fictional boutique");
    await page.goto(`/shopkeeper/shops/${seedIds.shopA}/design`);
    await expect(page.getByRole("status")).toHaveText("Design loaded.");
    await page
      .getByRole("checkbox", { name: "I reviewed this saved draft and confirm publication" })
      .check();
    await page.getByRole("button", { name: "Publish reviewed draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Shop published.");
    await anonymous.goto("/search?q=shoes");
    await anonymous.getByRole("link", { name: "Annette Fashion House", exact: true }).click();
    await expect(anonymous).toHaveURL(/\/departments\/shoes$/);
    await expect(anonymous.getByRole("heading", { name: "Shoes", exact: true })).toBeVisible();
    await anonymous.getByRole("link", { name: "Whole shop", exact: true }).click();
    await expect(
      anonymous.getByRole("heading", { name: "New Arrivals", exact: true }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page: anonymous }).analyze()).violations).toEqual([]);
    const catalogue = await (
        await page.request.get(`/api/workspace/shops/${seedIds.shopA}/catalogue`)
      ).json(),
      product = catalogue.products.find((p: { slug: string }) => p.slug === "sample-2");
    const changed = await page.request.patch(
      `/api/workspace/shops/${seedIds.shopA}/products/${product.id}`,
      {
        headers: { origin },
        data: {
          departmentId: product.department_id,
          kind: product.kind,
          name: product.name,
          slug: product.slug,
          description: product.description,
          currency: product.currency,
          priceMinor: "234000",
          availability: "available",
          position: product.position,
          mediaId: product.media_id,
          version: product.version,
        },
      },
    );
    expect(changed.status()).toBe(200);
    await page.getByLabel("Layout revision", { exact: true }).selectOption("1");
    await page.getByRole("button", { name: "Restore as new draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Draft saved. Preview before publishing.");
    await page
      .getByRole("checkbox", { name: "I reviewed this saved draft and confirm publication" })
      .check();
    await page.getByRole("button", { name: "Publish reviewed draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Shop published.");
    await anonymous.goto("/shops/annette-fashion-house/products/sample-2");
    await expect(anonymous.locator("main")).toContainText("234,000");
    const imageProduct = catalogue.products.find((p: { media_id: string | null }) => p.media_id);
    expect(imageProduct).toBeTruthy();
    const image = `/api/public/shops/${seedIds.shopA}/media/${imageProduct.media_id}/card`;
    const response = await anonymous.request.get(image);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/webp");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect((await anonymous.request.get(image.replace("/card", "/source"))).status()).toBe(404);
    await anonymous.goto(`/shops/annette-fashion-house/products/${imageProduct.slug}`);
    await expect(
      anonymous.getByRole("img", { name: "Fictional plum product image" }),
    ).toBeVisible();
    expect(
      await anonymous
        .getByRole("img", { name: "Fictional plum product image" })
        .getAttribute("srcset"),
    ).toContain("/card");
    await mkdir("docs/evidence/images", { recursive: true });
    for (const surface of [page, anonymous])
      await surface.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
    await anonymous.screenshot({
      path: "docs/evidence/images/x2-public-product.png",
      fullPage: true,
    });
    await page.screenshot({ path: "docs/evidence/images/x2-design-desktop.png", fullPage: true });
    const noJS = await browser.newContext({ javaScriptEnabled: false });
    try {
      const simple = await noJS.newPage();
      await simple.goto("/shops/annette-fashion-house");
      await expect(
        simple.getByRole("heading", { name: "Annette Fashion House", exact: true }),
      ).toBeVisible();
      await expect(simple.getByRole("heading", { name: "Shoes", exact: true })).toBeVisible();
    } finally {
      await noJS.close();
    }
    await page
      .getByRole("checkbox", { name: "I reviewed this saved draft and confirm publication" })
      .check();
    await page.getByRole("button", { name: "Unpublish shop", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Shop unpublished.");
    await anonymous.reload();
    await expect(anonymous.locator("main")).not.toContainText("Fictional plum product image");
    expect((await anonymous.request.get(image)).status()).toBe(404);
    await anonymous.goto("/search?q=shoes");
    await expect(
      anonymous.getByRole("link", { name: "Annette Fashion House", exact: true }),
    ).toHaveCount(0);
  } finally {
    await guest.close();
  }
});
test("all new design methods and private HTML/Flight deny foreign or anonymous access", async ({
  page,
  browser,
}) => {
  await login(page, accounts.ownerB);
  const spec = { schemaVersion: 1, theme: "earth", announcement: "", spaces: [], actions: [] };
  const handlers = [
    { method: "GET", path: "", body: undefined },
    { method: "PUT", path: "", body: { version: 0, summary: "Foreign", specification: spec } },
    { method: "POST", path: "/patch", body: { version: 1, patch: { op: "theme", theme: "blue" } } },
    { method: "POST", path: "/publish", body: { version: 1, revision: 1, confirm: true } },
    { method: "POST", path: "/rollback", body: { version: 1, revision: 1, summary: "Foreign" } },
    { method: "POST", path: "/unpublish", body: { version: 1, confirm: true } },
  ];
  const guest = await browser.newContext();
  try {
    for (const handler of handlers) {
      for (const [client, status] of [
        [page.request, 404],
        [guest.request, 401],
      ] as const) {
        const response = await client.fetch(`${root}${handler.path}`, {
          method: handler.method,
          headers: { origin },
          ...(handler.body ? { data: handler.body } : {}),
        });
        expect(response.status()).toBe(status);
        expect(await response.text()).not.toContain("Fictional design");
      }
    }
    for (const path of ["design", "preview"]) {
      const response = await page.request.get(`/shopkeeper/shops/${seedIds.shopA}/${path}`, {
        headers: { RSC: "1" },
      });
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain("fictional boutique");
    }
  } finally {
    await guest.close();
  }
});
