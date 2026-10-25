import { test, expect, type Page } from "./fixture";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { generate } from "otplib";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";

let accounts: SeedAccounts;
let operator: { email: string; password: string };
let applicationId: string;
const policyLabel = `Workflow policy ${randomUUID().slice(0, 8)}`;
const origin = { Origin: "http://127.0.0.1:3101" };
test.beforeAll(async () => {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw new Error("Disposable browser database required");
  accounts = JSON.parse(await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"));
  // Signup queues verification from inside the auth transaction; one connection
  // would block its callback before the browser scenario can start.
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  try {
    operator = {
      email: `workflow-finance-${randomUUID()}@londos.invalid`,
      password: `Fictional-workflow-${randomUUID()}`,
    };
    const result = await createAuth(db, coreConfig(), true).api.signUpEmail({
      body: { ...operator, name: "Workflow finance operator" },
    });
    await db.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [result.user.id]);
    await db.query(
      "INSERT INTO operator_grants(user_id,permission) VALUES($1,'finance'),($1,'operations')",
      [result.user.id],
    );
    applicationId = randomUUID();
    // This fixture isolates form/unit and route behavior; full evidence/approval/
    // settlement flow is exercised independently by lifecycle integration tests.
    await db.query(
      "INSERT INTO applications(id,merchant_id,applicant_id,state,business_name) VALUES($1,$2,$3,'approved','Workflow approved business')",
      [applicationId, seedIds.merchantA, accounts.ownerA.id],
    );
    await db.query(
      "INSERT INTO operator_application_scopes(user_id,application_id,permission) VALUES($1,$2,'finance')",
      [result.user.id, applicationId],
    );
  } finally {
    await db.end();
  }
});

