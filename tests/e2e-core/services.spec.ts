import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { generate } from "otplib";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";

test("operations setup warnings require native MFA and work without Redis on desktop and mobile", async ({
  page,
  request,
}, info) => {
  const anonymous = await request.get("/landlord/services", { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(anonymous.status());
  expect(anonymous.headers().location).toContain("/sign-in");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const account = {
    email: `service-operator-${randomUUID()}@londos.invalid`,
    password: `Fictional-${randomUUID()}`,
  };
  try {
    const auth = createAuth(pool, coreConfig(), true);
    const result = await auth.api.signUpEmail({
      body: { ...account, name: "Fictional service operator" },
    });
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [result.user.id]);
    await pool.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'operations')", [
      result.user.id,
    ]);
    await page.goto("/sign-in?next=/landlord");
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Account security.", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Confirm your password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Set up MFA", exact: true }).click();
    const secret = new URL(
      await page.getByLabel("Authenticator setup URI", { exact: true }).inputValue(),
    ).searchParams.get("secret")!;
    await page.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
    await page.getByRole("button", { name: "Verify MFA", exact: true }).click();
    await expect(page).toHaveURL(/verified=1/);
    const response = await page.goto("/landlord/services");
    expect(response!.headers()["cache-control"]).toContain("no-store");
    await expect(
      page.getByRole("heading", { name: "Service configuration", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("MongoDB: warning", { exact: true })).toBeVisible();
    await expect(page.getByText("Cloudinary: warning", { exact: true })).toBeVisible();
    await expect(page.getByText("Redis: disabled", { exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`services-${info.project.name}.png`),
      fullPage: true,
    });
    await pool.query(
      "UPDATE mfa_proofs SET verified_at=clock_timestamp()-interval '6 minutes' WHERE user_id=$1",
      [result.user.id],
    );
    await page.goto("/landlord/services");
    await expect(page).toHaveURL(/\/security/);
  } finally {
    await pool.end();
  }
});
