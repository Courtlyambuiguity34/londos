import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Pool } from "pg";
import { generate } from "otplib";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedDemonstration } from "../../src/server/db/demo-seed";
import { randomUUID } from "node:crypto";
test("mobile demonstration account controls support keyboard confirmation, MFA and bounded accessible layout", async ({
  page,
}) => {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw new Error("Disposable browser database required");
  const p = new Pool({ connectionString: process.env.DATABASE_URL }),
    directory = dirname(process.env.LONDOS_TEST_ACCOUNTS_FILE!),
    email = `mobile-demo-operator-${randomUUID()}@londos.invalid`,
    password = `Fictional-mobile-${randomUUID()}`;
  try {
    const auth = createAuth(p, coreConfig(), true);
    const created = await auth.api.signUpEmail({
      body: { email, password, name: "Fictional mobile operations" },
    });
    await p.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    await p.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'operations')", [
      created.user.id,
    ]);
    await seedDemonstration(p, auth, 12, directory);
  } finally {
    await p.end();
  }
  await page.goto("/sign-in?next=/landlord");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account security.", exact: true })).toBeVisible();
  await page.getByLabel("Confirm your password", { exact: true }).fill(password);
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const reason = page.getByLabel("Reason for removing this demonstration account").first();
  await reason.focus();
  await expect(reason).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("checkbox").first()).toBeFocused();
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({ path: "docs/evidence/images/g5-demo-mobile.png", fullPage: true });
});
