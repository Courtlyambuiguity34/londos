import { beforeAll, afterAll, expect, test } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { generate } from "otplib";
import { migrate } from "../../src/server/db/migrate";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { seed, seedIds } from "../../src/server/db/seed";
import { coreConfig } from "../../src/server/config";
import { createAuth } from "../../src/server/security/auth";
import { resolveActor, requireShop, type Actor } from "../../src/server/security/authorization";
import {
  createApplication,
  readApplication,
  saveEvidence,
  submitApplication,
  claimApplication,
  reviewApplication,
} from "../../src/server/applications";
import {
  createPolicy,
  issueApplicationInvoice,
  applicationInvoices,
  readInvoice,
  reconcileInvoice,
  reverseCredit,
  submitPaymentClaim,
  syncTenancy,
  type Invoice,
} from "../../src/server/rent";
import { readDesign, saveDesign, publishDesign } from "../../src/server/shop-design";
import { saveDepartment, saveProduct } from "../../src/server/catalogue";
import { readPublicShop } from "../../src/server/public-shop";
import { PostgresSearch } from "../../src/server/discovery";
import { changeAddress } from "../../src/server/administration";
import {
  listShops,
  effectiveShopPermissions,
  shopStorefrontStatus,
} from "../../src/server/workspace";
import { availableShopAddress } from "../../src/server/shop-address";
import { transaction } from "../../src/server/db/pool";
import { updatePaymentSettings } from "../../src/server/communications";
import { brevoMessage } from "../../src/server/jobs/brevo";

