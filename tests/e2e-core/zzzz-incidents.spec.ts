import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { generate } from "otplib";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
let accounts: SeedAccounts,
  reviewer: { email: string; password: string },
  caseId: string,
  shopName: string;
const origin = "http://127.0.0.1:3101",
  root = `/api/workspace/shops/${seedIds.shopA}/incidents`,
  privateMessage =
    "PRIVATE-INCIDENT-REPORT <script>window.incidentProbe=true</script> fictional unexpected instructions",
  privateNote = "PRIVATE-INCIDENT-NOTE fictional recovery review";
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  accounts = JSON.parse(await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"));
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw Error("Requires isolated browser database");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    reviewer = {
      email: `incident-browser-${randomUUID()}@londos.example`,
      password: `Incident-browser-${randomUUID()}`,
    };
    const created = await createAuth(pool, coreConfig(), true).api.signUpEmail({
      body: { ...reviewer, name: "Fictional incident reviewer" },
    });
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    await pool.query(
      "INSERT INTO operator_grants(user_id,permission) VALUES($1,'recovery'),($1,'support')",
      [created.user.id],
    );
    await pool.query("INSERT INTO operator_shop_scopes(user_id,shop_id) VALUES($1,$2)", [
      created.user.id,
      seedIds.shopA,
    ]);
    shopName = (await pool.query("SELECT name FROM shops WHERE id=$1", [seedIds.shopA])).rows[0]
      .name;
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
async function mfa(page: Page) {
  await login(page, reviewer, "/landlord");
  await expect(page.getByRole("heading", { name: "Account security." })).toBeVisible();
  await page.getByLabel("Confirm your password", { exact: true }).fill(reviewer.password);
  await page.getByRole("button", { name: "Set up MFA", exact: true }).click();
  const secret = new URL(
    await page.getByLabel("Authenticator setup URI", { exact: true }).inputValue(),
  ).searchParams.get("secret")!;
  await page.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
  await page.getByRole("button", { name: "Verify MFA" }).click();
  await expect(page).toHaveURL(/verified=1/);
}
async function action(page: Page, name: string) {
  await page.getByLabel("Incident action", { exact: true }).selectOption(name);
  await page.getByLabel("Private investigation reason", { exact: true }).fill(privateNote);
  await page
    .getByLabel("Explanation for shop owners", { exact: true })
    .fill("Fictional recovery response with no private investigation data.");
  await page
    .getByRole("checkbox", {
      name: "I reviewed authority, current versions and the impact of this incident action.",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save incident action", exact: true }).click();
}
test("owner-confirmed contact restoration and native session containment work through assigned MFA incident review", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const opContext = await browser.newContext(),
    op = await opContext.newPage(),
    oldContext = await browser.newContext(),
    old = await oldContext.newPage();
  try {
    await login(page, accounts.ownerA);
    await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    await login(old, accounts.ownerA);
    await expect(old.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    const contacts = await (
        await page.request.get(`/api/workspace/shops/${seedIds.shopA}/contacts`)
      ).json(),
      safe = {
        version: contacts.version,
        phone: "+256700000088",
        whatsapp: "",
        website: "",
        fulfilment: "contact",
        paymentInstructions: "Original fictional owner-confirmed payment instructions",
        deliveryInstructions: "",
        enquiriesEnabled: true,
        reason: "Fictional original contact instructions",
      };
    const saved = await page.request.put(`/api/workspace/shops/${seedIds.shopA}/contacts`, {
      headers: { origin },
      data: safe,
    });
    expect(saved.status()).toBe(200);
    const safeRevision = (await saved.json()).version;
    expect(
      (
        await page.request.put(`/api/workspace/shops/${seedIds.shopA}/contacts`, {
          headers: { origin },
          data: {
            ...safe,
            version: safeRevision,
            paymentInstructions: "Unexpected fictional instruction",
            reason: "Fictional incident trigger",
          },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`/shopkeeper/shops/${seedIds.shopA}/incidents`);
    await page.getByLabel("Incident category", { exact: true }).selectOption("contact_change");
    await page.getByLabel("Describe the incident", { exact: true }).fill(privateMessage);
    await page
      .getByLabel("Earlier contact revision to request", { exact: true })
      .selectOption(String(safeRevision));
    await page
      .getByRole("checkbox", { name: "I confirm this fictional incident request.", exact: true })
      .check();
    await page.getByRole("button", { name: "Open incident", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your shop incident", exact: true }),
    ).toBeVisible();
    caseId = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(await page.evaluate(() => Reflect.get(window, "incidentProbe"))).toBeUndefined();
    await mfa(op);
    await op.goto("/landlord/incidents");
    const item = op
      .getByRole("listitem")
      .filter({ has: op.getByRole("heading", { name: shopName, exact: true }) });
    await item
      .getByLabel("Assignment reason", { exact: true })
      .fill("Fictional scoped recovery assignment");
    await item
      .getByRole("checkbox", { name: "I accept responsibility for this incident.", exact: true })
      .check();
    await item.getByRole("button", { name: "Claim incident", exact: true }).click();
    await expect(
      op.getByRole("heading", { name: `Incident review for ${shopName}`, exact: true }),
    ).toBeVisible();
    expect(await op.evaluate(() => Reflect.get(window, "incidentProbe"))).toBeUndefined();
    expect(
      (
        await op.request.put(`/api/workspace/shops/${seedIds.shopA}/contacts`, {
          headers: { origin },
          data: { ...safe, version: safeRevision + 1 },
        })
      ).status(),
    ).toBe(404);
    await action(op, "restore_contacts");
    await expect(op.getByRole("main").getByRole("alert")).toContainText(
      "original owner must confirm",
    );
    await action(op, "contain_sessions");
    await expect(op.getByRole("status")).toHaveText("Incident action recorded.");
    expect((await old.request.get(root)).status()).toBe(401);
    expect((await page.request.get(root)).status()).toBe(401);
    await login(page, accounts.ownerA);
    await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    await page.goto(`/shopkeeper/shops/${seedIds.shopA}/incidents/${caseId}`);
    await expect(page.getByRole("main")).not.toContainText(privateNote);
    await page.getByLabel("Owner action", { exact: true }).selectOption("confirm_restore");
    await page
      .getByLabel("Owner action reason", { exact: true })
      .fill("Fictional exact historical instructions confirmed after account security review");
    await page
      .getByRole("checkbox", {
        name: "I reviewed this incident and confirm my selected action.",
        exact: true,
      })
      .check();
    await page.getByRole("button", { name: "Save owner action", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Exact restoration confirmed");
    await op.getByRole("button", { name: "Reload assigned incident", exact: true }).click();
    await expect(op.getByRole("main")).toContainText("Current owner confirmation: Valid");
    expect((await new AxeBuilder({ page: op }).analyze()).violations).toEqual([]);
    await mkdir("docs/evidence/images", { recursive: true });
    await op.screenshot({
      path: "docs/evidence/images/x2-p9-incident-review-desktop.png",
      fullPage: true,
    });
    await action(op, "restore_contacts");
    await expect(op.getByRole("status")).toHaveText("Incident action recorded.");
    await expect(op.getByRole("main")).toContainText("state: resolved");
    const restored = await (
      await page.request.get(`/api/workspace/shops/${seedIds.shopA}/contacts`)
    ).json();
    expect(restored.version).toBe(safeRevision + 2);
    expect(restored.payment_instructions).toBe(safe.paymentInstructions);
    await page.reload();
    await expect(page.getByRole("main")).toContainText("state: resolved");
    await expect(page.getByRole("main")).not.toContainText(privateNote);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: "docs/evidence/images/x2-p9-incident-owner-desktop.png",
      fullPage: true,
    });
  } finally {
    await opContext.close();
    await oldContext.close();
  }
});
test("all eight incident methods reject anonymous/foreign access, private HTML/Flight leaks and forged recovery fields", async ({
  page,
  request,
}) => {
  await login(page, accounts.ownerB);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  const methods = [
    { method: "GET", path: root },
    {
      method: "POST",
      path: root,
      data: {
        key: randomUUID(),
        kind: "support",
        message: "Fictional incident boundary check",
        contactVersion: null,
        requestedRevision: null,
        confirm: true,
      },
    },
    { method: "GET", path: `${root}/${caseId}` },
    {
      method: "POST",
      path: `${root}/${caseId}`,
      data: {
        version: 1,
        action: "cancel",
        contactVersion: null,
        reason: "Fictional cancellation check",
        confirm: true,
      },
    },
    { method: "GET", path: "/api/operator/incidents" },
    {
      method: "POST",
      path: `/api/operator/incidents/${caseId}/claim`,
      data: { version: 1, reason: "Fictional assignment check", confirm: true },
    },
    { method: "GET", path: `/api/operator/incidents/${caseId}` },
    {
      method: "POST",
      path: `/api/operator/incidents/${caseId}`,
      data: {
        version: 1,
        action: "note",
        priority: 0,
        reason: "Fictional private note",
        publicReason: "",
        confirm: true,
      },
    },
  ];
  for (const m of methods) {
    const options = {
      method: m.method,
      headers: { origin },
      ...(m.data ? { data: m.data } : {}),
    };
    const a = await request.fetch(m.path, options);
    expect(a.status(), m.path).toBe(401);
    expect(a.headers()["cache-control"]).toContain("no-store");
    const b = await page.request.fetch(m.path, options);
    expect([403, 404], m.path).toContain(b.status());
    expect(await b.text()).not.toContain(privateMessage);
  }
  for (const path of [
    `/shopkeeper/shops/${seedIds.shopA}/incidents`,
    `/shopkeeper/shops/${seedIds.shopA}/incidents/${caseId}`,
    `/landlord/incidents/${caseId}`,
  ])
    for (const headers of [{}, { RSC: "1" }]) {
      const denied = await page.request.get(path, { headers });
      expect([403, 404]).toContain(denied.status());
      expect(await denied.text()).not.toContain(privateMessage);
      expect(await denied.text()).not.toContain(privateNote);
      expect(denied.headers()["referrer-policy"]).toBe("no-referrer");
    }
  const own = `/api/workspace/shops/${seedIds.shopB}/incidents`,
    data = {
      key: randomUUID(),
      kind: "support",
      message: "Fictional support concern",
      contactVersion: null,
      requestedRevision: null,
      confirm: true,
    };
  expect(
    (
      await page.request.post(own, { headers: { origin: "https://attacker.example" }, data })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post(own, {
        headers: { origin },
        data: { ...data, reporterId: accounts.ownerA.id },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await page.request.post(own, {
        headers: { origin },
        data: { ...data, message: "x".repeat(10000) },
      })
    ).status(),
  ).toBe(422);
});
