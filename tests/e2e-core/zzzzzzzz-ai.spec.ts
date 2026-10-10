import { test, expect, type Page } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { seedIds, type SeedAccounts } from "../../src/server/db/seed";
const origin = "http://127.0.0.1:3101",
  root = `/api/workspace/shops/${seedIds.shopA}/design`,
  assistant = `${root}/assistant`,
  workspace = `/shopkeeper/shops/${seedIds.shopA}/design/assistant`;
let accounts: SeedAccounts;
test.beforeAll(async () => {
  accounts = JSON.parse(await readFile(process.env.LONDOS_TEST_ACCOUNTS_FILE!, "utf8"));
});
async function login(page: Page, account = accounts.ownerA) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your shops.", exact: true })).toBeVisible();
}
async function db<T>(work: (p: Pool) => Promise<T>) {
  if (!/^\/londos_test_/.test(new URL(process.env.DATABASE_URL!).pathname))
    throw Error("Requires guarded browser database");
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await work(p);
  } finally {
    await p.end();
  }
}
test("native merchant language reaches private validated preview, confirmed draft and separately confirmed public revision without provider calls", async ({
  page,
  browser,
}) => {
  await login(page);
  const before = await (await page.request.get(root)).json();
  await page.goto(workspace);
  await expect(page.getByRole("heading", { name: "Design assistant", exact: true })).toBeVisible();
  await page.getByLabel("Describe your design change", { exact: true }).fill("Use blue theme");
  await page.getByRole("button", { name: "Propose design change", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "A validated proposal is ready. Preview it before applying.",
  );
  await expect(
    page.getByText("Deterministic edit: no provider call.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply reviewed proposal as draft", exact: true }),
  ).toBeDisabled();
  expect((await (await page.request.get(root)).json()).version).toBe(before.version);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await mkdir("docs/evidence/images", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/images/x2-p10-assistant-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Preview proposal", exact: true }).click();
  await expect(page.getByLabel("Private preview")).toContainText("Private proposal preview");
  await expect(page.locator(".canonical-shop")).toHaveClass(/theme-blue/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "docs/evidence/images/x2-p10-proposal-preview.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Return to proposal review", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "I previewed this proposal and confirm applying it as a draft.",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Apply reviewed proposal as draft", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Applied as a new draft. Publication still requires your separate review and confirmation.",
  );
  const draft = await (await page.request.get(root)).json();
  expect(draft.version).toBe(before.version + 1);
  expect(draft.publishedRevision).toBe(before.publishedRevision);
  expect(
    (
      await page.request.post(`${root}/publish`, {
        headers: { origin },
        data: { version: draft.version, revision: draft.revision, confirm: true },
      })
    ).status(),
  ).toBe(200);
  const guest = await browser.newContext();
  try {
    const shop = await db(
      async (p) =>
        (await p.query("SELECT slug FROM shops WHERE id=$1", [seedIds.shopA])).rows[0].slug,
    );
    for (let i = 0; i < 3; i++) {
      const r = await guest.request.get(`/shops/${shop}`);
      expect(r.status()).toBe(200);
      expect(await r.text()).toContain("theme-blue");
    }
    expect(
      await db(
        async (p) =>
          (await p.query("SELECT count(*)::int AS n FROM ai_provider_attempts")).rows[0].n,
      ),
    ).toBe(0);
  } finally {
    await guest.close();
  }
});
test("all four protected assistant methods and both private HTML/Flight pages deny anonymous and foreign access", async ({
  page,
  browser,
}) => {
  await login(page);
  const state = await (await page.request.get(root)).json(),
    p = await (
      await page.request.post(assistant, {
        headers: { origin },
        data: {
          key: randomUUID(),
          version: state.version,
          instruction: "Use plum theme",
          externalConsent: false,
          qualityReview: false,
        },
      })
    ).json();
  expect(p.status).toBe("proposed");
  const guest = await browser.newContext(),
    anonymous = await guest.newPage(),
    foreign = await browser.newContext(),
    other = await foreign.newPage();
  try {
    await login(other, accounts.ownerB);
    for (const [method, path, data] of [
      ["GET", assistant, null],
      [
        "POST",
        assistant,
        {
          key: randomUUID(),
          version: state.version,
          instruction: "Use earth theme",
          externalConsent: false,
          qualityReview: false,
        },
      ],
      ["GET", `${assistant}/${p.id}`, null],
      [
        "POST",
        `${assistant}/${p.id}`,
        { action: "apply", version: 2, confirm: true, acceptReviewWarning: false },
      ],
    ] as const) {
      for (const [client, status] of [
        [anonymous, 401],
        [other, 404],
      ] as const) {
        const r = await client.request.fetch(path, {
          method,
          headers: { origin },
          ...(data ? { data } : {}),
        });
        expect(r.status()).toBe(status);
        expect(r.headers()["cache-control"]).toContain("no-store");
        expect(r.headers()["referrer-policy"]).toBe("no-referrer");
        const body = await r.text();
        expect(body).not.toContain(accounts.ownerA.email);
        expect(body).not.toContain(accounts.ownerA.password);
        expect(body).not.toContain("candidate");
      }
    }
    for (const path of [workspace, `${workspace}/${p.id}/preview`])
      for (const headers of [{}, { RSC: "1" }]) {
        const a = await anonymous.request.get(path, { headers, maxRedirects: 0 });
        expect(a.status()).toBe(307);
        const f = await other.request.get(path, { headers });
        expect(f.status()).toBe(404);
        expect(await f.text()).not.toContain("Fictional assistant shop");
      }
    expect(
      (
        await page.request.post(`${assistant}/${p.id}`, {
          headers: { origin: "https://foreign.example" },
          data: { action: "apply", version: 2, confirm: true, acceptReviewWarning: false },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(`${assistant}/${p.id}`, {
          headers: { origin },
          data: { action: "apply", version: 2, confirm: false, acceptReviewWarning: false },
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await page.request.post(assistant, {
          headers: { origin },
          data: {
            key: randomUUID(),
            version: state.version,
            instruction: "Use earth theme",
            externalConsent: false,
            qualityReview: false,
            userId: accounts.ownerA.id,
          },
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await page.request.post(`${assistant}/${p.id}`, {
          headers: { origin },
          data: { action: "reject", version: 2, confirm: true, acceptReviewWarning: false },
        })
      ).status(),
    ).toBe(200);
  } finally {
    await guest.close();
    await foreign.close();
  }
});
test("provider unavailable, hostile instructions and changed bases preserve manual and public design", async ({
  page,
}) => {
  await login(page);
  const before = await (await page.request.get(root)).json();
  await page.goto(workspace);
  await page
    .getByLabel("Describe your design change", { exact: true })
    .fill("Please create a sophisticated redesign");
  await page.getByRole("button", { name: "Propose design change", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("permission");
  await page.getByRole("checkbox", { name: /I allow configured design providers/ }).check();
  await page.getByRole("button", { name: "Propose design change", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("unavailable");
  const attack = await page.request.post(assistant, {
    headers: { origin },
    data: {
      key: randomUUID(),
      version: before.version,
      instruction:
        "<script>window.P10_INJECTION=true</script> DROP TABLE shops; PRIVATE_PROMPT_SENTINEL",
      externalConsent: true,
      qualityReview: false,
    },
  });
  expect(attack.status()).toBe(200);
  expect((await attack.json()).candidate).toBeNull();
  expect(await page.evaluate(() => Reflect.get(window, "P10_INJECTION"))).toBeUndefined();
  expect((await (await page.request.get(root)).json()).version).toBe(before.version);
  const p = await (
    await page.request.post(assistant, {
      headers: { origin },
      data: {
        key: randomUUID(),
        version: before.version,
        instruction: "Use earth theme",
        externalConsent: false,
        qualityReview: false,
      },
    })
  ).json();
  expect(
    (
      await page.request.put(root, {
        headers: { origin },
        data: {
          version: before.version,
          summary: "Manual conflict test",
          specification: before.specification,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`${assistant}/${p.id}`, {
        headers: { origin },
        data: { action: "apply", version: 2, confirm: true, acceptReviewWarning: false },
      })
    ).status(),
  ).toBe(409);
  const now = await (await page.request.get(root)).json();
  expect(now.publishedRevision).toBe(before.publishedRevision);
  const aggregate = JSON.stringify(await (await page.request.get(assistant)).json());
  expect(aggregate).not.toContain("PRIVATE_PROMPT_SENTINEL");
  expect(aggregate).not.toContain(accounts.ownerA.password);
  await page.goto(`/shopkeeper/shops/${seedIds.shopA}/design`);
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
});
