import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import sharp from "sharp";
import { generate } from "otplib";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
let accounts: SeedAccounts,
  operator: { email: string; password: string },
  applicationId: string,
  invoiceId: string,
  shopId: string;
const origin = "http://127.0.0.1:3101",
  businessName = "Fictional P8 Browser Studio";
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  accounts = JSON.parse(await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"));
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw new Error("Requires isolated browser database");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    operator = {
      email: `p8-${randomUUID()}@londos.example`,
      password: `P8-browser-${randomUUID()}`,
    };
    const result = await createAuth(pool, coreConfig(), true).api.signUpEmail({
      body: { ...operator, name: "Fictional P8 finance operator" },
    });
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [result.user.id]);
    await pool.query(
      "INSERT INTO operator_grants(user_id,permission) VALUES($1,'review'),($1,'finance')",
      [result.user.id],
    );
  } finally {
    await pool.end();
  }
});
async function login(
  page: Page,
  account: { email: string; password: string },
  next = "/shopkeeper",
) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("owner application, native MFA review, partial settlement, publication, reversal and renewal form one journey", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const opContext = await browser.newContext(),
    op = await opContext.newPage(),
    guest = await browser.newContext(),
    publicPage = await guest.newPage();
  try {
    await login(page, accounts.ownerA);
    await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    await page.goto("/shopkeeper/applications/new");
    await page.getByLabel("Business name", { exact: true }).fill(businessName);
    await page.getByLabel("Business location", { exact: true }).fill("Kampala fictional studio");
    await page
      .getByLabel("What does your business offer?", { exact: true })
      .fill("Fictional handmade shoes and repairs for this development journey.");
    await page
      .getByLabel("Business telephone, including country code", { exact: true })
      .fill("+256700000008");
    await page.getByLabel("Merchant account", { exact: true }).selectOption(seedIds.merchantA);
    await page.getByRole("button", { name: "Create application draft", exact: true }).click();
    await expect(page).toHaveURL(/\/shopkeeper\/applications\/[a-f0-9-]{36}$/);
    applicationId = new URL(page.url()).pathname.split("/").at(-1)!;
    const image = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "#8f798f" },
    })
      .png()
      .toBuffer();
    await page
      .getByLabel("Verification image (JPEG, PNG or WebP, up to 2 MiB)", { exact: true })
      .setInputFiles({ name: "fictional-evidence.png", mimeType: "image/png", buffer: image });
    await page.getByRole("button", { name: "Save private image", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Private verification image saved.");
    await page
      .getByRole("checkbox", { name: "I reviewed the details and confirm submission" })
      .check();
    await page.getByRole("button", { name: "Submit application", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Application submitted for review.");
    await login(op, operator, "/landlord");
    await expect(op).toHaveURL(/\/security$/);
    await op.getByLabel("Confirm your password", { exact: true }).fill(operator.password);
    await op.getByRole("button", { name: "Set up MFA", exact: true }).click();
    const uri = await op.getByLabel("Authenticator setup URI", { exact: true }).inputValue(),
      secret = new URL(uri).searchParams.get("secret")!;
    await op.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
    await op.getByRole("button", { name: "Verify MFA", exact: true }).click();
    await expect(op).toHaveURL(/verified=1/);
    expect((await op.request.get(`/api/operator/applications/${applicationId}`)).status()).toBe(
      404,
    );
    await op.goto("/landlord/applications");
    await op
      .locator(".workspace-list li")
      .filter({ hasText: businessName })
      .getByRole("button", { name: "Claim and open", exact: true })
      .click();
    await expect(
      op.getByRole("heading", { name: `Review ${businessName}`, exact: true }),
    ).toBeVisible();
    expect(
      (await op.request.get(`/api/operator/applications/${applicationId}/evidence/1`)).headers()[
        "cache-control"
      ],
    ).toContain("no-store");
    await op.getByLabel("Decision", { exact: true }).selectOption("approved");
    await op
      .getByLabel("Reason for the decision", { exact: true })
      .fill("Fictional evidence independently reviewed");
    await op
      .getByRole("checkbox", { name: "I reviewed the evidence and confirm this decision" })
      .check();
    await op.getByRole("button", { name: "Save review decision", exact: true }).click();
    await expect(op.getByRole("status")).toHaveText("Review decision saved.");
    await op.goto("/landlord/rent");
    await op
      .locator(".workspace-list li")
      .filter({ hasText: businessName })
      .getByRole("button", { name: "Claim and open", exact: true })
      .click();
    await op.getByRole("link", { name: /^LON-/ }).click();
    await expect(op).toHaveURL(/\/landlord\/invoices\/[a-f0-9-]{36}$/);
    invoiceId = new URL(op.url()).pathname.split("/").at(-1)!;
    for (let n = 1; n <= 2; n++) {
      await op
        .getByLabel("Invoice reference from the payment record", { exact: true })
        .fill(`LON-${invoiceId.replaceAll("-", "").toUpperCase()}`);
      await op.getByLabel("Amount in UGX (whole shillings)", { exact: true }).fill("2500");
      await op
        .getByLabel("Unique receipt or waiver reference", { exact: true })
        .fill(`P8-BROWSER-${n}-${randomUUID()}`);
      await op
        .getByLabel("Verification reason", { exact: true })
        .fill("Compared with fictional manual collection ledger");
      await op
        .getByRole("checkbox", {
          name: "I independently verified this development credit and confirm recording it",
        })
        .check();
      await op.getByRole("button", { name: "Record verified credit", exact: true }).click();
      await expect(op.getByRole("status")).toHaveText("Development credit recorded.");
      const invoice = await (await op.request.get(`/api/operator/invoices/${invoiceId}`)).json();
      if (n === 1) expect(invoice.invoice.shop_id).toBeNull();
      else shopId = invoice.invoice.shop_id;
    }
    await mkdir("docs/evidence/images", { recursive: true });
    await op.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo(0, 0);
    });
    await op.screenshot({ path: "docs/evidence/images/x2-p8-rent-ledger.png", fullPage: true });
    expect((await new AxeBuilder({ page: op }).analyze()).violations).toEqual([]);
    await page.goto(`/shopkeeper/invoices/${invoiceId}`);
    await page.getByRole("link", { name: "Open your shop workspace", exact: true }).click();
    await expect(page.getByRole("heading", { name: businessName, exact: true })).toBeVisible();
    const department = await (
      await page.request.post(`/api/workspace/shops/${shopId}/departments`, {
        headers: { origin },
        data: { name: "Shoes", slug: "shoes", position: 0, archived: false, version: 0 },
      })
    ).json();
    expect(department.id).toBeTruthy();
    expect(
      (
        await page.request.post(`/api/workspace/shops/${shopId}/products`, {
          headers: { origin },
          data: {
            departmentId: department.id,
            kind: "product",
            name: "P8 sample shoes",
            slug: "sample-shoes",
            description: "Fictional lifecycle product",
            currency: "UGX",
            priceMinor: "15000",
            availability: "available",
            position: 0,
            mediaId: null,
            version: 0,
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.put(`/api/workspace/shops/${shopId}/contacts`, {
          headers: { origin },
          data: {
            version: 0,
            phone: "+256700000008",
            whatsapp: "+256700000008",
            website: "",
            fulfilment: "contact",
            paymentInstructions: "Agree directly with the merchant",
            deliveryInstructions: "Contact the shop",
            enquiriesEnabled: true,
            reason: "Fictional lifecycle contact setup",
          },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`/shopkeeper/shops/${shopId}/design`);
    await expect(page.getByRole("status")).toHaveText("Design loaded.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Draft saved. Preview before publishing.");
    await page
      .getByRole("checkbox", { name: "I reviewed this saved draft and confirm publication" })
      .check();
    await page.getByRole("button", { name: "Publish reviewed draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Shop published.");
    const shop = await (await page.request.get(`/api/workspace/shops/${shopId}`)).json();
    await publicPage.goto(`/shops/${shop.slug}`);
    await expect(
      publicPage.getByRole("heading", { name: businessName, exact: true }),
    ).toBeVisible();
    await publicPage.goto("/search?q=shoes");
    await expect(publicPage.getByRole("link", { name: businessName, exact: true })).toBeVisible();
    expect((await publicPage.request.get(`/contact/${shopId}`)).status()).toBe(200);
    await op
      .getByLabel("Reason for reversal", { exact: true })
      .fill("Fictional duplicate collection corrected");
    await op
      .getByRole("checkbox", { name: "I confirm this correction and its effect on tenancy" })
      .check();
    await op.getByRole("button", { name: "Reverse selected credit", exact: true }).click();
    await expect(op.getByRole("status")).toHaveText(
      "Correction recorded. Original history is retained.",
    );
    await expect(op.locator(".ledger-events")).toContainText("−");
    expect((await publicPage.request.get(`/shops/${shop.slug}`)).status()).toBe(404);
    expect((await publicPage.request.get(`/contact/${shopId}`)).status()).toBe(404);
    await op.getByLabel("Amount in UGX (whole shillings)", { exact: true }).fill("2500");
    await op
      .getByLabel("Invoice reference from the payment record", { exact: true })
      .fill(`LON-${invoiceId.replaceAll("-", "").toUpperCase()}`);
    await op
      .getByLabel("Unique receipt or waiver reference", { exact: true })
      .fill(`P8-CORRECTION-${randomUUID()}`);
    await op
      .getByLabel("Verification reason", { exact: true })
      .fill("Corrected fictional collection verified");
    await op
      .getByRole("checkbox", {
        name: "I independently verified this development credit and confirm recording it",
      })
      .check();
    await op.getByRole("button", { name: "Record verified credit", exact: true }).click();
    await expect(op.getByRole("status")).toHaveText("Development credit recorded.");
    expect((await publicPage.request.get(`/shops/${shop.slug}`)).status()).toBe(200);
    await page.goto(`/shopkeeper/shops/${shopId}/rent`);
    await page
      .getByRole("button", { name: "Request or open renewal invoice", exact: true })
      .click();
    await expect(page).toHaveURL(/\/shopkeeper\/invoices\/[a-f0-9-]{36}$/);
    const renewalId = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(renewalId).not.toBe(invoiceId);
    await op.goto(`/landlord/invoices/${renewalId}`);
    await op
      .getByLabel("Invoice reference from the payment record", { exact: true })
      .fill(`LON-${renewalId.replaceAll("-", "").toUpperCase()}`);
    await op
      .getByLabel("Unique receipt or waiver reference", { exact: true })
      .fill(`P8-RENEW-${randomUUID()}`);
    await op
      .getByLabel("Verification reason", { exact: true })
      .fill("Fictional renewal manually verified");
    await op
      .getByRole("checkbox", {
        name: "I independently verified this development credit and confirm recording it",
      })
      .check();
    await op.getByRole("button", { name: "Record verified credit", exact: true }).click();
    await expect(op.getByRole("status")).toHaveText("Development credit recorded.");
    await page.goto(`/shopkeeper/shops/${shopId}/rent`);
    await expect(page.getByText("Tenancy: active", { exact: true })).toBeVisible();
  } finally {
    await opContext.close();
    await guest.close();
  }
});
test("all P8 protected methods deny anonymous/foreign access and private RSC/evidence never leak", async ({
  page,
  request,
}) => {
  expect(applicationId).toBeTruthy();
  await login(page, accounts.ownerB);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  const details = {
    businessName: "Foreign attempt",
    category: "fashion",
    location: "Fictional location",
    description: "A bounded fictional business description",
    phone: "+256700000009",
  };
  const routes = [
    {
      method: "POST",
      path: "/api/workspace/applications",
      data: { ...details, key: randomUUID(), merchantId: seedIds.merchantA },
    },
    { method: "GET", path: `/api/workspace/applications/${applicationId}` },
    {
      method: "PATCH",
      path: `/api/workspace/applications/${applicationId}`,
      data: { ...details, version: 1 },
    },
    {
      method: "POST",
      path: `/api/workspace/applications/${applicationId}/submit`,
      data: { version: 1, confirm: true },
    },
    { method: "GET", path: `/api/workspace/applications/${applicationId}/evidence/1` },
    {
      method: "PUT",
      path: `/api/workspace/applications/${applicationId}/evidence/1`,
      data: "invalid image",
    },
    { method: "GET", path: `/api/workspace/applications/${applicationId}/invoices` },
    { method: "GET", path: `/api/workspace/invoices/${invoiceId}` },
    { method: "GET", path: `/api/workspace/shops/${shopId}/rent` },
    { method: "POST", path: `/api/workspace/shops/${shopId}/rent`, data: { version: 1 } },
    { method: "GET", path: "/api/operator/applications" },
    { method: "GET", path: `/api/operator/applications/${applicationId}` },
    {
      method: "POST",
      path: `/api/operator/applications/${applicationId}/claim`,
      data: { permission: "review" },
    },
    {
      method: "POST",
      path: `/api/operator/applications/${applicationId}/decision`,
      data: { version: 1, decision: "rejected", reason: "Foreign decision attempt", confirm: true },
    },
    { method: "GET", path: `/api/operator/applications/${applicationId}/evidence/1` },
    { method: "GET", path: `/api/operator/applications/${applicationId}/invoices` },
    { method: "GET", path: `/api/operator/invoices/${invoiceId}` },
    {
      method: "POST",
      path: `/api/operator/invoices/${invoiceId}/reconcile`,
      data: {
        key: randomUUID(),
        version: 1,
        kind: "payment",
        amountMinor: "5000",
        currency: "UGX",
        invoiceReference: `LON-${invoiceId.replaceAll("-", "").toUpperCase()}`,
        reference: `FOREIGN-${randomUUID()}`,
        reason: "Foreign credit attempt",
        confirm: true,
      },
    },
    {
      method: "POST",
      path: `/api/operator/invoices/${invoiceId}/reverse`,
      data: {
        key: randomUUID(),
        version: 1,
        eventId: randomUUID(),
        reason: "Foreign reversal attempt",
        confirm: true,
      },
    },
    { method: "GET", path: "/api/operator/rent-policies" },
    {
      method: "POST",
      path: "/api/operator/rent-policies",
      data: {
        label: "Foreign policy",
        amountMinor: "5000",
        periodDays: 30,
        graceDays: 7,
        mallCapacity: 1500,
        confirm: true,
      },
    },
  ];
  for (const route of routes) {
    const denied = await page.request.fetch(route.path, {
      method: route.method,
      data: route.data,
      headers: { origin },
    });
    expect(denied.status(), route.path).toBe(route.path.includes("/operator/") ? 403 : 404);
    expect(denied.headers()["cache-control"]).toContain("no-store");
    expect(await denied.text()).not.toContain(businessName);
    expect(
      (
        await request.fetch(route.path, {
          method: route.method,
          data: route.data,
          headers: { origin },
        })
      ).status(),
      route.path,
    ).toBe(401);
  }
  expect((await page.request.get("/api/workspace/applications")).status()).toBe(200);
  expect(await (await page.request.get("/api/workspace/applications")).text()).not.toContain(
    businessName,
  );
  expect((await request.get("/api/workspace/applications")).status()).toBe(401);
  for (const path of [
    `/shopkeeper/applications/${applicationId}`,
    `/shopkeeper/invoices/${invoiceId}`,
    `/shopkeeper/shops/${shopId}/rent`,
    `/landlord/applications/${applicationId}`,
    `/landlord/invoices/${invoiceId}`,
  ]) {
    const r = await page.request.get(path, { headers: { RSC: "1" }, maxRedirects: 0 });
    expect([403, 404]).toContain(r.status());
    expect(await r.text()).not.toContain(businessName);
  }
  expect(
    (
      await page.request.post("/api/workspace/applications", {
        headers: { origin: "https://attacker.example" },
        data: { ...details, key: randomUUID() },
      })
    ).status(),
  ).toBe(403);
});
