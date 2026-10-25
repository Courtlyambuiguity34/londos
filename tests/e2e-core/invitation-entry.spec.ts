import { test, expect, type Page } from "./fixture";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createAuth } from "../../src/server/security/auth";
import { coreConfig } from "../../src/server/config";
import { brevoMessage } from "../../src/server/jobs/brevo";

// Even fictional bearer URLs must not be written into traces or screenshots.
test.use({ trace: "off", screenshot: "off" });
const origin = "http://127.0.0.1:3101";
const entry = "/shopkeeper/invitations";
const storageKey = "londos.pending-invitation.v1";
const merchant = randomUUID();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
type Account = { id: string; email: string; password: string };
const accounts: Record<string, Account> = {};
test.beforeAll(async () => {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw new Error("Disposable browser database required");
  const auth = createAuth(pool, coreConfig(), true);
  for (const name of ["owner", "invitee", "second", "outsider", "blocked"]) {
    const account = {
      email: `invitation-${name}-${randomUUID()}@londos.invalid`,
      password: `Fictional-${randomUUID()}`,
    };
    const created = await auth.api.signUpEmail({
      body: { ...account, name: `Invitation ${name}` },
    });
    await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
    accounts[name] = { ...account, id: created.user.id };
  }
  await pool.query("INSERT INTO merchants(id,name) VALUES($1,'Fictional invitation merchant')", [
    merchant,
  ]);
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
    merchant,
    accounts.owner!.id,
  ]);
});
test.afterAll(async () => pool.end());

async function completeSignIn(page: Page, account: Account) {
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function signIn(page: Page, account: Account) {
  await page.goto("/sign-in");
  await completeSignIn(page, account);
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
}
async function invitation(owner: Page, recipient: Account) {
  const response = await owner.request.post(`/api/workspace/merchants/${merchant}/invitations`, {
    headers: { origin },
    data: { email: recipient.email, role: "staff", permissions: ["catalogue"] },
  });
  expect(response.status()).toBe(200);
  const { id } = await response.json();
  const payload = (
    await pool.query("SELECT payload FROM jobs WHERE dedupe_key=$1", [`invitation:${id}`])
  ).rows[0].payload;
  const rendered = brevoMessage(payload, origin);
  const url = new URL(rendered.text.trim().split("\n").at(-1)!);
  expect(url.origin).toBe(origin);
  expect(url.pathname).toBe(entry);
  expect(url.search).toBe("");
  expect(url.hash.startsWith("#token=")).toBe(true);
  return { id: id as string, token: payload.token as string, url: url.href };
}
async function savedTokenPresent(page: Page) {
  return page.evaluate((key) => window.sessionStorage.getItem(key) !== null, storageKey);
}
async function cleanEntry(page: Page) {
  await expect
    .poll(() => {
      const current = new URL(page.url());
      return current.pathname === entry && current.search === "" && current.hash === "";
    })
    .toBe(true);
}
async function filledToken(page: Page, token: string) {
  // Boolean comparisons avoid printing the bearer on an assertion failure.
  await expect
    .poll(
      async () =>
        (await page.getByLabel("Private invitation token", { exact: true }).inputValue()) === token,
    )
    .toBe(true);
}

test("the actual email CTA retains an invitation through signed-out login without server or auth-URL bearer reflection", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.owner!);
  const pending = await invitation(page, accounts.invitee!);
  const context = await browser.newContext();
  const recipient = await context.newPage();
  try {
    let leakedRequestURL = false;
    recipient.on("request", (request) => {
      if (request.url().includes(pending.token)) leakedRequestURL = true;
    });
    for (const headers of [{}, { RSC: "1" }]) {
      const response = await recipient.request.get(pending.url, { headers });
      expect(response.status()).toBe(200);
      expect((await response.text()).includes(pending.token)).toBe(false);
    }
    await recipient.goto(pending.url);
    await cleanEntry(recipient);
    expect(await savedTokenPresent(recipient)).toBe(true);
    await recipient
      .getByRole("link", { name: "Sign in to review invitation", exact: true })
      .click();
    await expect.poll(() => new URL(recipient.url()).pathname === "/sign-in").toBe(true);
    const signInURL = new URL(recipient.url());
    expect(signInURL.pathname).toBe("/sign-in");
    expect(signInURL.searchParams.get("next")).toBe(entry);
    expect(signInURL.href.includes(pending.token)).toBe(false);
    await completeSignIn(recipient, accounts.invitee!);
    await cleanEntry(recipient);
    await filledToken(recipient, pending.token);
    expect(
      (
        await pool.query("SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2", [
          merchant,
          accounts.invitee!.id,
        ])
      ).rowCount,
    ).toBe(0);
    await recipient.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(recipient.getByRole("status")).toContainText("Invitation accepted");
    expect(await savedTokenPresent(recipient)).toBe(false);
    const membership = (
      await pool.query(
        "SELECT role,permissions FROM memberships WHERE merchant_id=$1 AND user_id=$2",
        [merchant, accounts.invitee!.id],
      )
    ).rows[0];
    expect(membership).toEqual({ role: "staff", permissions: ["catalogue"] });
    expect(leakedRequestURL).toBe(false);
  } finally {
    await context.close();
  }
});

