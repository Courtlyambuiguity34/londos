import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Pool } from "pg";
import { generate } from "otplib";
import { seedDemonstration } from "../../src/server/db/demo-seed";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { randomUUID } from "node:crypto";
const origin = { Origin: "http://127.0.0.1:3101" };
let operatorAccount: { email: string; password: string },
  target: { id: string; email: string; password: string },
  label: string;
test.beforeAll(async () => {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw new Error("Disposable browser database required");
  const directory = dirname(process.env.LONDOS_TEST_ACCOUNTS_FILE!),
    p = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const auth = createAuth(p, coreConfig(), true);
    operatorAccount = {
      email: `desktop-demo-operator-${randomUUID()}@londos.invalid`,
      password: `Fictional-desktop-${randomUUID()}`,
    };
    const created = await auth.api.signUpEmail({
      body: { ...operatorAccount, name: "Fictional desktop operations" },
    });
    await p.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    await p.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'operations')", [
      created.user.id,
    ]);
    await seedDemonstration(p, auth, 12, directory);
    const demos = JSON.parse(
      await readFile(`${directory}/demonstration-accounts.json`, "utf8"),
    ) as { id: string; email: string; password: string }[];
    target = demos[11]!;
    label = (await p.query("SELECT label FROM demo_accounts WHERE user_id=$1", [target.id])).rows[0]
      .label;
  } finally {
    await p.end();
  }
});
test("native operator MFA removes a demo account through accessible admin controls; private methods and login remain guarded", async ({
  page,
  browser,
  request,
}) => {
  const anonymous = await request.get("/api/operator/demo-accounts");
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()["cache-control"]).toContain("no-store");
  await page.goto("/sign-in?next=/landlord");
  await page.getByLabel("Email", { exact: true }).fill(operatorAccount.email);
  await page.getByLabel("Password", { exact: true }).fill(operatorAccount.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account security.", exact: true })).toBeVisible();
  await page.getByLabel("Confirm your password", { exact: true }).fill(operatorAccount.password);
  await page.getByRole("button", { name: "Set up MFA", exact: true }).click();
  const secret = new URL(
    await page.getByLabel("Authenticator setup URI", { exact: true }).inputValue(),
  ).searchParams.get("secret")!;
  await page.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
  await page.getByRole("button", { name: "Verify MFA", exact: true }).click();
  await expect(page).toHaveURL(/verified=1/);
  await page.goto("/landlord/demo-accounts");
  await expect(
    page.getByRole("heading", { name: "Demonstration accounts", exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const path = `/api/operator/demo-accounts/${target.id}/retire`,
    body = { version: 1, reason: "Fictional browser clean-up", confirm: true };
  expect(
    (
      await page.request.post(path, { headers: { Origin: "https://attacker.example" }, data: body })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post(path, { headers: origin, data: { ...body, actorId: "forged" } })
    ).status(),
  ).toBe(422);
  const other = await browser.newContext();
  try {
    const owner = await other.newPage();
    await owner.goto("/sign-in");
    await owner.getByLabel("Email", { exact: true }).fill(target.email);
    await owner.getByLabel("Password", { exact: true }).fill(target.password);
    await owner.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(owner.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    expect((await owner.request.get("/api/operator/demo-accounts")).status()).toBe(403);
    const row = page
      .locator(".workspace-list > li")
      .filter({ has: page.getByText(label, { exact: true }) });
    await row
      .getByLabel("Reason for removing this demonstration account")
      .fill("Remove the fictional sample after testing merchant access.");
    await row.getByRole("checkbox").check();
    await row.getByRole("button", { name: "Remove demonstration account", exact: true }).click();
    await expect(row.getByText("Removed", { exact: true })).toBeVisible();
    expect((await owner.request.get("/api/workspace/shops")).status()).toBe(401);
    await mkdir("docs/evidence/images", { recursive: true });
    await page.screenshot({ path: "docs/evidence/images/g5-demo-desktop.png", fullPage: true });
  } finally {
    await other.close();
  }
});
