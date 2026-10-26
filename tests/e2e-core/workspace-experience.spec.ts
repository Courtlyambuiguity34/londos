import { test, expect, type Page } from "./fixture";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { generate } from "otplib";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { seedIds } from "../../src/server/db/seed";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const merchant = randomUUID(),
  shop = randomUUID();
const base = `/shopkeeper/shops/${shop}`;
const team = `/shopkeeper/merchants/${merchant}/team`;
const account = (name: string) => ({
  email: `workspace-${name}-${randomUUID()}@londos.invalid`,
  password: `Fictional-${randomUUID()}`,
});
const owner = account("owner"),
  staff = account("staff"),
  operator = account("operator");
let staffId: string;

test.beforeAll(async () => {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw Error("Disposable browser database required");
  const authentication = createAuth(pool, coreConfig(), true);
  const created = [];
  for (const person of [owner, staff, operator])
    created.push(
      await authentication.api.signUpEmail({
        body: { ...person, name: "Fictional workspace reviewer" },
      }),
    );
  staffId = created[1]!.user.id;
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=ANY($1::text[])', [
    created.map((person) => person.user.id),
  ]);
  await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Fictional Olive business')", [
    merchant,
  ]);
  await pool.query(
    "INSERT INTO memberships(merchant_id,user_id,role,permissions) VALUES($1,$2,'owner','{}'),($1,$3,'staff',ARRAY['catalogue'])",
    [merchant, created[0]!.user.id, staffId],
  );
  await pool.query(
    "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category,tagline) VALUES($1,$2,$3,'Fictional Olive Store',$4,'home','Thoughtful things for everyday living')",
    [
      shop,
      merchant,
      seedIds.mallA,
      `fictional-olive-${["meadow", "grove", "garden", "market", "orchard", "hill", "valley", "courtyard"][test.info().workerIndex % 8]}`,
    ],
  );
  await pool.query(
    "INSERT INTO staff_shop_grants(merchant_id,user_id,shop_id,permissions) VALUES($1,$2,$3,ARRAY['catalogue'])",
    [merchant, staffId, shop],
  );
  await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [shop]);
  await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [shop]);
  await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [shop]);
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'review'),($1,'finance'),($1,'operations'),($1,'jobs')",
    [created[2]!.user.id],
  );
});
test.afterAll(async () => pool.end());

async function login(page: Page, person = owner, next = "/shopkeeper") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(person.email);
  await page.getByLabel("Password", { exact: true }).fill(person.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}
async function layout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}
async function screenshot(page: Page, name: string, width: number) {
  if (width !== 1440 && width !== 390) return;
  await mkdir("docs/evidence/images", { recursive: true });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: `docs/evidence/images/workspace-experience-${name}-${width}-2026-10-26.png`,
    fullPage: true,
  });
}

