import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Pool } from "pg";
import { generate } from "otplib";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
const originHeaders = { Origin: "http://127.0.0.1:3101" };
const base = `/api/workspace/merchants/${seedIds.merchantA}/privacy`;
let accounts: SeedAccounts, reviewer: { email: string; password: string }, target: string;
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
      email: `privacy-browser-${randomUUID()}@londos.example`,
      password: `Privacy-browser-${randomUUID()}`,
    };
    const created = await createAuth(p, coreConfig(), true).api.signUpEmail({
      body: { ...reviewer, name: "Fictional privacy reviewer" },
    });
    await p.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    await p.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'privacy')", [
      created.user.id,
    ]);
    target = randomUUID();
    await p.query(
      "INSERT INTO guest_requests(id,shop_id,merchant_id,request_key,fingerprint,kind,name,reply_to,message,status,closed_at) VALUES($1,$2,$3,$4,$5,'enquiry','FICTIONAL PRIVACY NAME','FICTIONAL PRIVATE REPLY','FICTIONAL PRIVATE MESSAGE','closed',now()-interval '31 days')",
      [target, seedIds.shopA, seedIds.merchantA, randomUUID(), "a".repeat(64)],
    );
  });
});
test("owner downloads bounded data and scoped native MFA review holds, releases and executes primary-only erasure", async ({
  page,
  browser,
}) => {
  await login(page, accounts.ownerA);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.goto(`/shopkeeper/merchants/${seedIds.merchantA}/privacy`);
  await expect(
    page.getByRole("heading", { name: "Business data and privacy", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download section", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("londos-shops.json");
  const exported = await page.request.post(base + "/export", {
    headers: originHeaders,
    data: { section: "shops", confirm: true },
  });
  expect(exported.status()).toBe(200);
  expect(exported.headers()["cache-control"]).toContain("no-store");
  expect(await exported.text()).not.toContain("FICTIONAL PRIVATE REPLY");
  await page.getByLabel("Data to review", { exact: true }).selectOption(`enquiry:${target}`);
  await page
    .getByLabel("Why are you requesting this review?", { exact: true })
    .fill("Review this fictional closed enquiry after its retention period.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Request privacy review", exact: true }).click();
  await expect(
    page.getByText("Request recorded. Manual review is required; no data has been erased."),
  ).toBeVisible();
  const id = await db(
    async (p) =>
      (await p.query("SELECT id FROM privacy_requests WHERE target_id=$1", [target])).rows[0]
        .id as string,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/images/x2-p9-privacy-owner-desktop.png",
    fullPage: true,
  });
  const context = await browser.newContext(),
    op = await context.newPage();
  const worker = spawn(process.execPath, ["dist/worker.mjs"], {
    stdio: "ignore",
    env: process.env,
  });
  try {
    await login(op, reviewer, "/landlord");
    await expect(op.getByRole("heading", { name: "Account security." })).toBeVisible();
    await op.getByLabel("Confirm your password", { exact: true }).fill(reviewer.password);
    await op.getByRole("button", { name: "Set up MFA", exact: true }).click();
    const secret = new URL(
      await op.getByLabel("Authenticator setup URI", { exact: true }).inputValue(),
    ).searchParams.get("secret")!;
    await op.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
    await op.getByRole("button", { name: "Verify MFA" }).click();
    await expect(op).toHaveURL(/verified=1/);
    expect((await op.request.get(`/api/operator/privacy/${id}`)).status()).toBe(404);
    await op.goto("/landlord/privacy");
    await op
      .getByLabel("Assignment reason", { exact: true })
      .fill("Fictional scoped privacy review assignment.");
    await op.getByRole("checkbox").check();
    await op.getByRole("button", { name: "Claim enquiry review", exact: true }).click();
    await expect(op).toHaveURL(new RegExp(`/landlord/privacy/${id}$`));
    async function decision(action: string, explanation: string) {
      await op.getByLabel("Review decision", { exact: true }).selectOption(action);
      await op
        .getByLabel("Private review reason", { exact: true })
        .fill("PRIVATE OPERATOR SENTINEL retention review.");
      await op.getByLabel("Owner-visible explanation", { exact: true }).fill(explanation);
      await op.getByRole("checkbox").check();
      await op.getByRole("button", { name: "Record privacy decision", exact: true }).click();
      await expect(op.getByRole("status")).toContainText("Decision recorded.");
    }
    await decision("hold", "Fictional review hold requires reconciliation.");
    await page.reload();
    await expect(
      page.getByText("Fictional review hold requires reconciliation.", { exact: true }).first(),
    ).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain("PRIVATE OPERATOR SENTINEL");
    await decision("release", "Fictional hold reconciled and released.");
    expect((await new AxeBuilder({ page: op }).analyze()).violations).toEqual([]);
    await op.screenshot({
      path: "docs/evidence/images/x2-p9-privacy-review-desktop.png",
      fullPage: true,
    });
    await decision("approve", "Approved eligible fictional primary erasure only.");
    await expect
      .poll(
        async () =>
          db(
            async (p) =>
              (await p.query("SELECT state FROM privacy_requests WHERE id=$1", [id])).rows[0].state,
          ),
        { timeout: 15000 },
      )
      .toBe("completed");
    await op.getByRole("button", { name: "Refresh execution status", exact: true }).click();
    await expect(
      op.getByText("Primary SQL erasure verified; backup and external-copy obligations remain.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await db(
        async (p) =>
          (await p.query("SELECT name,reply_to,message FROM guest_requests WHERE id=$1", [target]))
            .rows[0],
      ),
    ).toEqual({ name: "[Erased]", reply_to: "[Erased]", message: "[Erased]" });
    for (const path of ["applications", "incidents", "analytics"])
      expect((await op.request.get(`/api/operator/${path}`)).status()).toBe(403);
  } finally {
    worker.kill("SIGTERM");
    if (worker.exitCode === null) await once(worker, "exit");
    await context.close();
  }
});
test("privacy endpoints and HTML/Flight reject anonymous and foreign owners, and strict writes reject forged fields and origins", async ({
  page,
  request,
}) => {
  const id = await db(
    async (p) =>
      (await p.query("SELECT id FROM privacy_requests WHERE target_id=$1", [target])).rows[0]
        .id as string,
  );
  const ownerBody = {
    action: "request",
    key: randomUUID(),
    kind: "history",
    target: seedIds.shopA,
    reason: "Fictional retained history review.",
    confirm: true,
  };
  const calls = [
    () => request.get(base),
    () => request.post(base, { headers: originHeaders, data: ownerBody }),
    () =>
      request.post(base + "/export", {
        headers: originHeaders,
        data: { section: "shops", confirm: true },
      }),
    () => request.get("/api/operator/privacy"),
    () => request.get(`/api/operator/privacy/${id}`),
    () =>
      request.post(`/api/operator/privacy/${id}/claim`, {
        headers: originHeaders,
        data: { version: 1, reason: "Fictional assignment.", confirm: true },
      }),
    () =>
      request.post(`/api/operator/privacy/${id}`, {
        headers: originHeaders,
        data: {
          action: "deny",
          version: 1,
          reason: "Private retention reason.",
          explanation: "Required history retained.",
          confirm: true,
        },
      }),
  ];
  for (const call of calls) expect((await call()).status()).toBe(401);
  await login(page, accounts.ownerB);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  for (const headers of [{}, { RSC: "1" }]) {
    const r = await page.request.get(`/shopkeeper/merchants/${seedIds.merchantA}/privacy`, {
      headers,
      maxRedirects: 0,
    });
    expect(r.status()).toBe(404);
    expect(await r.text()).not.toContain("FICTIONAL PRIVATE");
  }
  expect((await page.request.get(base)).status()).toBe(404);
  expect(
    (await page.request.post(base, { headers: originHeaders, data: ownerBody })).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post(base + "/export", {
        headers: originHeaders,
        data: { section: "shops", confirm: true },
      })
    ).status(),
  ).toBe(404);
  for (const path of ["/landlord/privacy", `/landlord/privacy/${id}`])
    for (const headers of [{}, { RSC: "1" }]) {
      const denied = await page.request.get(path, { headers, maxRedirects: 0 });
      expect(denied.status()).toBe(403);
      expect(denied.headers()["cache-control"]).toContain("no-store");
      expect(await denied.text()).not.toContain("PRIVATE OPERATOR SENTINEL");
    }
  for (const path of ["/api/operator/privacy", `/api/operator/privacy/${id}`])
    expect((await page.request.get(path)).status()).toBe(403);
  expect(
    (
      await page.request.post(`/api/operator/privacy/${id}/claim`, {
        headers: originHeaders,
        data: { version: 1, reason: "Fictional assignment.", confirm: true },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post(`/api/operator/privacy/${id}`, {
        headers: originHeaders,
        data: {
          action: "deny",
          version: 1,
          reason: "Private retention reason.",
          explanation: "Required history retained.",
          confirm: true,
        },
      })
    ).status(),
  ).toBe(403);
  await login(page, accounts.ownerA);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  expect(
    (
      await page.request.post(base, {
        headers: originHeaders,
        data: { ...ownerBody, actorId: "forged" },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await page.request.post(base, {
        data: ownerBody,
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
});
