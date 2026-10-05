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
  operator: { email: string; password: string },
  invitee: { email: string; password: string },
  shopName: string,
  originalSlug: string;
const origin = "http://127.0.0.1:3101";
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  accounts = JSON.parse(await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"));
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw new Error("Requires isolated browser database");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const auth = createAuth(pool, coreConfig(), true);
    for (const kind of ["operator", "invitee"] as const) {
      const account = {
        email: `admin-${kind}-${randomUUID()}@londos.example`,
        password: `Admin-browser-${randomUUID()}`,
      };
      const result = await auth.api.signUpEmail({
        body: { ...account, name: `Fictional admin ${kind}` },
      });
      await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [result.user.id]);
      if (kind === "operator") {
        operator = account;
        await pool.query(
          "INSERT INTO operator_grants(user_id,permission) VALUES($1,'operations'),($1,'finance')",
          [result.user.id],
        );
      } else invitee = account;
    }
    const row = (await pool.query("SELECT name,slug FROM shops WHERE id=$1", [seedIds.shopA]))
      .rows[0];
    shopName = row.name;
    originalSlug = row.slug;
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
async function confirmTeam(page: Page) {
  await page
    .getByRole("checkbox", {
      name: "I reviewed the selected access change and confirm it",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save team change", exact: true }).click();
}
test("owner team and address forms, invitation acceptance and scoped MFA operations work together", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(90000);
  const opContext = await browser.newContext(),
    op = await opContext.newPage(),
    recipientContext = await browser.newContext(),
    recipient = await recipientContext.newPage();
  try {
    await login(page, accounts.ownerA);
    await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Manage your teams", exact: true }).click();
    await page.getByRole("link", { name: "Fictional Annette Merchant", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Manage Fictional Annette Merchant", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Invitee email", { exact: true }).fill(invitee.email);
    await page.getByRole("checkbox", { name: "Catalogue", exact: true }).check();
    await confirmTeam(page);
    await expect(page.getByRole("status")).toContainText("Invitation queued");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    let token: string;
    try {
      token = (
        await pool.query(
          "SELECT payload->>'token' AS token FROM jobs WHERE payload->>'template'='invitation' AND payload->>'to'=$1 ORDER BY created_at DESC LIMIT 1",
          [invitee.email],
        )
      ).rows[0].token;
    } finally {
      await pool.end();
    }
    await login(recipient, invitee);
    await expect(
      recipient.getByRole("heading", { name: "Your shops.", exact: true }),
    ).toBeVisible();
    await recipient.goto("/shopkeeper/invitations");
    await recipient.getByLabel("Private invitation token", { exact: true }).fill(token!);
    await recipient.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(recipient.getByRole("status")).toContainText("Invitation accepted");
    expect((await recipient.request.get(`/api/workspace/shops/${seedIds.shopA}`)).status()).toBe(
      404,
    );
    await page.getByRole("button", { name: "Reload team", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Current team reloaded.");
    await page.getByLabel("Team action", { exact: true }).selectOption("staff_shop");
    await page
      .getByLabel("Team member", { exact: true })
      .selectOption({ label: `${invitee.email} · staff · active` });
    await page.getByLabel("Staff shop", { exact: true }).selectOption(seedIds.shopA);
    await page.getByRole("checkbox", { name: "Catalogue", exact: true }).check();
    await confirmTeam(page);
    await expect(page.getByRole("status")).toHaveText("Team change saved.");
    expect((await recipient.request.get(`/api/workspace/shops/${seedIds.shopA}`)).status()).toBe(
      200,
    );
    expect(
      (await recipient.request.get(`/api/workspace/shops/${seedIds.shopA}/rent`)).status(),
    ).toBe(404);
    await mkdir("docs/evidence/images", { recursive: true });
    await page.screenshot({ path: "docs/evidence/images/x2-p8-team-desktop.png", fullPage: true });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto(`/shopkeeper/shops/${seedIds.shopA}/address`);
    const initialDesign = await (
      await page.request.get(`/api/workspace/shops/${seedIds.shopA}/design`)
    ).json();
    expect(
      (
        await page.request.post(`/api/workspace/shops/${seedIds.shopA}/design/publish`, {
          headers: { origin },
          data: { version: initialDesign.version, revision: initialDesign.revision, confirm: true },
        })
      ).status(),
    ).toBe(200);
    const slug = `browser-admin-${randomUUID()}`;
    await page.getByLabel("Shop address slug", { exact: true }).fill(slug);
    await page
      .getByLabel("Reason for changing the address", { exact: true })
      .fill("Fictional owner requested this address");
    await page
      .getByRole("checkbox", { name: "I confirm this shop address change", exact: true })
      .check();
    await page.getByRole("button", { name: "Save shop address", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Shop address saved" })).toBeVisible();
    const old = await request.get(`/shops/${originalSlug}`, { maxRedirects: 0 });
    expect(old.status()).toBe(308);
    expect(old.headers().location).toContain(slug);
    await login(op, operator, "/landlord");
    await expect(op).toHaveURL(/\/security$/);
    await op.getByLabel("Confirm your password", { exact: true }).fill(operator.password);
    await op.getByRole("button", { name: "Set up MFA", exact: true }).click();
    const uri = await op.getByLabel("Authenticator setup URI", { exact: true }).inputValue(),
      secret = new URL(uri).searchParams.get("secret")!;
    await op.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
    await op.getByRole("button", { name: "Verify MFA", exact: true }).click();
    await expect(op).toHaveURL(/verified=1/);
    expect((await op.request.get(`/api/operator/shops/${seedIds.shopA}/operations`)).status()).toBe(
      404,
    );
    expect(await (await op.request.get("/api/operator/rent-exceptions")).json()).toEqual([]);
    await op.goto("/landlord/operations");
    const item = op
      .locator(".workspace-list li")
      .filter({ has: op.getByText(shopName, { exact: true }) });
    await item
      .getByLabel("Reason for claiming shop operations", { exact: true })
      .fill("Fictional shop operations review");
    await item
      .getByRole("checkbox", { name: "I confirm this scoped investigation", exact: true })
      .check();
    await item.getByRole("button", { name: "Claim shop operations", exact: true }).click();
    await expect(op).toHaveURL(new RegExp(`/landlord/operations/${seedIds.shopA}$`));
    const mediaPool = new Pool({ connectionString: process.env.DATABASE_URL });
    let assetId: string;
    try {
      assetId = (
        await mediaPool.query("SELECT asset_id FROM product_media WHERE shop_id=$1 LIMIT 1", [
          seedIds.shopA,
        ])
      ).rows[0].asset_id;
    } finally {
      await mediaPool.end();
    }
    const mediaPath = `/api/public/shops/${seedIds.shopA}/media/${assetId!}/display`;
    expect((await request.get(mediaPath)).status()).toBe(200);
    await op
      .getByLabel("Reason for this operation", { exact: true })
      .fill("Fictional temporary administrative pause");
    await op
      .getByRole("checkbox", {
        name: "I reviewed the effect and confirm this operation",
        exact: true,
      })
      .check();
    await op.getByRole("button", { name: "Save shop operation", exact: true }).click();
    await expect(op.getByRole("status")).toHaveText("Shop operation saved and audited.");
    expect((await request.get(`/shops/${originalSlug}`)).status()).toBe(404);
    expect((await request.get(`/contact/${seedIds.shopA}`)).status()).toBe(404);
    expect((await request.get(mediaPath)).status()).toBe(404);
    const design = await (
      await page.request.get(`/api/workspace/shops/${seedIds.shopA}/design`)
    ).json();
    expect(
      (
        await page.request.post(`/api/workspace/shops/${seedIds.shopA}/design/publish`, {
          headers: { origin },
          data: { version: design.version, revision: design.revision, confirm: true },
        })
      ).status(),
    ).toBe(200);
    expect((await request.get(`/shops/${slug}`)).status()).toBe(404);
    await op.getByLabel("Shop operation", { exact: true }).selectOption("resume");
    await op
      .getByLabel("Reason for this operation", { exact: true })
      .fill("Fictional investigation completed");
    await op
      .getByRole("checkbox", {
        name: "I reviewed the effect and confirm this operation",
        exact: true,
      })
      .check();
    await op.getByRole("button", { name: "Save shop operation", exact: true }).click();
    await expect(op.getByRole("status")).toHaveText("Shop operation saved and audited.");
    expect((await request.get(`/shops/${slug}`)).status()).toBe(200);
    await op.getByLabel("Shop operation", { exact: true }).selectOption("move");
    await op.getByLabel("Target internal mall", { exact: true }).selectOption(seedIds.mallB);
    await op
      .getByLabel("Reason for this operation", { exact: true })
      .fill("Fictional internal capacity rebalance");
    await op
      .getByRole("checkbox", {
        name: "I reviewed the effect and confirm this operation",
        exact: true,
      })
      .check();
    await op.getByRole("button", { name: "Save shop operation", exact: true }).click();
    await expect(op.getByRole("status")).toHaveText("Shop operation saved and audited.");
    await expect(op.getByText("Demo mall — north", { exact: true })).toBeVisible();
    await op.screenshot({
      path: "docs/evidence/images/x2-p8-operations-desktop.png",
      fullPage: true,
    });
    expect((await new AxeBuilder({ page: op }).analyze()).violations).toEqual([]);
  } finally {
    await opContext.close();
    await recipientContext.close();
  }
});
test("administration methods and private HTML/Flight deny anonymous and foreign access", async ({
  page,
  request,
}) => {
  await login(page, accounts.ownerB);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  const routes = [
    { method: "GET", path: `/api/workspace/merchants/${seedIds.merchantA}/team` },
    {
      method: "POST",
      path: `/api/workspace/merchants/${seedIds.merchantA}/team`,
      data: {
        action: "invite",
        version: 1,
        confirm: true,
        value: { email: "foreign@londos.example", role: "staff", permissions: [] },
      },
    },
    {
      method: "POST",
      path: `/api/workspace/shops/${seedIds.shopA}/address`,
      data: {
        slug: "foreign-address",
        version: 1,
        reason: "Foreign change attempt",
        confirm: true,
      },
    },
    { method: "GET", path: "/api/operator/malls" },
    { method: "GET", path: "/api/operator/shops" },
    {
      method: "POST",
      path: `/api/operator/shops/${seedIds.shopA}/claim`,
      data: { reason: "Foreign claim attempt", confirm: true },
    },
    { method: "GET", path: `/api/operator/shops/${seedIds.shopA}/operations` },
    {
      method: "POST",
      path: `/api/operator/shops/${seedIds.shopA}/operations`,
      data: { action: "pause", version: 1, reason: "Foreign pause attempt", confirm: true },
    },
    { method: "GET", path: "/api/operator/rent-exceptions" },
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
  expect((await request.get("/api/workspace/merchants")).status()).toBe(401);
  expect(await (await page.request.get("/api/workspace/merchants")).text()).not.toContain(
    "Fictional Annette Merchant",
  );
  for (const path of [
    `/shopkeeper/merchants/${seedIds.merchantA}/team`,
    `/landlord/operations/${seedIds.shopA}`,
  ])
    for (const headers of [{}, { rsc: "1", "next-router-prefetch": "1" }]) {
      const response = await page.request.get(path, { headers, maxRedirects: 0 });
      expect(response.status()).toBe(path.startsWith("/landlord") ? 403 : 404);
      expect(await response.text()).not.toContain("Fictional Annette Merchant");
    }
  expect(
    (
      await page.request.post(`/api/workspace/shops/${seedIds.shopB}/address`, {
        headers: { origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
});
