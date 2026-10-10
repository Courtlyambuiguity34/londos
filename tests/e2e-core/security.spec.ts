import { test, expect } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { generate } from "otplib";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { requiredMigration } from "../../src/server/db/schema-contract";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
let accounts: SeedAccounts;
test.beforeAll(async () => {
  accounts = JSON.parse(
    await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"),
  ) as SeedAccounts;
});
async function login(
  page: import("@playwright/test").Page,
  account: SeedAccounts[keyof SeedAccounts],
  next = "/shopkeeper",
) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("R2 stalled JSON receives a bounded 408 from the compiled authentication endpoint", async ({
  baseURL,
  request,
}) => {
  const started = Date.now();
  let outgoing: ReturnType<typeof httpRequest> | undefined;
  try {
    const result = await new Promise<{ status: number; body: string; cache: string }>(
      (resolve, reject) => {
        outgoing = httpRequest(
          `${baseURL}/api/auth/sign-in/email`,
          {
            method: "POST",
            headers: {
              Origin: baseURL!,
              "Content-Type": "Application/JSON; charset=utf-8",
              "Transfer-Encoding": "chunked",
            },
          },
          (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => (body += chunk));
            response.on("error", reject);
            response.on("end", () =>
              resolve({
                status: response.statusCode!,
                body,
                cache: response.headers["cache-control"] ?? "",
              }),
            );
          },
        );
        outgoing.on("error", reject);
        outgoing.setTimeout(22_000, () => outgoing?.destroy(new Error("body deadline missed")));
        outgoing.write('{"email":');
        // Deliberately leave the chunked body unfinished. No auth operation may begin.
      },
    );
    expect(result.status).toBe(408);
    expect(JSON.parse(result.body)).toEqual({ error: "request_body_timeout" });
    expect(result.cache).toContain("no-store");
    expect(Date.now() - started).toBeGreaterThanOrEqual(14_000);
    expect(Date.now() - started).toBeLessThan(22_000);
    expect((await request.get("/api/ready")).status()).toBe(200);
  } finally {
    outgoing?.destroy();
  }
});
test("anonymous private APIs deny access and the sign-in surface remains accessible", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/workspace/shops");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  await page.goto("/shopkeeper");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  const ready = await request.get("/api/ready");
  expect(await ready.json()).toMatchObject({
    database: true,
    authentication: true,
    liveNotifications: false,
    financialOperations: false,
  });
});
test("notification reset links work in the browser, private referrers stay empty, and readiness requires the deployed migration", async ({
  page,
  request,
}) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await page.goto("/recover");
    await page.getByLabel("Account email", { exact: true }).fill(accounts.invitee.email);
    await page.getByRole("button", { name: "Request recovery", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("If this account can recover");
    const url = (
      await pool.query(
        "SELECT payload->>'url' AS url FROM jobs WHERE payload->>'template'='password-reset' AND payload->>'to'=$1 ORDER BY created_at DESC LIMIT 1",
        [accounts.invitee.email],
      )
    ).rows[0].url as string;
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(
      page.getByLabel("New password (at least 12 characters)", { exact: true }),
    ).toBeVisible();
    const outgoing = page.waitForRequest((request) =>
      request.url().endsWith("/api/health?referrer-review"),
    );
    await page.evaluate(async () => {
      await fetch("/api/health?referrer-review");
    });
    // Chromium's provisional event includes an empty Referer placeholder. Assert
    // against the final headers actually sent on the network.
    expect("referer" in (await (await outgoing).allHeaders())).toBe(false);
    const changed = `Browser-review-${randomUUID()}`;
    await page.getByLabel("New password (at least 12 characters)", { exact: true }).fill(changed);
    await page.getByRole("button", { name: "Update password", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Password updated. Sign in with your new password.",
    );
    await page.getByRole("link", { name: "Return to sign-in", exact: true }).click();
    expect(await page.evaluate(() => document.referrer)).toBe("");
    await login(page, { ...accounts.invitee, password: changed });
    await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    for (const path of [
      "/shopkeeper",
      "/security",
      "/api/auth/get-session",
      "/api/workspace/shops",
    ]) {
      const result = await page.request.get(path);
      expect(result.headers()["referrer-policy"], path).toBe("no-referrer");
      expect(result.headers()["cache-control"], path).toContain("no-store");
    }
    const forbidden = new URL(url);
    forbidden.searchParams.set("callbackURL", "https://attacker.example/steal");
    const denied = await request.get(forbidden.toString(), { maxRedirects: 0 });
    expect(denied.status()).toBe(403);
    expect(denied.headers().location).toBeUndefined();
    await pool.query("UPDATE schema_migrations SET name=$2 WHERE name=$1", [
      requiredMigration,
      "review_missing_required.sql",
    ]);
    try {
      expect((await request.get("/api/ready")).status()).toBe(503);
    } finally {
      await pool.query("UPDATE schema_migrations SET name=$1 WHERE name=$2", [
        requiredMigration,
        "review_missing_required.sql",
      ]);
    }
    expect((await request.get("/api/ready")).status()).toBe(200);
  } finally {
    await pool.end();
  }
});
test("real owner login, tenant A/B attacks across all protected domain handlers and no RSC leakage", async ({
  page,
  browser,
}) => {
  await login(page, accounts.ownerA);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Annette Fashion House", exact: true }).click();
  const response = await page.request.get(`/api/workspace/shops/${seedIds.shopA}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  await page.getByLabel("Shop name", { exact: true }).fill("Browser fixture shop A");
  await page.getByRole("button", { name: "Save shop profile", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved. Background processing is queued.");
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, accounts.ownerB);
  await expect(otherPage.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  const origin = "http://127.0.0.1:3101",
    invitationId = "70000000-0000-4000-8000-000000000001",
    jobId = "80000000-0000-4000-8000-000000000001";
  const attacks = [
    { method: "GET", path: `/api/workspace/shops/${seedIds.shopA}`, data: undefined, status: 404 },
    {
      method: "PATCH",
      path: `/api/workspace/shops/${seedIds.shopA}`,
      data: { name: "Attack", version: 1 },
      status: 404,
    },
    {
      method: "PUT",
      path: `/api/workspace/merchants/${seedIds.merchantA}/memberships/${accounts.ownerA.id}`,
      data: { role: "staff", permissions: [], status: "revoked" },
      status: 404,
    },
    {
      method: "POST",
      path: `/api/workspace/merchants/${seedIds.merchantA}/invitations`,
      data: { email: accounts.ownerB.email, role: "owner", permissions: [] },
      status: 404,
    },
    {
      method: "DELETE",
      path: `/api/workspace/merchants/${seedIds.merchantA}/invitations/${invitationId}`,
      data: undefined,
      status: 404,
    },
    {
      method: "POST",
      path: `/api/workspace/merchants/${seedIds.merchantA}/ownership`,
      data: { userId: accounts.ownerB.id },
      status: 404,
    },
    {
      method: "PUT",
      path: `/api/workspace/merchants/${seedIds.merchantA}/staff-shops`,
      data: { userId: accounts.staff.id, shopId: seedIds.shopA, permissions: ["catalogue"] },
      status: 404,
    },
    {
      method: "POST",
      path: "/api/workspace/invitations/accept",
      data: { token: "a-fake-invitation-token-with-more-than-32-characters" },
      status: 404,
    },
    { method: "GET", path: "/api/operator/jobs", data: undefined, status: 403 },
    { method: "POST", path: `/api/operator/jobs/${jobId}/replay`, data: undefined, status: 403 },
  ];
  for (const attack of attacks) {
    const result = await otherPage.request.fetch(attack.path, {
      method: attack.method,
      headers: { origin },
      ...(attack.data ? { data: attack.data } : {}),
    });
    expect(result.status(), attack.path).toBe(attack.status);
    const body = await result.text();
    expect(body).not.toContain("Browser fixture shop A");
    expect(body).not.toContain(accounts.ownerA.email);
    expect(result.headers()["cache-control"]).toContain("no-store");
  }
  const privatePage = await otherPage.goto(`/shopkeeper/shops/${seedIds.shopA}`);
  expect(privatePage?.status()).toBe(404);
  await expect(otherPage.locator("main")).not.toContainText("Browser fixture shop A");
  const rsc = await otherPage.request.get(`/shopkeeper/shops/${seedIds.shopA}`, {
    headers: { RSC: "1" },
  });
  expect(rsc.status()).toBe(404);
  expect(await rsc.text()).not.toContain("Browser fixture shop A");
  const publicPage = await page.request.get("/");
  const publicText = await publicPage.text();
  expect(publicText).not.toContain(accounts.ownerA.email);
  expect(publicText).not.toContain("Browser fixture shop A");
  expect(
    (
      await page.request.patch(`/api/workspace/shops/${seedIds.shopA}`, {
        headers: { origin: "https://attacker.example" },
        data: { name: "Cross origin", version: 2 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch(`/api/workspace/shops/${seedIds.shopA}`, {
        headers: { origin },
        data: { name: "x".repeat(9000), version: 2 },
      })
    ).status(),
  ).toBe(422);
  await other.close();
});
test("operator MFA enrolls in the interface, gates Landlord, and challenges the next login", async ({
  page,
}) => {
  await login(page, accounts.operator, "/landlord");
  await expect(page).toHaveURL(/\/security$/);
  await page.getByLabel("Confirm your password", { exact: true }).fill(accounts.operator.password);
  await page.getByRole("button", { name: "Set up MFA", exact: true }).click();
  await expect(page.getByLabel("Authenticator setup URI", { exact: true })).toBeVisible();
  const uri = await page.getByLabel("Authenticator setup URI", { exact: true }).inputValue(),
    secret = new URL(uri).searchParams.get("secret")!;
  const recoveryCode = await page.locator(".secret-panel li code").first().textContent();
  await page.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
  await page.getByRole("button", { name: "Verify MFA", exact: true }).click();
  await expect(page).toHaveURL(/\/security\?verified=1$/);
  await page.getByRole("link", { name: "Landlord", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Care for the mall.", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/operator/jobs")).status()).toBe(200);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await login(page, accounts.operator, "/landlord");
  await expect(page.getByLabel("Authenticator code", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/operator/jobs")).status()).toBe(401);
  await page.getByRole("button", { name: "Use a recovery code", exact: true }).click();
  await page.getByLabel("Recovery code", { exact: true }).fill(recoveryCode!);
  await page.getByRole("button", { name: "Verify and sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Care for the mall.", exact: true }),
  ).toBeVisible();
});
