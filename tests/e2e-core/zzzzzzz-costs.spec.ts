import { test, expect, type Page } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { generate } from "otplib";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
const originHeaders = { Origin: "http://127.0.0.1:3101" },
  owner = `/api/workspace/shops/${seedIds.shopA}/costs`,
  journal = `/api/operator/costs/shops/${seedIds.shopA}`;
let accounts: SeedAccounts,
  reviewer: { email: string; password: string },
  shopName: string,
  reviewerRecoveryCode: string;
test.describe.configure({ mode: "serial" });
async function db<T>(work: (p: Pool) => Promise<T>) {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw Error("Requires isolated browser database");
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await work(p);
  } finally {
    await p.end();
  }
}
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
test.beforeAll(async () => {
  accounts = JSON.parse(await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"));
  await db(async (p) => {
    reviewer = {
      email: `costs-browser-${randomUUID()}@londos.example`,
      password: `Fictional-costs-${randomUUID()}`,
    };
    const created = await createAuth(p, coreConfig(), true).api.signUpEmail({
      body: { ...reviewer, name: "Fictional costs-only operator" },
    });
    await p.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    await p.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'costs')", [
      created.user.id,
    ]);
    shopName = (await p.query("SELECT name FROM shops WHERE id=$1", [seedIds.shopA])).rows[0].name;
  });
});
test("native fresh-MFA scoped operator records and corrects reported work while owner resource figures stay private and truthful", async ({
  page,
  browser,
}) => {
  await login(page, accounts.ownerA);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.goto(`/shopkeeper/shops/${seedIds.shopA}/costs`);
  await expect(
    page.getByRole("heading", { name: `Resources for ${shopName}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No operating work has been reported in this window. Actual time and expenses are unmeasured.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Unavailable measurements", exact: true }),
  ).toBeVisible();
  const totals = await page.request.get(owner);
  expect(totals.status()).toBe(200);
  expect(totals.headers()["cache-control"]).toContain("no-store");
  const result = await totals.json();
  const measured = await db(async (p) =>
    String(
      (
        await p.query(
          "SELECT coalesce(sum(octet_length(b.bytes)),0)::text AS n FROM media_blobs b JOIN media_assets a ON a.id=b.asset_id WHERE a.shop_id=$1 AND a.created_by IS NOT NULL AND a.state<>'deleted'",
          [seedIds.shopA],
        )
      ).rows[0].n,
    ),
  );
  expect(
    result.resource.blobs
      .reduce((n: bigint, b: { bytes: string }) => n + BigInt(b.bytes), 0n)
      .toString(),
  ).toBe(measured);
  const context = await browser.newContext(),
    op = await context.newPage();
  try {
    await login(op, reviewer, "/landlord");
    await expect(op.getByRole("heading", { name: "Account security.", exact: true })).toBeVisible();
    await op.getByLabel("Confirm your password", { exact: true }).fill(reviewer.password);
    await op.getByRole("button", { name: "Set up MFA", exact: true }).click();
    const secret = new URL(
      await op.getByLabel("Authenticator setup URI", { exact: true }).inputValue(),
    ).searchParams.get("secret")!;
    reviewerRecoveryCode = (await op.locator(".secret-panel li code").first().textContent())!;
    await op.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
    await op.getByRole("button", { name: "Verify MFA", exact: true }).click();
    await expect(op).toHaveURL(/verified=1/);
    expect((await op.request.get(journal)).status()).toBe(404);
    await op.goto("/landlord/costs");
    await expect(
      op.getByRole("heading", { name: "Platform resources and reported costs", exact: true }),
    ).toBeVisible();
    const row = op
      .locator("li")
      .filter({ has: op.getByRole("heading", { name: shopName, exact: true }) });
    await row
      .getByLabel("Cost scope reason", { exact: true })
      .fill("Fictional reporting for the selected shop.");
    await row.getByRole("checkbox").check();
    await row.getByRole("button", { name: "Claim cost reporting scope", exact: true }).click();
    await expect(op).toHaveURL(new RegExp(`/landlord/costs/${seedIds.shopA}$`));
    await op.getByLabel("Work category", { exact: true }).selectOption("verification");
    await op.getByLabel("Reported minutes", { exact: true }).fill("25");
    await op.getByLabel("Reported UGX expense minor units", { exact: true }).fill("1500");
    await op
      .getByLabel("Private reporting reason", { exact: true })
      .fill("PRIVATE COST BROWSER SENTINEL fictional verification work.");
    await op.getByRole("checkbox").check();
    await op.getByRole("button", { name: "Record reported work", exact: true }).click();
    await expect(op.getByRole("status")).toContainText("Reported entry recorded.");
    await page.reload();
    await expect(
      page.getByText("25 net reported minutes · UGX 1500 net reported expense minor units", {
        exact: true,
      }),
    ).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain("PRIVATE COST BROWSER SENTINEL");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect((await new AxeBuilder({ page: op }).analyze()).violations).toEqual([]);
    await mkdir("docs/evidence/images", { recursive: true });
    await page.screenshot({
      path: "docs/evidence/images/x2-p9-costs-owner-desktop.png",
      fullPage: true,
    });
    await op.screenshot({
      path: "docs/evidence/images/x2-p9-costs-journal-desktop.png",
      fullPage: true,
    });
    await op
      .getByLabel("Correction reason", { exact: true })
      .fill("Correct this fictional duplicate reported expense.");
    await op.getByRole("checkbox", { name: /Append an exact reversal/ }).check();
    await op.getByRole("button", { name: "Reverse reported entry", exact: true }).click();
    await expect
      .poll(
        async () => (await (await op.request.get(journal)).json()).reported[0]?.net_expense_minor,
      )
      .toBe("0");
    await page.reload();
    await expect(
      page.getByText("0 net reported minutes · UGX 0 net reported expense minor units", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("1 original entries · 1 corrections. Reporting completeness is unknown.", {
        exact: true,
      }),
    ).toBeVisible();
    for (const path of [
      "/api/operator/applications",
      "/api/operator/incidents",
      "/api/operator/privacy",
      "/api/operator/analytics",
    ])
      expect((await op.request.get(path)).status()).toBe(403);
  } finally {
    await context.close();
  }
});
test("all five resource methods and private HTML/Flight reject anonymous, foreign and unscoped access; writes keep origin and schema checks", async ({
  page,
  request,
}) => {
  const record = {
    action: "record",
    key: randomUUID(),
    version: 0,
    category: "support",
    workDay: new Date().toISOString().slice(0, 10),
    minutes: 1,
    expenseMinor: 0,
    currency: "UGX",
    reason: "Fictional resource entry.",
    confirm: true,
  };
  const calls = [
    () => request.get(owner),
    () => request.get("/api/operator/costs"),
    () => request.get(journal),
    () => request.post(journal, { headers: originHeaders, data: record }),
    () =>
      request.post(journal + "/claim", {
        headers: originHeaders,
        data: { shopVersion: 1, reason: "Fictional scope.", confirm: true },
      }),
  ];
  for (const call of calls) {
    const r = await call();
    expect(r.status()).toBe(401);
    expect(r.headers()["cache-control"]).toContain("no-store");
    expect(r.headers()["referrer-policy"]).toBe("no-referrer");
  }
  await login(page, accounts.ownerB);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  expect((await page.request.get(owner)).status()).toBe(404);
  for (const path of ["/api/operator/costs", journal])
    expect((await page.request.get(path)).status()).toBe(403);
  expect(
    (await page.request.post(journal, { headers: originHeaders, data: record })).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post(journal + "/claim", {
        headers: originHeaders,
        data: { shopVersion: 1, reason: "Fictional scope.", confirm: true },
      })
    ).status(),
  ).toBe(403);
  for (const path of [
    `/shopkeeper/shops/${seedIds.shopA}/costs`,
    "/landlord/costs",
    `/landlord/costs/${seedIds.shopA}`,
  ])
    for (const headers of [{}, { RSC: "1" }]) {
      const r = await page.request.get(path, { headers, maxRedirects: 0 });
      expect([403, 404]).toContain(r.status());
      expect(await r.text()).not.toContain("PRIVATE COST BROWSER");
      expect(r.headers()["referrer-policy"]).toBe("no-referrer");
    }
  await login(page, reviewer, "/landlord");
  await expect(page.getByLabel("Authenticator code", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/operator/costs")).status()).toBe(401);
  await page.getByRole("button", { name: "Use a recovery code", exact: true }).click();
  await page.getByLabel("Recovery code", { exact: true }).fill(reviewerRecoveryCode);
  await page.getByRole("button", { name: "Verify and sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Manage your mall with clarity.", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/operator/costs")).status()).toBe(200);
  expect(
    (
      await page.request.post(journal, {
        headers: originHeaders,
        data: { ...record, actorId: "forged" },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await page.request.post(journal, {
        headers: { Origin: "https://attacker.example" },
        data: record,
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.get(owner + "?days=999")).status()).toBe(422);
  expect((await page.request.get("/api/operator/costs?after=forged")).status()).toBe(422);
  await db(async (p) => {
    await p.query("DELETE FROM operator_cost_scopes WHERE shop_id=$1", [seedIds.shopA]);
  });
  expect((await page.request.get(journal)).status()).toBe(404);
  expect(
    (await page.request.post(journal, { headers: originHeaders, data: record })).status(),
  ).toBe(404);
  for (const headers of [{}, { RSC: "1" }])
    expect((await page.request.get(`/landlord/costs/${seedIds.shopA}`, { headers })).status()).toBe(
      404,
    );
});