test("signed-in email links retain invited-email and single-use boundaries", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.owner!);
  const pending = await invitation(page, accounts.second!);
  const wrongContext = await browser.newContext();
  const correctContext = await browser.newContext();
  try {
    const wrong = await wrongContext.newPage();
    await signIn(wrong, accounts.outsider!);
    await wrong.goto(pending.url);
    await cleanEntry(wrong);
    await filledToken(wrong, pending.token);
    await wrong.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(wrong.getByRole("status")).toContainText("belongs to another account");
    expect(
      (
        await pool.query("SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2", [
          merchant,
          accounts.outsider!.id,
        ])
      ).rowCount,
    ).toBe(0);
    const correct = await correctContext.newPage();
    await signIn(correct, accounts.second!);
    await correct.goto(pending.url);
    await cleanEntry(correct);
    await filledToken(correct, pending.token);
    await correct.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(correct.getByRole("status")).toContainText("Invitation accepted");
    expect(await savedTokenPresent(correct)).toBe(false);
    await correct.goto(pending.url);
    await cleanEntry(correct);
    await filledToken(correct, pending.token);
    await correct.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(correct.getByRole("status")).toContainText(
      "unavailable, expired or belongs to another account",
    );
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM memberships WHERE merchant_id=$1 AND user_id=$2",
          [merchant, accounts.second!.id],
        )
      ).rows[0].count,
    ).toBe(1);
  } finally {
    await wrongContext.close();
    await correctContext.close();
  }
});

test("legacy query links redirect before rendering; invalid links and invalid browser retention never reuse another invitation", async ({
  page,
  browser,
  request,
}) => {
  await signIn(page, accounts.owner!);
  const pending = await invitation(page, accounts.outsider!);
  const legacyURL = `${origin}${entry}?token=${encodeURIComponent(pending.token)}`;
  const response = await request.get(legacyURL, { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const redirect = new URL(response.headers().location!, origin);
  expect(redirect.pathname).toBe(entry);
  expect(redirect.search).toBe("");
  // Next's ordinary redirect body repeats its Location; it does not render a
  // page. Check the actual destination's HTML and Flight for bearer reflection.
  expect(response.headers()["content-type"] ?? "").not.toContain("text/html");
  expect(response.headers()["content-type"] ?? "").not.toContain("text/x-component");
  for (const headers of [{}, { RSC: "1" }]) {
    const rendered = await request.get(redirect.href, { headers });
    expect(rendered.status()).toBe(200);
    expect((await rendered.text()).includes(pending.token)).toBe(false);
  }
  const context = await browser.newContext();
  const recipient = await context.newPage();
  try {
    await recipient.goto(legacyURL);
    await cleanEntry(recipient);
    expect(await savedTokenPresent(recipient)).toBe(true);
    await recipient.goto(`${entry}?token=invalid`);
    await cleanEntry(recipient);
    await expect(recipient.getByRole("status")).toContainText("invitation link is invalid");
    expect(await savedTokenPresent(recipient)).toBe(false);
    for (const expiresAt of [Date.now() - 1, Date.now() + 2 * 60 * 60 * 1000]) {
      await recipient.evaluate(
        ({ key, token, expiresAt }) =>
          window.sessionStorage.setItem(key, JSON.stringify({ token, expiresAt })),
        { key: storageKey, token: pending.token, expiresAt },
      );
      await recipient.goto(entry);
      await expect.poll(() => savedTokenPresent(recipient)).toBe(false);
    }
  } finally {
    await context.close();
  }
});

test("disabled session storage gives a recovery path and signed-in acceptance still works after reopening the email", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.owner!);
  const pending = await invitation(page, accounts.blocked!);
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === window.sessionStorage)
        throw new DOMException("Storage disabled", "SecurityError");
      original.call(this, key, value);
    };
  });
  const recipient = await context.newPage();
  try {
    await recipient.setViewportSize({ width: 390, height: 844 });
    await recipient.goto(pending.url);
    await cleanEntry(recipient);
    await expect(recipient.getByRole("status")).toContainText(
      "Sign in first, then reopen the original invitation email",
    );
    await recipient
      .getByRole("link", { name: "Sign in to review invitation", exact: true })
      .click();
    await completeSignIn(recipient, accounts.blocked!);
    await cleanEntry(recipient);
    expect(
      await recipient.getByLabel("Private invitation token", { exact: true }).inputValue(),
    ).toBe("");
    await recipient.goto(pending.url);
    await cleanEntry(recipient);
    await filledToken(recipient, pending.token);
    await recipient.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(recipient.getByRole("status")).toContainText("Invitation accepted");
    expect(await recipient.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await context.close();
  }
});
