import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { generate } from "otplib";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
import type { CaptureInput } from "../../src/modules/analytics/contract";
const origin = "http://127.0.0.1:3101",
  browserAgent =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";
let accounts: SeedAccounts,
  reviewer: { email: string; password: string },
  shopName: string,
  department: string,
  product: string,
  captured: CaptureInput;
test.use({ userAgent: browserAgent });
test.describe.configure({ mode: "serial" });
async function db<T>(work: (p: Pool) => Promise<T>) {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await work(p);
  } finally {
    await p.end();
  }
}
async function count(event: string, source?: string) {
  return db(async (p) =>
    Number(
      (
        await p.query(
          "SELECT coalesce(sum(count),0)::text AS n FROM pilot_metrics WHERE shop_id=$1 AND event=$2 AND ($3::text IS NULL OR source=$3)",
          [seedIds.shopA, event, source ?? null],
        )
      ).rows[0].n,
    ),
  );
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
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw Error("Requires isolated browser database");
  accounts = JSON.parse(await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"));
  await db(async (p) => {
    await p.query("DELETE FROM pilot_metrics");
    await p.query("DELETE FROM pilot_receipts");
    reviewer = {
      email: `pilot-browser-${randomUUID()}@londos.example`,
      password: `Pilot-browser-${randomUUID()}`,
    };
    const created = await createAuth(p, coreConfig(), true).api.signUpEmail({
      body: { ...reviewer, name: "Fictional analytics reviewer" },
    });
    await p.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    await p.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'analytics')", [
      created.user.id,
    ]);
    shopName = (await p.query("SELECT name FROM shops WHERE id=$1", [seedIds.shopA])).rows[0].name;
    const result = (
      await p.query(
        "SELECT d.slug AS department,p.slug AS product FROM products p JOIN departments d ON d.id=p.department_id AND d.archived=false WHERE p.shop_id=$1 AND p.availability<>'archived' ORDER BY p.id LIMIT 1",
        [seedIds.shopA],
      )
    ).rows[0];
    department = result.department;
    product = result.product;
  });
});
test("direct and discovery navigation, search, department/product and contact intent produce bounded pilot observations", async ({
  page,
  browser,
}) => {
  page.on("request", (r) => {
    if (r.url().endsWith("/api/guest/pilot")) {
      const body = r.postDataJSON() as CaptureInput;
      if (body.event === "shop_viewed") captured = body;
    }
  });
  await page.goto("/shops/annette-fashion-house");
  await expect(page.getByRole("heading", { name: shopName, exact: true })).toBeVisible();
  await expect.poll(() => count("shop_viewed", "direct")).toBe(1);
  await expect.poll(() => count("direct_link_entry")).toBe(1);
  await page.goto(`/shops/annette-fashion-house/departments/${department}`);
  await expect.poll(() => count("department_viewed", "direct")).toBe(1);
  await page.goto(`/shops/annette-fashion-house/products/${product}`);
  await expect.poll(() => count("product_viewed", "direct")).toBe(1);
  await page.reload();
  await expect.poll(() => count("product_viewed", "direct")).toBe(2);
  expect(await count("direct_link_entry")).toBe(1);
  await page.getByRole("link", { name: "Enquire with the shop", exact: true }).click();
  await expect(page).toHaveURL(/\/contact\//);
  await expect.poll(() => count("contact_action_clicked", "direct")).toBe(1);
  const discovery = await browser.newContext({ userAgent: browserAgent }),
    other = await discovery.newPage();
  try {
    await other.goto("/");
    await other.getByRole("searchbox").fill("shoes");
    await other.getByRole("button", { name: "Search the mall", exact: true }).click();
    await expect(other).toHaveURL(/\/search\?q=shoes/);
    await other.getByRole("link", { name: shopName, exact: true }).click();
    await expect(other).toHaveURL(/\/shops\//);
    await expect.poll(() => count("shop_result_clicked", "discovery")).toBe(1);
    await expect.poll(() => count("shop_viewed", "discovery")).toBe(1);
    await db(async (p) => {
      const events = (
        await p.query("SELECT DISTINCT event FROM pilot_metrics ORDER BY event")
      ).rows.map((r) => r.event);
      expect(events).toEqual([
        "contact_action_clicked",
        "department_viewed",
        "direct_link_entry",
        "mall_visit",
        "product_viewed",
        "search_results_viewed",
        "search_submitted",
        "shop_result_clicked",
        "shop_viewed",
      ]);
    });
    const stored = await page.evaluate(() => sessionStorage.getItem("londos-pilot-navigation-v1"));
    expect(stored).not.toContain("visitor");
    expect(stored).not.toContain("shoes");
    expect(stored).not.toContain("http");
  } finally {
    await discovery.close();
  }
  const blocked = await browser.newContext({ userAgent: browserAgent });
  try {
    await blocked.addInitScript(() =>
      Object.defineProperty(window, "sessionStorage", {
        get() {
          throw new DOMException("Fictional blocked storage", "SecurityError");
        },
      }),
    );
    const p = await blocked.newPage();
    await p.goto("/shops/annette-fashion-house");
    await expect(p.getByRole("heading", { name: shopName, exact: true })).toBeVisible();
    await expect.poll(() => count("shop_viewed", "unattributed")).toBe(1);
    expect(await count("direct_link_entry")).toBe(1);
  } finally {
    await blocked.close();
  }
});
test("analytics methods and private HTML/Flight deny foreign access; abuse and capture outages leave browsing available", async ({
  page,
  request,
}) => {
  const paths = [`/api/workspace/shops/${seedIds.shopA}/analytics`, "/api/operator/analytics"];
  for (const path of paths) {
    const a = await request.get(path);
    expect(a.status()).toBe(401);
    expect(a.headers()["cache-control"]).toContain("no-store");
  }
  await login(page, accounts.ownerB);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  for (const path of paths) {
    const b = await page.request.get(path);
    expect([403, 404]).toContain(b.status());
    expect(await b.text()).not.toContain(shopName);
  }
  for (const path of [`/shopkeeper/shops/${seedIds.shopA}/analytics`, "/landlord/analytics"]) {
    for (const headers of [{}, { RSC: "1" }]) {
      const b = await page.request.get(path, { headers });
      expect([403, 404]).toContain(b.status());
      expect(await b.text()).not.toContain(shopName);
      expect(b.headers()["referrer-policy"]).toBe("no-referrer");
    }
  }
  const data = { ...captured, event: "search_submitted", source: null } as CaptureInput;
  expect(
    (
      await request.post("/api/guest/pilot", {
        headers: { origin: "https://attacker.example" },
        data,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/guest/pilot", {
        headers: { origin },
        data: { ...data, query: "PRIVATE-SENSITIVE-QUERY" },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await request.post("/api/guest/pilot", {
        headers: { origin },
        data: { ...data, token: "invalid-token" },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await request.post("/api/guest/pilot", {
        headers: { origin },
        data: { ...data, extra: "x".repeat(9000) },
      })
    ).status(),
  ).toBe(422);
  const before = await count("shop_viewed");
  expect(
    (
      await request.post("/api/guest/pilot", {
        headers: { origin, "sec-gpc": "1" },
        data: captured,
      })
    ).status(),
  ).toBe(202);
  expect(await count("shop_viewed")).toBe(before);
  await db(async (p) => {
    await p.query("ALTER TABLE pilot_metrics RENAME TO pilot_metrics_unavailable");
    try {
      const r = await request.post("/api/guest/pilot", { headers: { origin }, data });
      expect(r.status()).toBe(202);
      expect(await r.json()).toEqual({ received: true });
      const guest = await request.get("/shops/annette-fashion-house");
      expect(guest.status()).toBe(200);
      expect(await guest.text()).toContain("Enquire with the shop");
    } finally {
      await p.query("ALTER TABLE pilot_metrics_unavailable RENAME TO pilot_metrics");
    }
  });
  await page.route("**/api/guest/pilot", (route) => route.abort());
  await page.goto("/shops/annette-fashion-house");
  await expect(page.getByRole("heading", { name: shopName, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Enquire with the shop", exact: true }).click();
  await expect(page).toHaveURL(/\/contact\//);
});
test("native owner and fresh-MFA analytics-only operator see truthful accessible aggregate dashboards", async ({
  page,
  browser,
}) => {
  await login(page, accounts.ownerA);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  await page.goto(`/shopkeeper/shops/${seedIds.shopA}/analytics`);
  await expect(
    page.getByRole("heading", { name: `Analytics for ${shopName}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/not unique people/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/images/x2-p9-analytics-owner-desktop.png",
    fullPage: true,
  });
  const opContext = await browser.newContext(),
    op = await opContext.newPage();
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
    await op.goto("/landlord/analytics");
    await expect(op.getByRole("heading", { name: "Pilot analytics", exact: true })).toBeVisible();
    await expect(
      op.getByRole("heading", { name: "Development renewals", exact: true }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page: op }).analyze()).violations).toEqual([]);
    await op.screenshot({
      path: "docs/evidence/images/x2-p9-analytics-operator-desktop.png",
      fullPage: true,
    });
    expect((await op.request.get("/api/operator/incidents")).status()).toBe(403);
    expect((await op.request.get("/api/operator/applications")).status()).toBe(403);
  } finally {
    await opContext.close();
  }
});