async function signIn(
  page: Page,
  account: { email: string; password: string },
  next = "/shopkeeper",
) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("catalogue recovers from a temporary load failure and its section links work on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, accounts.ownerA);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  let first = true;
  await page.route(`**/api/workspace/shops/${seedIds.shopA}/contacts`, async (route) => {
    if (first) {
      first = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "service_unavailable" }),
      });
    } else await route.continue();
  });
  await page.goto(`/shopkeeper/shops/${seedIds.shopA}/catalogue`);
  await expect(page.getByRole("status")).toContainText("Workspace unavailable");
  await expect(page.getByRole("button", { name: "Create department", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reload catalogue", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Catalogue reloaded.");
  await expect(page.getByRole("button", { name: "Create department", exact: true })).toBeEnabled();
  await page
    .getByRole("navigation", { name: "Catalogue sections" })
    .getByRole("link", { name: "Contacts", exact: true })
    .click();
  await expect(page).toHaveURL(/#contacts$/);
  await expect(
    page
      .locator("#contacts")
      .getByRole("heading", { name: "Contact and commerce settings", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("finance forms keep whole UGX, finance links stay scoped and payment account numbers validate", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await signIn(page, operator, "/landlord");
    await expect(page).toHaveURL(/\/security$/);
    await page.getByLabel("Confirm your password", { exact: true }).fill(operator.password);
    await page.getByRole("button", { name: "Set up MFA", exact: true }).click();
    const secret = new URL(
      await page.getByLabel("Authenticator setup URI", { exact: true }).inputValue(),
    ).searchParams.get("secret")!;
    await page.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
    await page.getByRole("button", { name: "Verify MFA", exact: true }).click();
    await expect(page).toHaveURL(/verified=1/);
    await page.goto(`/landlord/rent/${applicationId}`);
    await page.getByText("Create rent policy", { exact: true }).click();
    await page.getByLabel("Policy name", { exact: true }).fill(policyLabel);
    await page.getByLabel("Rent amount (UGX)", { exact: true }).fill("5000");
    const policyResponse = page.waitForResponse(
      (r) => r.url().endsWith("/api/operator/rent-policies") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create policy", exact: true }).click();
    const created = await policyResponse;
    expect(created.request().postDataJSON().amountMinor).toBe("5000");
    expect(created.status()).toBe(200);
    const policyId = (await created.json()).id;
    expect(
      (
        await db.query("SELECT amount_minor::text AS amount FROM rent_policies WHERE id=$1", [
          policyId,
        ])
      ).rows[0].amount,
    ).toBe("5000");
    const selector = page.getByLabel("Rent policy", { exact: true });
    await expect(selector.getByRole("option", { name: new RegExp(policyLabel) })).toContainText(
      "5,000",
    );
    await selector.selectOption(policyId);
    await page.getByLabel("Custom amount (UGX, optional)", { exact: true }).fill("12500");
    await page.getByLabel("Coverage (days, optional)", { exact: true }).fill("45");
    await page
      .getByRole("checkbox", {
        name: "I confirm this invoice matches the agreed rent terms",
        exact: true,
      })
      .check();
    const invoiceResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/operator/applications/${applicationId}/invoice`) &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Issue invoice to shopkeeper", exact: true }).click();
    const issued = await invoiceResponse;
    expect(issued.request().postDataJSON().amountMinor).toBe("12500");
    expect(issued.status()).toBe(200);
    const invoiceId = (await issued.json()).id;
    expect(
      (await db.query("SELECT amount_minor::text AS amount FROM invoices WHERE id=$1", [invoiceId]))
        .rows[0].amount,
    ).toBe("12500");
    // Once an initial invoice is linked to a shop, it must still be labelled an
    // initial invoice, and operator links must not enter merchant-only routes.
    await db.query("UPDATE invoices SET shop_id=$2 WHERE id=$1", [invoiceId, seedIds.shopA]);
    await page.reload();
    await expect(
      page
        .locator(".workspace-list li")
        .filter({ has: page.locator(`a[href='/landlord/invoices/${invoiceId}']`) }),
    ).toContainText("Approved application");
    await page.goto(`/landlord/invoices/${invoiceId}`);
    await expect(
      page.getByRole("link", { name: "View shop rent history", exact: true }),
    ).toHaveAttribute("href", `/landlord/rent/${applicationId}`);
    await expect(
      page.getByRole("link", { name: "View application rent records", exact: true }),
    ).toHaveAttribute("href", `/landlord/rent/${applicationId}`);
    await expect(page.locator("a[href^='/shopkeeper/shops/']")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Record a verified credit", exact: true }),
    ).toBeVisible();

    await page.goto("/landlord/communications");
    const mtn = page.getByLabel("MTN collection number", { exact: true });
    const airtel = page.getByLabel("Airtel collection number", { exact: true });
    await mtn.fill("+256770000001");
    await airtel.fill("+256750000002");
    expect(await mtn.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
    expect(await airtel.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
    await mtn.fill("0770000001");
    expect(await mtn.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
    await mtn.fill("+256770000001");
    await page.getByLabel("Support email", { exact: true }).fill("workflow-support@londos.invalid");
    await page
      .getByLabel("MTN registered account name", { exact: true })
      .fill("Workflow MTN account");
    await page
      .getByLabel("Airtel registered account name", { exact: true })
      .fill("Workflow Airtel account");
    await page.getByRole("checkbox", { name: /I verified these payment details/ }).check();
    const paymentResponse = page.waitForResponse(
      (r) => r.url().endsWith("/api/operator/payment-settings") && r.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Save payment details", exact: true }).click();
    expect((await paymentResponse).status()).toBe(200);
    const owner = await page.context().browser()!.newContext();
    try {
      const merchant = await owner.newPage();
      await signIn(merchant, accounts.ownerA);
      await expect(
        merchant.getByRole("heading", { name: "Your shops.", exact: true }),
      ).toBeVisible();
      await merchant.goto(`/shopkeeper/invoices/${invoiceId}`);
      await expect(merchant.getByText("+256770000001", { exact: true })).toBeVisible();
      await expect(merchant.getByText("+256750000002", { exact: true })).toBeVisible();
      await expect(
        merchant.getByRole("heading", { name: "Rent invoice", exact: true }),
      ).toBeVisible();
      expect(
        (
          await merchant.request.get(`/api/operator/invoices/${invoiceId}`, { headers: origin })
        ).status(),
      ).toBe(403);
    } finally {
      await owner.close();
    }
  } finally {
    await db.end();
  }
});
