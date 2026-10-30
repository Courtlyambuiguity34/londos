import { test, expect, type Page } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import sharp from "sharp";
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
  root = `/api/workspace/shops/${seedIds.shopA}`;
async function publishShopFixture(page: Page) {
  const response = await page.request.get(`${root}/design`);
  expect(response.status()).toBe(200);
  const design = await response.json();
  const saved = await page.request.put(`${root}/design`, {
    headers: { Origin: origin },
    data: {
      version: design.version,
      summary: "P5 public contact fixture",
      specification: design.specification,
    },
  });
  expect(saved.status()).toBe(200);
  const draft = await saved.json();
  const published = await page.request.post(`${root}/design/publish`, {
    headers: { Origin: origin },
    data: { version: draft.version, revision: draft.revision, confirm: true, photosReviewed: true },
  });
  expect(published.status()).toBe(200);
}
test("catalogue, contacts, native worker image processing and anonymous requests work together", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }),
    worker = spawn(process.execPath, ["dist/worker.mjs"], { stdio: "ignore", env: process.env });
  const guest = await browser.newContext();
  try {
    await login(page, accounts.ownerA);
    await publishShopFixture(page);
    await page.goto(`/shopkeeper/shops/${seedIds.shopA}/catalogue`);
    await page.getByRole("tab", { name: /^Departments/ }).click();
    await expect(
      page.getByRole("button", { name: "Create department", exact: true }),
    ).toBeEnabled();
    await page.getByLabel("Department name", { exact: true }).fill("Browser specials");
    await page.locator(".merchant-department-options > summary").click();
    await page.getByLabel("Department address", { exact: true }).fill("browser-specials");
    await page.getByRole("button", { name: "Create department", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Department saved.");
    await page.getByRole("tab", { name: /^Products/ }).click();
    await page.getByLabel("Product or service name", { exact: true }).fill("Browser sample shoes");
    await page.locator(".merchant-product-options > summary").click();
    await page.getByLabel("Product address", { exact: true }).fill("browser-sample-shoes");
    await page
      .getByLabel("Department", { exact: true })
      .selectOption({ label: "Browser specials" });
    await page.getByLabel("Description", { exact: true }).fill("A fictional catalogue item.");
    await page.getByLabel("Price (optional)", { exact: true }).fill("123000");
    await page.getByRole("button", { name: "Create product or service", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Product or service saved.");
    await page.getByRole("tab", { name: /^Images/ }).click();
    await page.getByLabel("Image file", { exact: true }).setInputFiles({
      name: "sample.png",
      mimeType: "image/png",
      buffer: await sharp({
        create: { width: 1200, height: 800, channels: 3, background: "#884466" },
      })
        .png()
        .toBuffer(),
    });
    await page
      .getByLabel("Image description", { exact: true })
      .fill("Fictional plum product image");
    await page.getByRole("button", { name: "Upload image", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Image uploaded. Processing will appear below.",
    );
    await expect(
      page.getByRole("img", { name: "Fictional plum product image", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("tab", { name: /^Products/ }).click();
    await page.getByRole("button", { name: "Edit Browser sample shoes", exact: true }).click();
    await page
      .getByLabel("Product photo", { exact: true })
      .selectOption({ label: "Fictional plum product image" });
    await page.getByRole("button", { name: "Save product or service", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Product or service saved.");
    await page.getByRole("tab", { name: /^Images/ }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Delete Fictional plum product image", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Remove this image from products");
    await page.getByRole("tab", { name: /^Images/ }).click();
    await page.getByLabel("Image file", { exact: true }).setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("<svg><script>sample</script></svg>"),
    });
    await page.getByLabel("Image description", { exact: true }).fill("Broken sample image");
    await page.getByRole("button", { name: "Upload image", exact: true }).click();
    await expect(
      page.getByText(
        "This image could not be processed. Choose a supported, undamaged image within the size limits above.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("img", { name: "Fictional plum product image", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /^Contact settings/ }).click();
    await page.getByLabel("Call number", { exact: true }).fill("+256700000001");
    await page.getByLabel("WhatsApp number", { exact: true }).fill("+256700000001");
    await page.getByLabel("Website", { exact: true }).fill("https://example.com");
    await page
      .getByLabel("Merchant payment instructions", { exact: true })
      .fill("Agree payment directly with this fictional merchant.");
    await page.getByRole("checkbox", { name: /Enable customer requests/ }).check();
    await page.getByLabel("Reason for this change", { exact: true }).fill("Browser fixture setup");
    await page.getByRole("button", { name: "Save contact settings", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Contact settings saved.");
    const publicPage = await guest.newPage();
    const response = await publicPage.goto(`/contact/${seedIds.shopA}`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(publicPage.getByRole("link", { name: "Call shop", exact: true })).toHaveAttribute(
      "href",
      "tel:+256700000001",
    );
    await expect(
      publicPage.getByRole("link", { name: "WhatsApp shop", exact: true }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    await publicPage.getByLabel("Your name", { exact: true }).fill("Browser sample customer");
    await publicPage
      .getByLabel("Email or international phone number", { exact: true })
      .fill("browser-sample@example.com");
    await publicPage
      .getByLabel("Message to the shop", { exact: true })
      .fill("Please confirm whether this sample is available.");
    await publicPage.getByRole("button", { name: "Send request", exact: true }).click();
    await expect(publicPage.getByRole("status")).toContainText("The shop must confirm any order");
    await publicPage.getByRole("button", { name: "Send request", exact: true }).click();
    await expect(publicPage.getByRole("status")).toContainText("Request received.");
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM guest_requests WHERE shop_id=$1 AND reply_to='browser-sample@example.com'",
          [seedIds.shopA],
        )
      ).rows[0].count,
    ).toBe(1);
    await page.reload();
    await page.getByRole("tab", { name: /^Customer requests/ }).click();
    await expect(
      page.getByRole("button", {
        name: "Acknowledge request from Browser sample customer",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Acknowledge request from Browser sample customer",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toHaveText("Request acknowledged.");
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    await mkdir("docs/evidence/images", { recursive: true });
    await page.screenshot({
      path: "docs/evidence/images/catalogue-task-panels-2026-10-26.png",
      fullPage: true,
    });
    await publicPage.screenshot({
      path: "docs/evidence/images/x2-guest-contact-themes-2026-10-26.png",
      fullPage: true,
    });
  } finally {
    await guest.close();
    worker.kill("SIGTERM");
    if (worker.exitCode === null)
      await Promise.race([
        once(worker, "exit"),
        new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            worker.kill("SIGKILL");
            resolve();
          }, 5000);
          timer.unref();
        }),
      ]);
    await pool.end();
  }
});
test("every new protected handler rejects foreign and anonymous requests; guest abuse is bounded", async ({
  page,
  browser,
  request,
}) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const ownerContext = await browser.newContext();
    try {
      const owner = await ownerContext.newPage();
      await login(owner, accounts.ownerA);
      await publishShopFixture(owner);
      const settings = await owner.request.get(`${root}/contacts`);
      expect(settings.status()).toBe(200);
      const current = await settings.json();
      // This abuse-boundary case must not depend on the prior catalogue test
      // having enabled intake successfully.
      const enabled = await owner.request.put(`${root}/contacts`, {
        headers: { Origin: origin },
        data: {
          version: current.version,
          phone: current.phone,
          whatsapp: current.whatsapp,
          website: current.website,
          fulfilment: current.fulfilment,
          paymentInstructions: current.payment_instructions,
          deliveryInstructions: current.delivery_instructions,
          enquiriesEnabled: true,
          reason: "P5 bounded enquiry fixture",
        },
      });
      expect(enabled.status()).toBe(200);
    } finally {
      await ownerContext.close();
    }
    await login(page, accounts.ownerB);
    const id = randomUUID(),
      department = "40000000-0000-4000-8000-000000000001";
    const product = {
      departmentId: department,
      kind: "product",
      name: "Attack",
      slug: "attack",
      description: "",
      currency: "UGX",
      priceMinor: "100",
      availability: "available",
      position: 0,
      mediaId: null,
      version: 0,
    };
    const contacts = {
      version: 0,
      phone: "",
      whatsapp: "",
      website: "",
      fulfilment: "contact",
      paymentInstructions: "",
      deliveryInstructions: "",
      enquiriesEnabled: false,
      reason: "Attack",
    };
    const attacks = [
      { method: "GET", path: "/catalogue" },
      {
        method: "POST",
        path: "/departments",
        data: { name: "Attack", slug: "attack", position: 0, archived: false, version: 0 },
      },
      {
        method: "PATCH",
        path: `/departments/${department}`,
        data: { name: "Attack", slug: "attack", position: 0, archived: false, version: 1 },
      },
      { method: "POST", path: "/products", data: product },
      { method: "POST", path: "/products/guided", data: product },
      { method: "PATCH", path: `/products/${id}`, data: { ...product, version: 1 } },
      { method: "GET", path: "/contacts" },
      { method: "PUT", path: "/contacts", data: contacts },
      { method: "GET", path: "/requests" },
      { method: "PATCH", path: `/requests/${id}`, data: { status: "closed", version: 1 } },
      { method: "GET", path: "/media" },
      {
        method: "POST",
        path: "/media",
        data: { contentType: "image/png", bytes: 1, alt: "Attack" },
      },
      { method: "PUT", path: `/media/${id}`, data: Buffer.from("x") },
      { method: "DELETE", path: `/media/${id}`, data: { version: 1 } },
      { method: "POST", path: `/media/${id}`, data: { version: 1 } },
      { method: "GET", path: `/media/${id}/thumbnail` },
    ];
    for (const attack of attacks) {
      const response = await page.request.fetch(root + attack.path, {
        method: attack.method,
        ...(attack.data ? { data: attack.data } : {}),
        headers: {
          Origin: origin,
          "Content-Type": attack.data instanceof Buffer ? "image/png" : "application/json",
        },
      });
      expect(response.status(), attack.path).toBe(404);
      const anonymous = await request.fetch(root + attack.path, {
        method: attack.method,
        ...(attack.data ? { data: attack.data } : {}),
        headers: {
          Origin: origin,
          "Content-Type": attack.data instanceof Buffer ? "image/png" : "application/json",
        },
      });
      expect(anonymous.status(), attack.path).toBe(401);
    }
    for (const method of ["GET", "PUT"]) {
      const options = {
        method,
        headers: { Origin: origin },
        ...(method === "PUT" ? { data: { enabled: true, version: 0 } } : {}),
      };
      expect((await page.request.fetch("/api/operator/review-alerts", options)).status()).toBe(403);
      expect((await request.fetch("/api/operator/review-alerts", options)).status()).toBe(401);
    }
    expect(
      (
        await page.request.put("/api/operator/review-alerts", {
          headers: { Origin: "https://attacker.example" },
          data: { enabled: true, version: 0 },
        })
      ).status(),
    ).toBe(403);
    const denial = await page.request.get(`/shopkeeper/shops/${seedIds.shopA}/catalogue`, {
      headers: { RSC: "1" },
    });
    expect(denial.status()).toBe(404);
    expect(await denial.text()).not.toContain("Fictional plum product image");
    const guestContext = await browser.newContext();
    try {
      let rateLimited = false;
      for (let i = 0; i < 12; i++) {
        const response = await guestContext.request.post(
          `/api/guest/shops/${seedIds.shopA}/requests`,
          {
            headers: { Origin: origin },
            data: {
              key: randomUUID(),
              kind: "enquiry",
              name: "Budget fixture",
              replyTo: "budget@example.com",
              message: "Sample",
              productId: null,
            },
          },
        );
        if (response.status() === 429) {
          rateLimited = true;
          break;
        }
        expect(response.status()).toBe(200);
      }
      expect(rateLimited).toBe(true);
    } finally {
      await guestContext.close();
    }
    const csrf = await request.post(`/api/guest/shops/${seedIds.shopA}/requests`, {
      headers: { Origin: "https://attacker.example" },
      data: {},
    });
    expect(csrf.status()).toBe(403);
    await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [
      seedIds.shopA,
    ]);
    try {
      await pool.query("DELETE FROM request_budgets WHERE key LIKE 'guest:%'");
      const denied = await request.post(`/api/guest/shops/${seedIds.shopA}/requests`, {
        headers: { Origin: origin },
        data: {
          key: randomUUID(),
          kind: "enquiry",
          name: "Sample",
          replyTo: "sample@example.com",
          message: "Sample",
          productId: null,
        },
      });
      expect(denied.status()).toBe(404);
    } finally {
      await pool.query("UPDATE shop_moderation SET state='clear' WHERE shop_id=$1", [
        seedIds.shopA,
      ]);
    }
  } finally {
    await pool.end();
  }
});