const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL, max: 1 });
const name = `londos_test_${randomUUID().replaceAll("-", "")}`;
const original = { origin: process.env.AUTH_BASE_URL, local: process.env.LONDOS_LOCAL_ADAPTERS };
let pool: Pool, directory: string, image: Buffer, policyId: string;
const actors: Record<string, Actor> = {};
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.href;
  pool = new Pool({ connectionString: url.href, max: 8 });
  directory = await mkdtemp(join(tmpdir(), "londos-hosted-lifecycle-"));
  await migrate(pool);
  const auth = createAuth(pool, coreConfig(), true),
    accounts = await seed(pool, auth, directory);
  for (const key of ["ownerA", "ownerB", "staff", "operator"] as const) {
    const cookies = new Map<string, string>();
    const request = async (path: string, body: unknown) => {
      const response = await auth.handler(
        new Request(`${coreConfig().baseURL}/api/auth/${path}`, {
          method: "POST",
          headers: {
            origin: coreConfig().baseURL,
            "content-type": "application/json",
            cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
          },
          body: JSON.stringify(body),
        }),
      );
      for (const line of response.headers.getSetCookie()) {
        const value = line.split(";")[0]!,
          split = value.indexOf("=");
        cookies.set(value.slice(0, split), value.slice(split + 1));
      }
      expect(response.status).toBe(200);
      return response;
    };
    await request("sign-in/email", {
      email: accounts[key].email,
      password: accounts[key].password,
    });
    if (key === "operator") {
      const enabled = await request("two-factor/enable", { password: accounts.operator.password });
      const secret = new URL((await enabled.json()).totpURI).searchParams.get("secret")!;
      await request("two-factor/verify-totp", {
        code: await generate({ secret }),
        trustDevice: false,
      });
      await pool.query(
        "INSERT INTO operator_grants(user_id,permission) VALUES($1,'finance') ON CONFLICT DO NOTHING",
        [accounts.operator.id],
      );
    }
    actors[key] = await resolveActor(
      auth,
      new Headers({ cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") }),
    );
  }
  image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#364636" } })
    .png()
    .toBuffer();
  // Real hosted configuration and production policies, but only a disposable local DB.
  // No worker/provider transport runs, so all generated mail remains queued in this DB.
  process.env.AUTH_BASE_URL = "https://hosted-lifecycle.example.org";
  process.env.LONDOS_LOCAL_ADAPTERS = "false";
  policyId = (
    await createPolicy(pool, actors.operator!, {
      label: "Hosted test policy",
      amountMinor: "5000",
      periodDays: 30,
      graceDays: 7,
      mallCapacity: 100,
      confirm: true,
    })
  ).id;
});
afterAll(async () => {
  process.env.DATABASE_URL = parentURL;
  if (original.origin === undefined) delete process.env.AUTH_BASE_URL;
  else process.env.AUTH_BASE_URL = original.origin;
  if (original.local === undefined) delete process.env.LONDOS_LOCAL_ADAPTERS;
  else process.env.LONDOS_LOCAL_ADAPTERS = original.local;
  await pool?.end();
  await parent.query(`DROP DATABASE IF EXISTS ${name} WITH(FORCE)`);
  await parent.end();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function approved(businessName: string) {
  const { id } = await createApplication(pool, actors.ownerA!, {
    key: randomUUID(),
    businessName,
    category: "fashion",
    location: "Kampala",
    description: "Fictional business for hosted lifecycle regression testing.",
    phone: "+256700000001",
  });
  let application = (await readApplication(pool, actors.ownerA!, id)).application;
  await saveEvidence(pool, actors.ownerA!, id, 1, application.version, image, "image/png");
  application = (await readApplication(pool, actors.ownerA!, id)).application;
  await submitApplication(pool, actors.ownerA!, id, {
    version: application.version,
    confirm: true,
  });
  await claimApplication(pool, actors.operator!, id, "review");
  application = (await readApplication(pool, actors.operator!, id, "review")).application;
  await reviewApplication(pool, actors.operator!, id, {
    version: application.version,
    decision: "approved",
    reason: "Independently checked fictional evidence",
    policyId,
    confirm: true,
  });
  await claimApplication(pool, actors.operator!, id, "finance");
  return (await applicationInvoices(pool, actors.operator!, id, "finance"))[0]!;
}
function credit(invoice: Invoice, amountMinor = invoice.amount_minor) {
  return {
    key: randomUUID(),
    version: invoice.version,
    kind: "payment" as const,
    amountMinor,
    currency: "UGX" as const,
    invoiceReference: invoice.reference,
    reference: `TEST-${randomUUID()}`.toUpperCase(),
    reason: "Independently verified fictional external settlement",
    confirm: true as const,
  };
}
async function paid(businessName: string) {
  const invoice = await approved(businessName);
  const result = await reconcileInvoice(pool, actors.operator!, invoice.id, credit(invoice));
  return {
    invoice,
    result,
    shop: await requireShop(pool, actors.ownerA!, result.shopId!, "catalogue"),
  };
}
async function publish(shopId: string) {
  const design = await readDesign(pool, actors.ownerA!, shopId);
  const saved = await saveDesign(pool, actors.ownerA!, shopId, {
    version: design.version,
    summary: "Publish fictional hosted shop",
    specification: design.specification,
  });
  await publishDesign(pool, actors.ownerA!, shopId, { ...saved, confirm: true });
}

test("verified hosted payment creates a clean private shop; explicit publish makes catalogue and search public", async () => {
  const { shop, invoice } = await paid("Harbour Loom");
  expect(shop.slug).toBe("harbour-loom");
  expect(
    (await listShops(pool, actors.ownerA!)).find((s) => s.id === shop.id)?.storefront,
  ).toMatchObject({ public: false, next: "design" });
  await expect(readPublicShop(pool, shop.slug)).rejects.toMatchObject({ status: 404 });
  expect(
    (await new PostgresSearch(pool).search({ query: "Harbour" })).results.some(
      (s) => s.id === shop.id,
    ),
  ).toBe(false);
  const department = await saveDepartment(pool, actors.ownerA!, shop.id, null, {
    name: "Bags",
    slug: "bags",
    position: 0,
    archived: false,
    version: 0,
  });
  await saveProduct(pool, actors.ownerA!, shop.id, null, {
    departmentId: department.id,
    kind: "product",
    name: "Canvas bag",
    slug: "canvas-bag",
    description: "Fictional handmade canvas bag",
    currency: "UGX",
    priceMinor: "25000",
    availability: "available",
    position: 0,
    mediaId: null,
    version: 0,
  });
  await publish(shop.id);
  expect(await shopStorefrontStatus(pool, shop.id)).toMatchObject({ public: true, next: null });
  expect((await readPublicShop(pool, shop.slug)).shop.id).toBe(shop.id);
  expect(
    (await new PostgresSearch(pool).search({ query: "Harbour" })).results.some(
      (s) => s.id === shop.id,
    ),
  ).toBe(true);
  expect(
    (await pool.query("SELECT source FROM rent_events WHERE invoice_id=$1", [invoice.id])).rows,
  ).toEqual([{ source: "operator-verified" }]);
  for (const [table, hidden, visible] of [
    ["shop_moderation", "suspended", "clear"],
    ["tenancies", "closed", "active"],
    ["shop_publication", "temporarily_closed", "active"],
  ]) {
    await pool.query(`UPDATE ${table} SET state=$1 WHERE shop_id=$2`, [hidden, shop.id]);
    try {
      expect((await shopStorefrontStatus(pool, shop.id)).public).toBe(false);
      await expect(readPublicShop(pool, shop.slug)).rejects.toMatchObject({ status: 404 });
      expect(
        (await new PostgresSearch(pool).search({ query: "Harbour" })).results.some(
          (s) => s.id === shop.id,
        ),
      ).toBe(false);
    } finally {
      await pool.query(`UPDATE ${table} SET state=$1 WHERE shop_id=$2`, [visible, shop.id]);
    }
  }
  await expect(requireShop(pool, actors.ownerB!, shop.id, "catalogue")).rejects.toMatchObject({
    status: 404,
  });
});

test("a provisioned shop cannot receive a second initial invoice", async () => {
  const { invoice } = await paid("Harbour Single Initial Invoice");
  const before = (
    await pool.query("SELECT id FROM invoices WHERE application_id=$1", [invoice.application_id])
  ).rows;
  await expect(
    issueApplicationInvoice(pool, actors.operator!, invoice.application_id, {
      policyId,
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "initial_invoice_already_issued" });
  expect(
    (await pool.query("SELECT id FROM invoices WHERE application_id=$1", [invoice.application_id]))
      .rows,
  ).toEqual(before);
});

test("invoice issuance rechecks the finance scope after waiting for the merchant lock", async () => {
  const invoice = await approved("Harbour Scoped Initial Invoice");
  const blocker = await pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [invoice.merchant_id]);
    pending = issueApplicationInvoice(pool, actors.operator!, invoice.application_id, {
      policyId,
      confirm: true,
    });
    // Attach the rejection assertion before releasing the blocked transaction.
    const rejected = expect(pending).rejects.toMatchObject({
      code: "resource_unavailable",
      status: 404,
    });
    let waiting = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      waiting = Boolean(
        (
          await pool.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM merchants WHERE id=%' LIMIT 1",
          )
        ).rowCount,
      );
      if (waiting) break;
      await delay(10);
    }
    expect(waiting).toBe(true);
    await pool.query(
      "DELETE FROM operator_application_scopes WHERE application_id=$1 AND user_id=$2 AND permission='finance'",
      [invoice.application_id, actors.operator!.userId],
    );
    await blocker.query("COMMIT");
    await rejected;
    expect(
      (
        await pool.query("SELECT count(*)::int AS n FROM invoices WHERE application_id=$1", [
          invoice.application_id,
        ])
      ).rows[0].n,
    ).toBe(1);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await pending?.catch(() => {});
  }
});

