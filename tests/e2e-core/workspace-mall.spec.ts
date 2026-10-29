import { test, expect } from "./fixture";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { generate } from "otplib";
import { Pool } from "pg";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import type { SeedAccounts } from "../../src/server/db/seed";

for (const installed of [false, true]) {
  test.describe(installed ? "Installed-app detection" : "Browser", () => {
    for (const role of ["shopkeeper", "landlord"] as const) {
      test(`${role} can visit the mall and return without losing public navigation`, async ({
        page,
      }) => {
        test.setTimeout(60000);
        if (installed) {
          // Exercise the installed-iOS detection branch, without claiming to
          // install an app on a physical phone or desktop.
          await page.addInitScript(() =>
            Object.defineProperty(navigator, "standalone", { get: () => true }),
          );
        }
        // Better Auth can queue verification while its signup transaction is
        // open, so account creation needs a second connection in this fixture.
        const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
        try {
          await requireDevelopmentDatabase(pool);
          const accounts = JSON.parse(
            await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"),
          ) as SeedAccounts;
          let account: Pick<SeedAccounts["ownerA"], "email" | "password"> = accounts.ownerA;
          if (role === "landlord") {
            account = {
              email: `mall-navigation-${randomUUID()}@londos.invalid`,
              password: `Fictional-navigation-${randomUUID()}`,
            };
            const result = await createAuth(pool, coreConfig(), true).api.signUpEmail({
              body: { ...account, name: "Fictional navigation reviewer" },
            });
            await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [
              result.user.id,
            ]);
            await pool.query(
              "INSERT INTO operator_grants(user_id,permission) VALUES($1,'review')",
              [result.user.id],
            );
          }
          await page.goto(`/sign-in?next=/${role}`);
          await page.getByLabel("Email", { exact: true }).fill(account.email);
          await page.getByLabel("Password", { exact: true }).fill(account.password);
          await page.getByRole("button", { name: "Sign in", exact: true }).click();
          if (role === "landlord") {
            await expect(page).toHaveURL(/\/security$/);
            await page.getByLabel("Confirm your password", { exact: true }).fill(account.password);
            await page.getByRole("button", { name: "Set up MFA", exact: true }).click();
            const uri = await page
              .getByLabel("Authenticator setup URI", { exact: true })
              .inputValue();
            await page
              .getByLabel("Authenticator code", { exact: true })
              .fill(await generate({ secret: new URL(uri).searchParams.get("secret")! }));
            await page.getByRole("button", { name: "Verify MFA", exact: true }).click();
            await expect(page).toHaveURL(/\/security\?verified=1$/);
          } else {
            await expect(
              page.getByRole("heading", { name: "Your shops.", exact: true }),
            ).toBeVisible();
          }

          // Start from a freshly loaded private root layout, matching an app
          // launched from the Shopkeeper/Management install shortcut.
          await page.goto(`/${role}`);
          await expect(page.locator(".portal-shell")).toBeVisible();
          await expect(page.locator(".site-header")).toHaveCount(0);
          await expect(page.locator(".site-footer")).toHaveCount(0);
          await page.getByRole("link", { name: "Visit mall", exact: true }).click();
          await expect(page).toHaveURL((url) => url.pathname === "/");
          await expect(page.locator(".site-header")).toBeInViewport();
          await expect(page.locator(".site-footer")).toBeVisible();

          // Client back/forward navigation must also hide public chrome when
          // returning to the private workspace, then restore it in the mall.
          await page.goBack();
          await expect(page.locator(".portal-shell")).toBeVisible();
          await expect(page.locator(".site-header")).toHaveCount(0);
          await expect(page.locator(".site-footer")).toHaveCount(0);
          await page.getByRole("link", { name: "Visit mall", exact: true }).click();
          await expect(page.locator(".site-header")).toBeInViewport();
          await page
            .locator(".site-footer")
            .getByRole("link", { name: "Explore the mall", exact: true })
            .click();
          await expect(page).toHaveURL((url) => url.pathname === "/search");
          await expect(page.locator(".site-header")).toBeInViewport();
          const menu = page.locator(".mobile-navigation summary");
          if (await menu.isVisible()) {
            await expect(menu).toBeInViewport();
            await menu.click();
            await page
              .getByRole("navigation", { name: "Mobile navigation" })
              .getByRole("link", { name: "Our mall", exact: true })
              .click();
          } else {
            await page
              .getByRole("navigation", { name: "Main navigation" })
              .getByRole("link", { name: "Our mall", exact: true })
              .click();
          }
          await expect(page).toHaveURL(/\/about$/);
          await page
            .locator(".site-footer")
            .getByRole("link", { name: "Privacy", exact: true })
            .click();
          await expect(page).toHaveURL(/\/privacy$/);
          await page
            .locator(".site-footer")
            .getByRole("link", { name: "Londos home", exact: true })
            .click();
          await expect(page).toHaveURL((url) => url.pathname === "/");
          await expect(page.locator(".site-header")).toBeInViewport();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        } finally {
          await pool.end();
        }
      });
    }
  });
}
