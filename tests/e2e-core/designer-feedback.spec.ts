import { test, expect } from "./fixture";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds } from "../../src/server/db/seed";

test("designer failures give safe actionable references; unsaved drafts cannot publish; stale sessions retain a security path", async ({
  page,
}) => {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw new Error("Disposable browser database required");
  // Better Auth's signup transaction queues verification through this pool;
  // retain a second connection for that callback, as the real runtime does.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const shop = randomUUID(),
    merchant = randomUUID();
  const workspace = `/shopkeeper/shops/${shop}/design`;
  const assistant = `/api/workspace/shops/${shop}/design/assistant`;
  const account = {
    email: `designer-feedback-${randomUUID()}@londos.invalid`,
    password: `Fictional-${randomUUID()}`,
  };
  try {
    const created = await createAuth(pool, coreConfig(), true).api.signUpEmail({
      body: { ...account, name: "Feedback test designer" },
    });
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Fictional feedback merchant')", [
      merchant,
    ]);
    await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
      merchant,
      created.user.id,
    ]);
    await pool.query(
      "INSERT INTO shops(id,merchant_id,mall_id,name,slug) SELECT $1,$2,mall_id,'Fictional feedback shop',$3 FROM shops WHERE id=$4",
      [shop, merchant, `feedback-${shop}`, seedIds.shopA],
    );
    await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [shop]);
    await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [
      shop,
    ]);
    await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [shop]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    const saved = await page.request.put(`/api/workspace/shops/${shop}/design`, {
      headers: { origin: coreConfig().baseURL },
      data: {
        version: 0,
        summary: "Fictional feedback draft",
        specification: {
          schemaVersion: 1,
          theme: "earth",
          announcement: "",
          spaces: [],
          actions: [],
        },
      },
    });
    expect(saved.status()).toBe(200);
    await page.goto(`${workspace}/assistant`);
    await expect(
      page.getByRole("heading", { name: "Design assistant", exact: true }),
    ).toBeVisible();
    const reference = "11111111-1111-4111-8111-111111111111";
    let response = { status: 422, error: "ai_context_limit" };
    await page.route(`**${assistant}`, (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: response.status,
            contentType: "application/json",
            headers: { "x-request-id": reference },
            body: JSON.stringify({ error: response.error, message: "PRIVATE-provider-response" }),
          })
        : route.continue(),
    );
    await page.getByLabel("Describe your design change", { exact: true }).fill("Use plum theme");
    await page.getByRole("button", { name: "Propose design change", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("saved layout is too large");
    await expect(page.getByRole("status")).toContainText(reference);
    await expect(page.getByRole("status")).not.toContainText("PRIVATE");
    response = { status: 503, error: "service_unavailable" };
    await page.getByRole("button", { name: "Propose design change", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "design service is temporarily unavailable",
    );
    await expect(page.getByRole("status")).not.toContainText("PRIVATE");
    await page.unroute(`**${assistant}`);

    // A failed status refresh must not overwrite a successful proposal response
    // with an inaccurate claim that the request itself failed.
    let proposalReturned = false;
    await page.route(`**${assistant}`, async (route) => {
      if (route.request().method() === "POST") {
        const result = await route.fetch();
        proposalReturned = result.ok();
        await route.fulfill({ response: result });
      } else if (proposalReturned) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "service_unavailable" }),
        });
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Propose design change", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("A validated proposal is ready");
    await expect(page.getByRole("status")).toContainText("latest status could not refresh");
    await expect(page.getByRole("link", { name: "Preview proposal", exact: true })).toBeVisible();
    const previewHref = await page
      .getByRole("link", { name: "Preview proposal", exact: true })
      .getAttribute("href");
    await page.unroute(`**${assistant}`);

    await page.goto(workspace);
    await page.getByRole("tab", { name: /^Style/ }).click();
    const theme = page.getByLabel("Shop theme", { exact: true });
    const current = await theme.inputValue();
    await theme.selectOption(current === "blue" ? "plum" : "blue");
    await expect(
      page.getByRole("note").filter({ hasText: "unsaved design changes" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /^Review & publish/ }).click();
    await page
      .getByRole("checkbox", {
        name: "I reviewed this saved draft and confirm publication",
        exact: true,
      })
      .check();
    await expect(
      page.getByRole("button", { name: "Publish reviewed draft", exact: true }),
    ).toBeDisabled();

    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Draft saved. Preview before publishing.");
    await page
      .getByRole("checkbox", { name: "I reviewed this saved draft and confirm publication" })
      .check();
    if (
      await page
        .getByRole("checkbox", {
          name: "I have reviewed the missing photos and want to publish this version anyway",
          exact: true,
        })
        .isVisible()
    )
      await page
        .getByRole("checkbox", {
          name: "I have reviewed the missing photos and want to publish this version anyway",
          exact: true,
        })
        .check();
    await page.getByRole("button", { name: "Publish reviewed draft", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Shop published.");
    const publicLink = page.getByRole("region", { name: "Public shop link" });
    await expect(publicLink).toContainText("Live on the mall");
    await expect(publicLink.getByRole("link", { name: "Open public shop" })).toBeVisible();
    await page
      .getByRole("checkbox", { name: "I reviewed this saved draft and confirm publication" })
      .check();
    await page.getByRole("button", { name: "Unpublish shop", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Shop unpublished.");
    await expect(publicLink).toContainText("Not published yet");
    await expect(publicLink.getByRole("link", { name: "Open public shop" })).toHaveCount(0);

    await pool.query(
      'UPDATE session SET "createdAt"=clock_timestamp()-interval \'6 minutes\' WHERE "userId"=$1',
      [created.user.id],
    );
    await page.goto(`${workspace}/assistant`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "For your security, sign in again",
    );
    await expect(
      page.getByRole("link", { name: "Open account security", exact: true }),
    ).toBeVisible();
    expect((await page.request.get(assistant)).status()).toBe(403);
    expect((await page.request.get(previewHref!)).status()).toBe(403);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await pool.end();
  }
});