test("hosted address edits preserve old links, reject takeover, stale versions and cross-tenant users", async () => {
  const { shop } = await paid("Harbour Address");
  await publish(shop.id);
  const input = {
    version: shop.version,
    slug: "harbour-address-new",
    reason: "Owner chose a memorable public address",
    confirm: true as const,
  };
  await expect(changeAddress(pool, actors.ownerB!, shop.id, input)).rejects.toMatchObject({
    status: 404,
  });
  await expect(changeAddress(pool, actors.staff!, shop.id, input)).rejects.toMatchObject({
    status: 404,
  });
  const changed = await changeAddress(pool, actors.ownerA!, shop.id, input);
  await expect(changeAddress(pool, actors.ownerA!, shop.id, input)).rejects.toMatchObject({
    code: "stale_version",
  });
  expect((await readPublicShop(pool, shop.slug)).shop.slug).toBe(changed.slug);
  const other = await paid("Harbour Other");
  await expect(
    changeAddress(pool, actors.ownerA!, other.shop.id, {
      ...input,
      slug: shop.slug,
      version: other.shop.version,
    }),
  ).rejects.toMatchObject({ code: "address_unavailable" });
  expect((await paid("Harbour Address")).shop.slug).toBe("harbour-address-2");
  const created = (
    await pool.query('SELECT "createdAt" FROM session WHERE id=$1', [actors.ownerA!.sessionId])
  ).rows[0].createdAt;
  try {
    await pool.query(
      "UPDATE session SET \"createdAt\"=clock_timestamp()-interval '6 minutes' WHERE id=$1",
      [actors.ownerA!.sessionId],
    );
    await expect(
      changeAddress(pool, actors.ownerA!, shop.id, {
        ...input,
        version: changed.version,
        slug: "should-not-change",
      }),
    ).rejects.toMatchObject({ code: "fresh_authentication_required" });
  } finally {
    await pool.query('UPDATE session SET "createdAt"=$2 WHERE id=$1', [
      actors.ownerA!.sessionId,
      created,
    ]);
  }
});

