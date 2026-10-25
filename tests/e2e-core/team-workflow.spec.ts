import { test, expect, type Page } from "./fixture";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds } from "../../src/server/db/seed";

async function ownTeam(page: Page, secondOwner = false) {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw new Error("Disposable browser database required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const merchant = randomUUID(),
    auth = createAuth(pool, coreConfig(), true);
  const owner = {
    email: `team-owner-${randomUUID()}@londos.invalid`,
    password: `Fictional-${randomUUID()}`,
  };
  const colleague = {
    email: `team-colleague-${randomUUID()}@londos.invalid`,
    password: `Fictional-${randomUUID()}`,
  };
  try {
    const created = await auth.api.signUpEmail({
      body: { ...owner, name: "Fictional team owner" },
    });
    const employee = await auth.api.signUpEmail({
      body: { ...colleague, name: "Fictional team colleague" },
    });
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=ANY($1::text[])', [
      [created.user.id, employee.user.id],
    ]);
    await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Fictional workflow team')", [
      merchant,
    ]);
    await pool.query(
      "INSERT INTO memberships(merchant_id,user_id,role,permissions) VALUES($1,$2,'owner','{}'),($1,$3,$4,ARRAY['catalogue','design'])",
      [merchant, created.user.id, employee.user.id, secondOwner ? "owner" : "staff"],
    );
    const shops: string[] = [];
    for (let index = 0; index < 21; index++) {
      const shop = randomUUID();
      shops.push(shop);
      await pool.query(
        "INSERT INTO shops(id,merchant_id,mall_id,name,slug) VALUES($1,$2,$3,$4,$5)",
        [
          shop,
          merchant,
          seedIds.mallA,
          `Workflow shop ${String(index).padStart(2, "0")}`,
          `workflow-${shop}`,
        ],
      );
      await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [
        shop,
      ]);
      await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [shop]);
      await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [shop]);
    }
    await page.goto("/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(owner.email);
    await page.getByLabel("Password", { exact: true }).fill(owner.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
    return {
      pool,
      owner,
      ownerId: created.user.id,
      colleague,
      colleagueId: employee.user.id,
      shops,
      merchant,
      page: `/shopkeeper/merchants/${merchant}/team`,
      api: `/api/workspace/merchants/${merchant}/team`,
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
async function confirm(page: Page) {
  await page
    .getByRole("checkbox", {
      name: "I reviewed the selected access change and confirm it",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save team change", exact: true }).click();
}

test("team shop pages retain staff selections and confirmed changes survive a failed refresh", async ({
  page,
}) => {
  const fixture = await ownTeam(page);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(fixture.page);
    await page
      .getByRole("navigation", { name: "Shops pages" })
      .getByRole("link", { name: "Next shops", exact: true })
      .click();
    await expect(page).toHaveURL(/shopsPage=1/);
    await page.getByLabel("Team action", { exact: true }).selectOption("staff_shop");
    await expect(page.getByLabel("Team member", { exact: true }).locator("option")).toHaveCount(3);
    await page.getByLabel("Team member", { exact: true }).selectOption(fixture.colleagueId);
    await page.getByLabel("Staff shop", { exact: true }).selectOption(fixture.shops[20]!);
    await page.getByRole("checkbox", { name: "Catalogue", exact: true }).check();
    await confirm(page);
    await expect(page.getByRole("status")).toHaveText("Team change saved.");
    expect(
      (
        await fixture.pool.query(
          "SELECT permissions FROM staff_shop_grants WHERE shop_id=$1 AND user_id=$2",
          [fixture.shops[20], fixture.colleagueId],
        )
      ).rows[0].permissions,
    ).toEqual(["catalogue"]);
    await page.route(`**${fixture.api}*`, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "service_unavailable" }),
          })
        : route.continue(),
    );
    await page.getByLabel("Team member", { exact: true }).selectOption(fixture.colleagueId);
    await page.getByLabel("Staff shop", { exact: true }).selectOption(fixture.shops[20]!);
    await page.getByRole("checkbox", { name: "Design", exact: true }).check();
    await confirm(page);
    await expect(page.getByRole("status")).toContainText(
      "Team change saved. Current team details could not reload",
    );
    await expect(
      page.getByRole("button", { name: "Save team change", exact: true }),
    ).toBeDisabled();
    expect(
      (
        await fixture.pool.query(
          "SELECT permissions FROM staff_shop_grants WHERE shop_id=$1 AND user_id=$2",
          [fixture.shops[20], fixture.colleagueId],
        )
      ).rows[0].permissions,
    ).toEqual(["design"]);
    await page.unroute(`**${fixture.api}*`);
    await page.getByRole("button", { name: "Reload team", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Current team reloaded.");
    await expect(page.getByRole("button", { name: "Save team change", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await fixture.pool.end();
  }
});

test("self-demotion confirms the saved change and leaves a safe exit without owner controls", async ({
  page,
}) => {
  const fixture = await ownTeam(page, true);
  try {
    await page.goto(fixture.page);
    await page.getByLabel("Team action", { exact: true }).selectOption("membership");
    await page.getByLabel("Team member", { exact: true }).selectOption(fixture.ownerId);
    await page.getByLabel("Membership role", { exact: true }).selectOption("staff");
    await page.getByRole("checkbox", { name: "Catalogue", exact: true }).check();
    await confirm(page);
    await expect(page.getByRole("status")).toContainText(
      "Team change saved. Current team details could not reload",
    );
    await expect(
      page.getByRole("button", { name: "Save team change", exact: true }),
    ).toBeDisabled();
    expect((await page.request.get(fixture.api)).status()).toBe(404);
    expect(
      (
        await fixture.pool.query(
          "SELECT role FROM memberships WHERE merchant_id=$1 AND user_id=$2",
          [fixture.merchant, fixture.ownerId],
        )
      ).rows[0].role,
    ).toBe("staff");
    await page.getByRole("link", { name: "Return to your shops", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
  } finally {
    await fixture.pool.end();
  }
});

test("invalid team pages fail safely and stale owners see recovery guidance without private team data", async ({
  page,
}) => {
  const fixture = await ownTeam(page);
  try {
    for (const path of [
      "/shopkeeper/team?page=abc",
      `${fixture.page}?shopsPage=abc`,
      `${fixture.page}?membersPage=-1`,
    ]) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(404);
    }
    expect((await page.request.get(`${fixture.api}?shopsPage=abc`)).status()).toBe(422);
    await fixture.pool.query(
      'UPDATE session SET "createdAt"=clock_timestamp()-interval \'6 minutes\' WHERE "userId"=$1',
      [fixture.ownerId],
    );
    await page.goto(fixture.page);
    await expect(
      page.getByRole("heading", { name: "Confirm your identity", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save team change", exact: true })).toHaveCount(
      0,
    );
    await expect(page.locator("main")).not.toContainText(fixture.colleague.email);
    expect((await page.request.get(fixture.api)).status()).toBe(403);
  } finally {
    await fixture.pool.end();
  }
});
