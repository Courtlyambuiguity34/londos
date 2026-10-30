import { test, expect, type Page } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { generate } from "otplib";
import sharp from "sharp";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
let accounts: SeedAccounts,
  reviewers: { email: string; password: string }[],
  caseId: string,
  shopSlug: string,
  shopName: string;
const origin = "http://127.0.0.1:3101",
  privateReport = "PRIVATE-REPORT-ONLY <script>window.trustProbe=true</script> fictional concern",
  privateReason = "PRIVATE-INVESTIGATION-ONLY fictional review",
  merchantReason = "Please clarify the fictional product description.";
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  accounts = JSON.parse(await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"));
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw new Error("Requires isolated browser database");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  reviewers = [];
  try {
    const auth = createAuth(pool, coreConfig(), true);
    for (let n = 0; n < 2; n++) {
      const account = {
          email: `trust-reviewer-${randomUUID()}@londos.example`,
          password: `Trust-browser-${randomUUID()}`,
        },
        created = await auth.api.signUpEmail({
          body: { ...account, name: `Fictional trust reviewer ${n + 1}` },
        });
      await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
      await pool.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'moderation')", [
        created.user.id,
      ]);
      reviewers.push(account);
    }
    const row = (await pool.query("SELECT name,slug FROM shops WHERE id=$1", [seedIds.shopA]))
      .rows[0];
    shopName = row.name;
    shopSlug = row.slug;
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
async function mfa(page: Page, account: { email: string; password: string }) {
  await login(page, account, "/landlord");
  await expect(page.getByRole("heading", { name: "Account security." })).toBeVisible();
  await page.getByLabel("Confirm your password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Set up MFA", exact: true }).click();
  const uri = await page.getByLabel("Authenticator setup URI", { exact: true }).inputValue(),
    secret = new URL(uri).searchParams.get("secret")!;
  await page.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
  await page.getByRole("button", { name: "Verify MFA" }).click();
  await expect(page).toHaveURL(/verified=1/);
}
async function claim(page: Page) {
  await page.goto("/landlord/trust");
  const item = page.getByRole("form", {
    name: `Claim case ${caseId.slice(0, 8)}`,
    exact: true,
  });
  await item
    .getByLabel("Claim reason", { exact: true })
    .fill("Fictional scoped independent investigation");
  await item
    .getByRole("checkbox", { name: "I confirm this scoped trust assignment.", exact: true })
    .check();
  await item.getByRole("button", { name: "Claim trust case", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/landlord/trust/${caseId}$`));
  await expect(
    page.getByRole("heading", { name: `Trust review for ${shopName}`, exact: true }),
  ).toBeVisible();
}
async function decide(page: Page, action: string) {
  await page.getByLabel("Trust action", { exact: true }).selectOption(action);
  await page.getByLabel("Private decision reason", { exact: true }).fill(privateReason);
  await page.getByLabel("Explanation for the merchant", { exact: true }).fill(merchantReason);
  await page
    .getByRole("checkbox", {
      name: "I reviewed the evidence, current state and merchant explanation.",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save trust decision", exact: true }).click();
}

test("anonymous reporting, private image, scoped native MFA suspension and independent appeal review work together", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(90000);
  const customerContext = await browser.newContext(),
    customer = await customerContext.newPage(),
    oneContext = await browser.newContext(),
    one = await oneContext.newPage(),
    twoContext = await browser.newContext(),
    two = await twoContext.newPage();
  try {
    await login(page, accounts.ownerA);
    await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    const design = await (
      await page.request.get(`/api/workspace/shops/${seedIds.shopA}/design`)
    ).json();
    expect(
      (
        await page.request.post(`/api/workspace/shops/${seedIds.shopA}/design/publish`, {
          headers: { origin },
          data: {
            version: design.version,
            revision: design.revision,
            confirm: true,
            photosReviewed: true,
          },
        })
      ).status(),
    ).toBe(200);
    await customer.goto(`/shops/${shopSlug}`);
    await expect(
      customer.getByText("Development application reviewed.", { exact: false }),
    ).toHaveCount(0);
    await customer
      .getByRole("link", { name: "Report a concern about this shop", exact: true })
      .click();
    await expect(
      customer.getByRole("heading", { name: "Report a shop concern", exact: true }),
    ).toBeVisible();
    await customer.getByLabel("Concern category", { exact: true }).selectOption("product");
    await customer.getByLabel("What happened?", { exact: true }).fill(privateReport);
    const image = await sharp({
      create: { width: 80, height: 60, channels: 3, background: "#57714d" },
    })
      .png()
      .toBuffer();
    await customer
      .getByLabel("Optional private image", { exact: true })
      .setInputFiles({ name: "fictional-concern.png", mimeType: "image/png", buffer: image });
    await customer
      .getByRole("checkbox", {
        name: "I have checked this report and believe the information is accurate.",
        exact: true,
      })
      .check();
    const reportSubmission = customer.waitForRequest(
      (request) => request.url().endsWith("/api/guest/reports") && request.method() === "POST",
    );
    await customer.getByRole("button", { name: "Send concern", exact: true }).click();
    const reportId = (await reportSubmission).postDataJSON().key;
    await expect(customer.getByRole("status")).toContainText("Report and private image received");
    expect(customer.url()).not.toContain("capability");
    await mkdir("docs/evidence/images", { recursive: true });
    await customer.screenshot({
      path: "docs/evidence/images/x2-p9-report-desktop.png",
      fullPage: true,
    });
    expect((await new AxeBuilder({ page: customer }).analyze()).violations).toEqual([]);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    let assetId: string;
    try {
      caseId = (
        await pool.query(
          "SELECT c.id FROM trust_cases c JOIN trust_reports r ON r.id=c.report_id WHERE r.id=$1 AND r.message=$2",
          [reportId, privateReport],
        )
      ).rows[0].id;
      assetId = (
        await pool.query(
          "SELECT a.id FROM media_assets a JOIN product_media p ON p.asset_id=a.id WHERE a.shop_id=$1 AND a.state='ready' LIMIT 1",
          [seedIds.shopA],
        )
      ).rows[0].id;
    } finally {
      await pool.end();
    }
    expect((await request.get(`/api/operator/trust/${caseId}/evidence`)).status()).toBe(401);
    expect((await page.request.get(`/api/operator/trust/${caseId}/evidence`)).status()).toBe(403);
    expect((await request.get(`/shops/${shopSlug}`)).status()).toBe(200);
    await mfa(one, reviewers[0]!);
    await claim(one);
    await expect(one.getByText(privateReport, { exact: true })).toBeVisible();
    expect(
      await one.evaluate(() => Object.prototype.hasOwnProperty.call(window, "trustProbe")),
    ).toBe(false);
    const evidence = await one.request.get(`/api/operator/trust/${caseId}/evidence`);
    expect(evidence.status()).toBe(200);
    expect(evidence.headers()["content-type"]).toBe("image/webp");
    expect(evidence.headers()["cache-control"]).toContain("no-store");
    await one
      .getByRole("textbox", { name: "Private investigation note", exact: true })
      .fill("Fictional product concern reviewed without sharing reporter data.");
    await one.getByLabel("Queue priority", { exact: true }).selectOption("1");
    await one
      .getByRole("checkbox", { name: "I confirm this private investigation record.", exact: true })
      .check();
    await one.getByRole("button", { name: "Save private note", exact: true }).click();
    await expect(one.getByRole("status")).toHaveText("Private investigation note saved.");
    await decide(one, "suspend");
    await expect(one.getByRole("status")).toHaveText("Reasoned trust decision saved.");
    for (const path of [
      `/shops/${shopSlug}`,
      `/contact/${seedIds.shopA}`,
      `/api/public/shops/${seedIds.shopA}/media/${assetId!}/display`,
    ])
      expect((await request.get(path)).status(), path).toBe(404);
    expect((await request.get(`/search?q=shoes&shopId=${seedIds.shopA}`)).status()).toBe(200);
    const guest = await request.post(`/api/guest/shops/${seedIds.shopA}/requests`, {
      headers: { origin },
      data: {
        key: randomUUID(),
        kind: "enquiry",
        name: "Fictional visitor",
        replyTo: "+256700000003",
        message: "Fictional blocked enquiry",
        productId: null,
      },
    });
    expect(guest.status()).toBe(404);
    await page.goto(`/shopkeeper/shops/${seedIds.shopA}/trust`);
    await expect(page.getByText(merchantReason, { exact: true })).toBeVisible();
    expect(await page.locator("body").textContent()).not.toContain(privateReport);
    expect(await page.locator("body").textContent()).not.toContain(privateReason);
    await page
      .getByLabel("Appeal explanation", { exact: true })
      .fill("Fictional owner requests a separate review of this restriction.");
    await page
      .getByRole("checkbox", {
        name: "I reviewed the explanation and confirm this appeal.",
        exact: true,
      })
      .check();
    await page.getByRole("button", { name: "Send appeal", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Appeal recorded for independent review");
    await one.getByRole("button", { name: "Reload trust case", exact: true }).click();
    await expect(one.getByRole("status")).toHaveText("Current trust case reloaded.");
    await decide(one, "reinstate");
    await expect(one.getByRole("main").getByRole("alert")).toContainText(
      "different authorized reviewer",
    );
    await mfa(two, reviewers[1]!);
    await claim(two);
    await expect(
      two.getByText("An owner appeal awaits independent review.", { exact: false }),
    ).toBeVisible();
    await two.screenshot({ path: "docs/evidence/images/x2-p9-review-desktop.png", fullPage: true });
    expect((await new AxeBuilder({ page: two }).analyze()).violations).toEqual([]);
    await decide(two, "reinstate");
    await expect(two.getByRole("status")).toHaveText("Reasoned trust decision saved.");
    expect((await request.get(`/shops/${shopSlug}`)).status()).toBe(200);
    expect(
      (await request.get(`/api/public/shops/${seedIds.shopA}/media/${assetId!}/display`)).status(),
    ).toBe(200);
    await page.getByRole("button", { name: "Reload trust decisions", exact: true }).click();
    await expect(
      page.getByText(`Case ${caseId.slice(0, 8)} · reinstated`, { exact: true }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  } finally {
    await customerContext.close();
    await oneContext.close();
    await twoContext.close();
  }
});
test("all eight protected trust methods and private HTML/Flight deny anonymous and foreign access", async ({
  page,
  request,
}) => {
  await login(page, accounts.ownerB);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  const routes = [
    { method: "GET", path: "/api/operator/trust" },
    { method: "GET", path: `/api/operator/trust/${caseId}` },
    {
      method: "POST",
      path: `/api/operator/trust/${caseId}/claim`,
      data: { reason: "Foreign case claim", confirm: true },
    },
    {
      method: "POST",
      path: `/api/operator/trust/${caseId}/notes`,
      data: { version: 1, priority: 1, reason: "Foreign private note", confirm: true },
    },
    {
      method: "POST",
      path: `/api/operator/trust/${caseId}/decision`,
      data: {
        action: "suspend",
        version: 1,
        moderationVersion: 1,
        reason: "Foreign case decision",
        publicReason: "Foreign explanation",
        confirm: true,
      },
    },
    { method: "GET", path: `/api/operator/trust/${caseId}/evidence` },
    { method: "GET", path: `/api/workspace/shops/${seedIds.shopA}/trust` },
    {
      method: "POST",
      path: `/api/workspace/shops/${seedIds.shopA}/trust/${caseId}/appeal`,
      data: { version: 1, reason: "Foreign appeal is not permitted", confirm: true },
    },
  ];
  for (const route of routes) {
    const foreign = await page.request.fetch(route.path, {
      method: route.method,
      data: route.data,
      headers: { origin },
    });
    expect(foreign.status(), route.path).toBe(route.path.includes("/operator/") ? 403 : 404);
    expect(foreign.headers()["cache-control"]).toContain("no-store");
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
  for (const path of [`/landlord/trust/${caseId}`, `/shopkeeper/shops/${seedIds.shopA}/trust`])
    for (const headers of [{}, { RSC: "1" }]) {
      const r = await page.request.get(path, { headers });
      expect(r.status()).toBe(path.includes("/landlord/") ? 403 : 404);
      expect(await r.text()).not.toContain(privateReport);
      expect(await r.text()).not.toContain(privateReason);
    }
});
test("public intake rejects cross-origin, oversized JSON and stolen attachment capabilities; retries are private", async ({
  request,
}) => {
  const value = {
    key: randomUUID(),
    shopId: seedIds.shopB,
    capability: randomBytes(32).toString("base64url"),
    category: "other",
    message: "Fictional browser privacy and retry report",
  };
  expect(
    (
      await request.post("/api/guest/reports", {
        headers: { origin: "https://foreign.example" },
        data: value,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/guest/reports", {
        headers: { origin },
        data: { ...value, message: "x".repeat(10000) },
      })
    ).status(),
  ).toBe(422);
  for (let n = 0; n < 2; n++) {
    const r = await request.post("/api/guest/reports", { headers: { origin }, data: value });
    expect(r.status()).toBe(200);
    expect(await r.json()).toEqual({ received: true });
    expect(r.headers()["referrer-policy"]).toBe("no-referrer");
  }
  const path = `/api/guest/reports/${value.key}/evidence`;
  expect(
    (
      await request.post(path, {
        headers: {
          origin,
          "content-type": "image/png",
          authorization: `Bearer ${randomBytes(32).toString("base64url")}`,
        },
        data: Buffer.from("unsafe"),
      })
    ).status(),
  ).toBe(404);
  expect((await request.get(path)).status()).toBe(405);
  expect(
    (
      await request.post("/api/guest/reports", {
        headers: { origin },
        data: { ...value, message: "Changed report under a used retry key" },
      })
    ).status(),
  ).toBe(409);
  expect(
    await (
      await request.post("/api/guest/reports", {
        headers: { origin },
        data: { ...value, key: randomUUID(), shopId: randomUUID() },
      })
    ).json(),
  ).toEqual({ received: true });
  for (let n = 0; n < 7; n++)
    expect(
      (
        await request.post("/api/guest/reports", {
          headers: { origin },
          data: { ...value, key: randomUUID() },
        })
      ).status(),
    ).toBe(200);
  expect(
    (
      await request.post("/api/guest/reports", {
        headers: { origin },
        data: { ...value, key: randomUUID() },
      })
    ).status(),
  ).toBe(429);
});