test("claims and partial payments do not provision; duplicate commands and production reversals preserve exact ledger history", async () => {
  const invoice = await approved("Harbour Partial");
  await submitPaymentClaim(pool, actors.ownerA!, invoice.id, {
    amountMinor: "5000",
    currency: "UGX",
    reference: "CLAIM-FICTIONAL-UNVERIFIED",
    note: "Fictional claim still awaiting independent verification",
    paymentMethod: "cash",
    confirm: true,
  });
  expect((await readInvoice(pool, actors.ownerA!, invoice.id)).invoice.shop_id).toBeNull();
  const partial = await reconcileInvoice(
    pool,
    actors.operator!,
    invoice.id,
    credit(invoice, "2000"),
  );
  expect(partial.shopId).toBeNull();
  const current = (await readInvoice(pool, actors.operator!, invoice.id, "finance")).invoice;
  const command = credit(current, "3000"),
    result = await reconcileInvoice(pool, actors.operator!, invoice.id, command);
  expect(result.shopId).toBeTruthy();
  expect(await reconcileInvoice(pool, actors.operator!, invoice.id, command)).toEqual(result);
  const refreshed = (await readInvoice(pool, actors.operator!, invoice.id, "finance")).invoice;
  await expect(
    reconcileInvoice(pool, actors.operator!, invoice.id, {
      ...credit(refreshed, "1"),
      kind: "waiver",
    }),
  ).rejects.toMatchObject({ code: "production_waiver_unavailable" });
  await publish(result.shopId!);
  const reversed = await reverseCredit(pool, actors.operator!, invoice.id, {
    key: randomUUID(),
    version: refreshed.version,
    eventId: result.eventId,
    reason: "Independent correction of fictional verified payment",
    confirm: true,
  });
  expect(reversed.creditedMinor).toBe("2000");
  expect((await shopStorefrontStatus(pool, result.shopId!)).public).toBe(false);
  const slug = (await requireShop(pool, actors.ownerA!, result.shopId!, "catalogue")).slug;
  await expect(readPublicShop(pool, slug)).rejects.toMatchObject({ status: 404 });
  await expect(
    pool.query("DELETE FROM rent_events WHERE id=$1", [result.eventId]),
  ).rejects.toMatchObject({ code: "P0001" });
  expect(
    (
      await pool.query("SELECT count(*)::int AS n FROM rent_events WHERE invoice_id=$1", [
        invoice.id,
      ])
    ).rows[0].n,
  ).toBe(3);
  const other = await approved("Harbour Receipt Reuse");
  await expect(
    reconcileInvoice(pool, actors.ownerA!, other.id, credit(other)),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    reconcileInvoice(pool, actors.operator!, other.id, {
      ...credit(other),
      reference: command.reference,
    }),
  ).rejects.toMatchObject({ code: "receipt_already_used" });
  expect((await readInvoice(pool, actors.ownerA!, other.id)).invoice.shop_id).toBeNull();
});