test("owners can discover and create private invitations from their shop workspace", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: /^Invite a teammate/ }).click();
  await expect(
    page.getByRole("heading", { name: "Who is on your team?", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /^Invite a teammate/ }).click();
  await expect(page).toHaveURL(new RegExp(`${team}#invite$`));
  const email = `fictional-invite-${randomUUID()}@londos.invalid`;
  await page.getByLabel("Invitee email", { exact: true }).fill(email);
  await page.getByRole("checkbox", { name: "Catalogue", exact: true }).check();
  await page
    .getByRole("checkbox", {
      name: "I reviewed the selected access change and confirm it",
      exact: true,
    })
    .check();
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/merchants/${merchant}/team`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save team change", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  expect(Object.keys(await result.json())).toEqual(["id"]);
  await expect(page.getByRole("status")).toContainText("Invitation queued for private delivery");
  await expect(page.getByRole("region", { name: "Your team and invitations" })).toContainText(
    email,
  );
  const pending = await pool.query(
    "SELECT i.role,i.permissions,(i.token_hash IS NOT NULL) AS protected,EXISTS(SELECT 1 FROM jobs j WHERE j.dedupe_key='invitation:'||i.id::text AND j.kind='notification.local') AS queued FROM invitations i WHERE i.merchant_id=$1 AND i.email=$2",
    [merchant, email],
  );
  expect(pending.rows).toEqual([
    { role: "staff", permissions: ["catalogue"], protected: true, queued: true },
  ]);
  await page.goto(base);
  await page
    .getByRole("link", { name: /^Invite a teammate/ })
    .first()
    .click();
  await expect(page.getByLabel("Invitee email", { exact: true })).toBeVisible();
  await page.getByLabel("Team action", { exact: true }).selectOption("transfer");
  await expect(
    page.getByRole("heading", { name: "Hand over ownership with care.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Transferring ownership removes your owner access.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Team action", { exact: true }).selectOption("invite");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await layout(page);
    await screenshot(page, "team", width);
  }
});

test("merchant overview and profile are responsive and mobile menus keep search usable", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page);
  for (const width of [1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/shopkeeper");
    await layout(page);
    await screenshot(page, "merchant", width);
    await page.goto(base);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fictional Olive Store");
    await expect(page.getByRole("link", { name: /^Invite a teammate/ }).first()).toHaveAttribute(
      "href",
      `${team}#invite`,
    );
    if (width <= 900) {
      await page.getByRole("button", { name: "Shop menu", exact: true }).click();
      await expect(
        page
          .getByRole("navigation", { name: "Merchant sections", exact: true })
          .getByRole("link", { name: "Received invitations", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Search workspace", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Jump to workspace page" })).toBeVisible();
      await page.getByRole("dialog").getByRole("textbox").fill("invite");
      await expect(
        page.getByRole("dialog").getByRole("button", { name: /Team & access/ }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await page
        .getByRole("navigation", { name: "Merchant sections", exact: true })
        .getByRole("link", { name: "Products & contacts", exact: true })
        .focus();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Shop menu", exact: true })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
    await layout(page);
    await screenshot(page, "shop", width);
  }
  await page
    .getByLabel("Shop introduction", { exact: true })
    .fill("A clearer introduction, saved from a small phone");
  await page.getByRole("button", { name: "Save shop profile", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Shop profile saved.");
  expect((await pool.query("SELECT tagline FROM shops WHERE id=$1", [shop])).rows[0].tagline).toBe(
    "A clearer introduction, saved from a small phone",
  );
});

test("staff receive invitation links without owner controls or other teams' data", async ({
  page,
}) => {
  await login(page, staff);
  await expect(page.getByRole("link", { name: /^Invite a teammate/ })).toHaveCount(0);
  await page.goto(base);
  await expect(page.getByRole("link", { name: /^Invite a teammate/ })).toHaveCount(0);
  const navigation = page.getByRole("navigation", { name: "Merchant sections", exact: true });
  await expect(
    navigation.getByRole("link", { name: "Received invitations", exact: true }),
  ).toBeVisible();
  expect((await page.request.get(`/api/workspace/merchants/${merchant}/team`)).status()).toBe(404);
  expect(
    (
      await page.request.post(`/api/workspace/merchants/${merchant}/team`, {
        headers: { origin: coreConfig().baseURL },
        data: {
          action: "invite",
          version: 1,
          confirm: true,
          value: {
            email: "fictional-denied@londos.invalid",
            role: "staff",
            permissions: ["catalogue"],
          },
        },
      })
    ).status(),
  ).toBe(404);
  expect((await page.request.get(`/api/workspace/merchants/${randomUUID()}/team`)).status()).toBe(
    404,
  );
  expect((await page.request.get("/api/operator/applications")).status()).toBe(403);
  await page.goto("/shopkeeper/team");
  await expect(
    page.getByRole("heading", { name: "No owned businesses on this page", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Fictional Olive business");
  await page.goto("/shopkeeper/invitations");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Invitations");
  await expect(page.getByRole("heading", { name: "Join your team", exact: true })).toBeVisible();
  await layout(page);
});

test("landlord tools stay clear at four widths with real queues and scoped access", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page, operator, "/landlord");
  await expect(page).toHaveURL(/\/security$/);
  await page.getByLabel("Confirm your password", { exact: true }).fill(operator.password);
  await page.getByRole("button", { name: "Set up MFA", exact: true }).click();
  const setup = page.getByLabel("Authenticator setup URI", { exact: true });
  await expect(setup).toBeVisible();
  const secret = new URL(await setup.inputValue()).searchParams.get("secret")!;
  await page.getByLabel("Authenticator code", { exact: true }).fill(await generate({ secret }));
  await page.getByRole("button", { name: "Verify MFA", exact: true }).click();
  await expect(page).toHaveURL(/\/security\?verified=1$/);
  for (const width of [1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/landlord");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Manage your mall with clarity.",
    );
    await expect(page.getByRole("link", { name: "Manage shops", exact: false })).toBeVisible();
    await layout(page);
    await screenshot(page, "landlord", width);
    await page.goto("/landlord/communications");
    await expect(page.getByRole("tab", { name: /Payment details/ })).toBeVisible();
    await layout(page);
    await screenshot(page, "communications", width);
    const nav = page.getByRole("navigation", { name: "Management sections", exact: true });
    if (width <= 900)
      await page.getByRole("button", { name: "Management menu", exact: true }).click();
    await expect(nav.getByRole("link", { name: "Privacy requests", exact: true })).toHaveCount(0);
    expect((await page.request.get(`/api/workspace/shops/${shop}`)).status()).toBe(404);
  }
});