test("allocation rejects duplicate names without generated suffixes and never consumes a former address", async () => {
  const create = async (businessName: string) =>
    transaction(pool, async (db) => {
      const slug = await availableShopAddress(db, businessName),
        id = randomUUID();
      await db.query("INSERT INTO shops(id,merchant_id,mall_id,name,slug) VALUES($1,$2,$3,$4,$5)", [
        id,
        seedIds.merchantA,
        seedIds.mallA,
        businessName,
        slug,
      ]);
      return slug;
    });
  expect(await create("Corner Shop")).toBe("corner-shop");
  const results = await Promise.allSettled([
    create("Corner Shop"),
    create("Corner Shop East"),
    create("Corner Shop"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toEqual([
    { status: "fulfilled", value: "corner-shop-east" },
  ]);
  for (const result of results.filter((r) => r.status === "rejected"))
    expect(result.reason).toMatchObject({ status: 409, code: "address_unavailable" });
  await pool.query("UPDATE shops SET slug='corner-shop-west' WHERE slug='corner-shop'");
  await expect(create("Corner Shop")).rejects.toMatchObject({ code: "address_unavailable" });
  await expect(shopStorefrontStatus(pool, randomUUID())).rejects.toMatchObject({ status: 404 });
});

test("duplicate business names require an explicit readable address without recording a failed settlement", async () => {
  const first = await paid("Fresh Harvest Supplies");
  const second = await approved("Fresh Harvest Supplies");
  const command = credit(second);
  await expect(reconcileInvoice(pool, actors.operator!, second.id, command)).rejects.toMatchObject({
    status: 409,
    code: "address_unavailable",
  });
  expect((await readInvoice(pool, actors.ownerA!, second.id)).invoice).toMatchObject({
    credited_minor: "0",
    shop_id: null,
    version: second.version,
  });
  expect(
    (await pool.query("SELECT 1 FROM rent_events WHERE invoice_id=$1", [second.id])).rowCount,
  ).toBe(0);
  const result = await reconcileInvoice(pool, actors.operator!, second.id, {
    ...command,
    shopAddress: "fresh-harvest-supplies-mbale",
  });
  expect((await requireShop(pool, actors.ownerA!, result.shopId!, "catalogue")).slug).toBe(
    "fresh-harvest-supplies-mbale",
  );
  expect(first.shop.slug).toBe("fresh-harvest-supplies");
  expect(
    (await pool.query("SELECT id FROM shops WHERE slug='fresh-harvest-supplies-2'")).rowCount,
  ).toBe(0);
});

test("hosted renewal notices carry current MTN and Airtel collection details into the email renderer", async () => {
  await updatePaymentSettings(pool, actors.operator!, {
    version: 0,
    supportEmail: "support@londos.invalid",
    supportPhone: null,
    mobileMoneyPhone: null,
    mobileMoneyName: null,
    mtnMomoPhone: "+256700000002",
    mtnMomoName: "Fictional MTN owner",
    airtelMoneyPhone: "+256700000003",
    airtelMoneyName: "Fictional Airtel owner",
    bankName: null,
    bankAccountName: null,
    bankAccountNumber: null,
    notifyShops: false,
    confirm: true,
  });
  const { shop } = await paid("Harbour Renewal");
  const tenancy = (await pool.query("SELECT period_end FROM tenancies WHERE shop_id=$1", [shop.id]))
    .rows[0];
  await transaction(pool, async (db) => {
    await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [shop.merchant_id]);
    await syncTenancy(db, shop.id, new Date(new Date(tenancy.period_end).getTime() - 2 * 86400000));
  });
  const job = (
    await pool.query(
      "SELECT payload FROM jobs WHERE payload->>'template'='tenancy-status' AND payload->>'shopId'=$1 ORDER BY created_at DESC LIMIT 1",
      [shop.id],
    )
  ).rows[0];
  expect(job.payload.payment).toMatchObject({
    mtnMomoPhone: "+256700000002",
    airtelMoneyPhone: "+256700000003",
  });
  const email = brevoMessage(job.payload, coreConfig().baseURL);
  expect(email.text).toContain("MTN MoMo: +256700000002 (Fictional MTN owner)");
  expect(email.text).toContain("Airtel Money: +256700000003 (Fictional Airtel owner)");
});

test("finance-only and design-only staff discover only actually granted shops without gaining catalogue or owner rights", async () => {
  await pool.query(
    "UPDATE memberships SET permissions=ARRAY['finance','design']::text[] WHERE merchant_id=$1 AND user_id=$2",
    [seedIds.merchantA, actors.staff!.userId],
  );
  await pool.query(
    "UPDATE staff_shop_grants SET permissions=ARRAY['finance']::text[] WHERE shop_id=$1 AND user_id=$2",
    [seedIds.shopA, actors.staff!.userId],
  );
  const listed = await listShops(pool, actors.staff!);
  expect(listed.map((s) => s.id)).toEqual([seedIds.shopA]);
  expect(listed[0]!.permissions).toEqual(["finance"]);
  expect(await effectiveShopPermissions(pool, actors.staff!, seedIds.shopA)).toEqual(["finance"]);
  await requireShop(pool, actors.staff!, seedIds.shopA, "finance");
  await expect(requireShop(pool, actors.staff!, seedIds.shopA, "catalogue")).rejects.toMatchObject({
    status: 404,
  });
  await expect(effectiveShopPermissions(pool, actors.staff!, seedIds.shopB)).rejects.toMatchObject({
    status: 404,
  });
  await pool.query(
    "UPDATE staff_shop_grants SET permissions=ARRAY['design']::text[] WHERE shop_id=$1 AND user_id=$2",
    [seedIds.shopA, actors.staff!.userId],
  );
  expect((await listShops(pool, actors.staff!))[0]!.permissions).toEqual(["design"]);
  await pool.query("UPDATE memberships SET status='revoked' WHERE merchant_id=$1 AND user_id=$2", [
    seedIds.merchantA,
    actors.staff!.userId,
  ]);
  expect(await listShops(pool, actors.staff!)).toEqual([]);
  await expect(effectiveShopPermissions(pool, actors.staff!, seedIds.shopA)).rejects.toMatchObject({
    status: 404,
  });
});
