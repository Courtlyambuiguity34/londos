import { beforeAll, afterAll, test, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import sharp from "sharp";
import { generate } from "otplib";
import { migrate } from "../../src/server/db/migrate";
import { seed, seedIds, type SeedAccounts } from "../../src/server/db/seed";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { transaction } from "../../src/server/db/pool";
import { coreConfig } from "../../src/server/config";
import { createAuth, type Auth } from "../../src/server/security/auth";
import { resolveActor, type Actor } from "../../src/server/security/authorization";
import {
  createApplication,
  readApplication,
  updateApplication,
  saveEvidence,
  readEvidence,
  submitApplication,
  claimApplication,
  reviewApplication,
  applicationQueue,
} from "../../src/server/applications";
import { developmentPolicyId } from "../../src/server/lifecycle-common";
import {
  applicationInvoices,
  readInvoice,
  reconcileInvoice,
  reverseCredit,
  requestRenewal,
  shopRent,
  syncTenancy,
  createPolicy,
  tenancyAt,
  submitPaymentClaim,
  applyPromotion,
  type Invoice,
} from "../../src/server/rent";
import { schedule } from "../../src/server/jobs/scheduler";
import { acknowledge } from "../../src/server/jobs/queue";
import { handleRentTick } from "../../src/server/jobs/rent";
import { readPublicShop, readPublicVariant } from "../../src/server/public-shop";
import { readDesign, saveDesign, publishDesign } from "../../src/server/shop-design";

import { ownedMerchants, readTeam, teamCommand } from "../../src/server/team";
import { acceptInvitation } from "../../src/server/security/memberships";
import {
  changeAddress,
  claimOperations,
  readOperations,
  commandOperations,
  operationsQueue,
  mallOccupancy,
  rentExceptions,
} from "../../src/server/administration";
import { PostgresSearch } from "../../src/server/discovery";
import { saveContacts, publicContact } from "../../src/server/contacts";
import {
  createCampaign,
  createPromotion,
  scheduleCommunications,
  updatePaymentSettings,
  currentPaymentSettings,
} from "../../src/server/communications";
const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  auth: Auth,
  directory: string,
  accounts: SeedAccounts,
  actors: Record<string, Actor>,
  image: Buffer,
  baseline: unknown;
class Client {
  cookies = new Map<string, string>();
  headers() {
    return new Headers({
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      origin: coreConfig().baseURL,
      "content-type": "application/json",
    });
  }
  async request(path: string, body: unknown) {
    const response = await auth.handler(
      new Request(`${coreConfig().baseURL}/api/auth/${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      }),
    );
    for (const c of response.headers.getSetCookie()) {
      const first = c.split(";")[0]!,
        i = first.indexOf("=");
      this.cookies.set(first.slice(0, i), first.slice(i + 1));
    }
    return response;
  }
}
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  pool = new Pool({ connectionString: url.toString(), max: 12 });
  directory = await mkdtemp(join(tmpdir(), "londos-p8-"));
  await migrate(pool, undefined, "009_shop_design_and_public_reads.sql");
  auth = createAuth(pool, coreConfig(), true);
  accounts = await seed(pool, auth, directory);
  baseline = (await pool.query("SELECT id,merchant_id,name,slug,version FROM shops ORDER BY id"))
    .rows;
  await migrate(pool);
  await migrate(pool);
  actors = {};
  for (const key of ["ownerA", "ownerB", "staff", "operator"] as const) {
    const client = new Client();
    expect(
      (
        await client.request("sign-in/email", {
          email: accounts[key].email,
          password: accounts[key].password,
        })
      ).status,
    ).toBe(200);
    if (key === "operator") {
      const enabled = await client.request("two-factor/enable", {
        password: accounts.operator.password,
      });
      expect(enabled.status).toBe(200);
      const secret = new URL((await enabled.json()).totpURI).searchParams.get("secret")!;
      expect(
        (
          await client.request("two-factor/verify-totp", {
            code: await generate({ secret }),
            trustDevice: false,
          })
        ).status,
      ).toBe(200);
      await pool.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'finance')", [
        accounts.operator.id,
      ]);
    }
    actors[key] = await resolveActor(auth, client.headers());
  }
  image = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#748352" } })
    .png()
    .toBuffer();
});
afterAll(async () => {
  await pool?.end();
  const deadline = Date.now() + 2000;
  while (
    (await parent.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1", [name])).rowCount &&
    Date.now() < deadline
  )
    await setTimeout(20);
  await parent.query(`DROP DATABASE IF EXISTS ${name}`);
  await parent.end();
  await rm(directory, { recursive: true, force: true });
  process.env.DATABASE_URL = parentURL;
});
function details() {
  return {
    businessName: `Fictional P8 ${randomUUID().slice(0, 8)}`,
    category: "fashion" as const,
    location: "Kampala sample location",
    description: "Fictional handmade shoes for local workflow testing.",
    phone: "+256700000001",
  };
}
async function draft() {
  return (
    await createApplication(pool, actors.ownerA!, {
      ...details(),
      key: randomUUID(),
      merchantId: seedIds.merchantA,
    })
  ).id;
}
async function submit(id: string) {
  let a = (await readApplication(pool, actors.ownerA!, id)).application;
  await saveEvidence(pool, actors.ownerA!, id, 1, a.version, image, "image/png");
  a = (await readApplication(pool, actors.ownerA!, id)).application;
  await submitApplication(pool, actors.ownerA!, id, { version: a.version, confirm: true });
}
async function approved(policyId = developmentPolicyId) {
  const id = await draft();
  await submit(id);
  await claimApplication(pool, actors.operator!, id, "review");
  const a = (await readApplication(pool, actors.operator!, id, "review")).application;
  await reviewApplication(pool, actors.operator!, id, {
    version: a.version,
    decision: "approved",
    reason: "Reviewed fictional evidence",
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
    reference: `TEST-${randomUUID().toUpperCase()}`,
    reason: "Verified fictional ledger receipt",
    confirm: true as const,
  };
}
async function paid() {
  const invoice = await approved();
  const result = await reconcileInvoice(pool, actors.operator!, invoice.id, credit(invoice));
  return { invoice, result, shop: result.shopId! };
}
async function synchronize(shop: string, now: Date) {
  return transaction(pool, async (client) => {
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [seedIds.merchantA]);
    return syncTenancy(client, shop, now);
  });
}

test("009 upgrade preserves existing shops and policies are immutable exact minor units", async () => {
  expect(
    (await pool.query("SELECT id,merchant_id,name,slug,version FROM shops ORDER BY id")).rows,
  ).toEqual(baseline);
  await expect(
    pool.query("UPDATE rent_policies SET amount_minor=6000 WHERE id=$1", [developmentPolicyId]),
  ).rejects.toMatchObject({ code: "P0001" });
  await expect(
    pool.query(
      "INSERT INTO rent_policies(id,label,currency,amount_minor,period_days,grace_days,mall_capacity,development_only) VALUES($1,'Invalid','UGX',5.5,30,7,1500,true)",
      [randomUUID()],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  expect((await pool.query("SELECT count(*)::int AS n FROM rent_contracts")).rows[0].n).toBe(0);
});
test("merchant payment claims remain pending until exact operator reconciliation", async () => {
  await updatePaymentSettings(pool, actors.operator!, {
    version: 0,
    supportEmail: "billing@londos.test",
    supportPhone: "+256700000001",
    mobileMoneyPhone: "+256700000002",
    mobileMoneyName: "Londos Test Payments",
    mtnMomoPhone: null,
    mtnMomoName: null,
    airtelMoneyPhone: null,
    airtelMoneyName: null,
    bankName: null,
    bankAccountName: null,
    bankAccountNumber: null,
    notifyShops: false,
    confirm: true,
  });
  const invoice = await approved(),
    reference = `PAY-${randomUUID().toUpperCase()}`;
  await submitPaymentClaim(pool, actors.ownerA!, invoice.id, {
    amountMinor: invoice.amount_minor,
    currency: "UGX",
    reference,
    note: "Fictional external payment submitted for verification",
    paymentMethod: "other",
    confirm: true,
  });
  let record = await readInvoice(pool, actors.ownerA!, invoice.id);
  expect(record.claims[0]).toMatchObject({ reference, state: "pending" });
  expect(record.paymentSettings).toMatchObject({
    support_email: "billing@londos.test",
    mobile_money_phone: "+256700000002",
  });
  expect(record.invoice.finalized).toBe(false);
  await reconcileInvoice(pool, actors.operator!, invoice.id, {
    ...credit(invoice),
    reference,
  });
  record = await readInvoice(pool, actors.ownerA!, invoice.id);
  expect(record.claims[0]!.state).toBe("verified");
  expect(record.invoice.finalized).toBe(true);
});
test("eligible free-period promo creates one auditable waiver and provisions once", async () => {
  const code = `FREE_${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  await createPromotion(pool, actors.operator!, {
    code,
    title: "Fictional first month free",
    description: "A fictional promotion used only for integration verification.",
    benefit: "free_period",
    audience: "new_shops",
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    maxRedemptions: 10,
    announce: false,
    confirm: true,
  });
  const invoice = await approved(),
    result = await applyPromotion(pool, actors.ownerA!, invoice.id, { code });
  expect(result).toMatchObject({ amountMinor: invoice.amount_minor });
  expect(result.shopId).toBeTruthy();
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM rent_events WHERE invoice_id=$1 AND kind='waiver' AND source_reference LIKE 'PROMO-%'",
        [invoice.id],
      )
    ).rows[0].n,
  ).toBe(1);
  await expect(applyPromotion(pool, actors.ownerA!, invoice.id, { code })).rejects.toMatchObject({
    code: "promotion_unavailable",
  });
});
test("campaign expansion stays owner-scoped and monthly reports use aggregate counts", async () => {
  await pool.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'operations')", [
    accounts.operator.id,
  ]);
  let campaign: { id: string; recipients: number };
  try {
    campaign = await createCampaign(pool, actors.operator!, {
      subject: "Fictional Londos notice",
      body: "This fictional message verifies safe campaign queue expansion.",
      ctaLabel: "Open Londos",
      ctaPath: "/shopkeeper",
      audience: "specific_shops",
      shopIds: [seedIds.shopA],
      confirm: true,
    });
  } finally {
    await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='operations'", [
      accounts.operator.id,
    ]);
  }
  expect(campaign.recipients).toBeGreaterThan(0);
  process.env.LONDOS_MONTHLY_REPORTS_ENABLED = "true";
  const reportMonth = new Date();
  reportMonth.setUTCDate(1);
  reportMonth.setUTCMonth(reportMonth.getUTCMonth() - 1);
  await pool.query(
    "INSERT INTO pilot_metrics(day,shop_id,merchant_id,event,source,detail,count) VALUES($1,$2,$3,'shop_viewed','direct','none',7) ON CONFLICT(day,shop_id,event,source,detail) DO UPDATE SET count=excluded.count",
    [reportMonth, seedIds.shopA, seedIds.merchantA],
  );
  try {
    await transaction(pool, (client) => scheduleCommunications(client, new Date()));
  } finally {
    delete process.env.LONDOS_MONTHLY_REPORTS_ENABLED;
  }
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM jobs WHERE payload->>'template'='campaign' AND payload->>'campaignId'=$1",
        [campaign.id],
      )
    ).rows[0].n,
  ).toBe(campaign.recipients);
  const monthly = (
    await pool.query(
      "SELECT payload FROM jobs WHERE payload->>'template'='monthly-report' AND shop_id=$1 ORDER BY created_at DESC LIMIT 1",
      [seedIds.shopA],
    )
  ).rows[0].payload;
  expect(monthly).toMatchObject({ shopViews: "7", shopId: seedIds.shopA });
  expect(monthly).not.toHaveProperty("visitorEmail");
});
test("application creation is idempotent and cannot use another merchant or staff authority", async () => {
  const input = { ...details(), key: randomUUID(), merchantId: seedIds.merchantA };
  const [a, b] = await Promise.all([
    createApplication(pool, actors.ownerA!, input),
    createApplication(pool, actors.ownerA!, input),
  ]);
  expect(a.id).toBe(b.id);
  await expect(
    createApplication(pool, actors.ownerA!, { ...input, businessName: "Changed" }),
  ).rejects.toMatchObject({ code: "idempotency_conflict" });
  for (const actor of [actors.ownerB!, actors.staff!])
    await expect(
      createApplication(pool, actor, { ...input, key: randomUUID() }),
    ).rejects.toMatchObject({ status: 404 });
  for (const actor of [actors.ownerB!, actors.staff!])
    await expect(readApplication(pool, actor, a.id)).rejects.toMatchObject({ status: 404 });
});
test("new authenticated applicant gets an owned merchant; evidence is private, normalized and versioned", async () => {
  const { id } = await createApplication(pool, actors.ownerB!, { ...details(), key: randomUUID() });
  await expect(
    submitApplication(pool, actors.ownerB!, id, { version: 1, confirm: true }),
  ).rejects.toMatchObject({ code: "verification_evidence_required" });
  await expect(
    saveEvidence(
      pool,
      actors.ownerB!,
      id,
      1,
      1,
      Buffer.from('<svg onload="alert(1)"/>'),
      "image/svg+xml",
    ),
  ).rejects.toMatchObject({ code: "invalid_evidence_image" });
  await saveEvidence(pool, actors.ownerB!, id, 1, 1, image, "image/png");
  await expect(
    saveEvidence(pool, actors.ownerB!, id, 2, 1, image, "image/png"),
  ).rejects.toMatchObject({ code: "stale_version" });
  expect(
    (await sharp(await readEvidence(pool, actors.ownerB!, id, 1, "owner")).metadata()).format,
  ).toBe("webp");
  await expect(readEvidence(pool, actors.ownerA!, id, 1, "owner")).rejects.toMatchObject({
    status: 404,
  });
  await expect(readEvidence(pool, actors.operator!, id, 1, "review")).rejects.toMatchObject({
    status: 404,
  });
});
test("review is scoped, needs-information can resubmit, and submitted snapshots cannot change", async () => {
  const id = await draft();
  await submit(id);
  const before = (await readApplication(pool, actors.ownerA!, id)).application;
  await expect(
    updateApplication(pool, actors.ownerA!, id, { ...details(), version: before.version }),
  ).rejects.toMatchObject({ code: "application_not_editable" });
  await expect(readApplication(pool, actors.operator!, id, "review")).rejects.toMatchObject({
    status: 404,
  });
  const queue = await applicationQueue(pool, actors.operator!, "review");
  expect(queue.find((x) => x.id === id)).not.toHaveProperty("phone");
  await claimApplication(pool, actors.operator!, id, "review");
  let row = (await readApplication(pool, actors.operator!, id, "review")).application;
  await reviewApplication(pool, actors.operator!, id, {
    version: row.version,
    decision: "needs_information",
    reason: "Please clarify sample location",
    confirm: true,
  });
  row = (await readApplication(pool, actors.ownerA!, id)).application;
  await updateApplication(pool, actors.ownerA!, id, { ...details(), version: row.version });
  row = (await readApplication(pool, actors.ownerA!, id)).application;
  await submitApplication(pool, actors.ownerA!, id, { version: row.version, confirm: true });
  await expect(
    pool.query("DELETE FROM application_submissions WHERE application_id=$1", [id]),
  ).rejects.toMatchObject({ code: "P0001" });
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM application_submissions WHERE application_id=$1",
        [id],
      )
    ).rows[0].n,
  ).toBe(2);
});
test("review freshness, grant revocation and self-review deny before decisions", async () => {
  const id = await draft();
  await submit(id);
  await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'staff')", [
    seedIds.merchantA,
    actors.operator!.userId,
  ]);
  await expect(claimApplication(pool, actors.operator!, id, "review")).rejects.toMatchObject({
    code: "conflict_of_interest",
  });
  await pool.query("DELETE FROM memberships WHERE merchant_id=$1 AND user_id=$2", [
    seedIds.merchantA,
    actors.operator!.userId,
  ]);
  const proof = (
    await pool.query("SELECT verified_at FROM mfa_proofs WHERE session_id=$1", [
      actors.operator!.sessionId,
    ])
  ).rows[0].verified_at;
  await pool.query(
    "UPDATE mfa_proofs SET verified_at=now()-interval '6 minutes' WHERE session_id=$1",
    [actors.operator!.sessionId],
  );
  await expect(claimApplication(pool, actors.operator!, id, "review")).rejects.toMatchObject({
    code: "fresh_authentication_required",
  });
  await pool.query("UPDATE mfa_proofs SET verified_at=$2 WHERE session_id=$1", [
    actors.operator!.sessionId,
    proof,
  ]);
  await claimApplication(pool, actors.operator!, id, "review");
  await pool.query("DELETE FROM operator_application_scopes WHERE application_id=$1", [id]);
  await expect(readApplication(pool, actors.operator!, id, "review")).rejects.toMatchObject({
    status: 404,
  });
});
test("racing approvals issue one pre-shop obligation and partial credit cannot provision", async () => {
  const id = await draft();
  await submit(id);
  await claimApplication(pool, actors.operator!, id, "review");
  const a = (await readApplication(pool, actors.operator!, id, "review")).application;
  const input = {
    version: a.version,
    decision: "approved" as const,
    reason: "Reviewed sample evidence",
    policyId: developmentPolicyId,
    confirm: true as const,
  };
  const results = await Promise.allSettled([
    reviewApplication(pool, actors.operator!, id, input),
    reviewApplication(pool, actors.operator!, id, input),
  ]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  const invoice = (await applicationInvoices(pool, actors.ownerA!, id, "owner"))[0]!;
  expect(invoice.shop_id).toBeNull();
  await expect(
    reconcileInvoice(pool, actors.operator!, invoice.id, credit(invoice)),
  ).rejects.toMatchObject({ status: 404 });
  await claimApplication(pool, actors.operator!, id, "finance");
  const partial = await reconcileInvoice(
    pool,
    actors.operator!,
    invoice.id,
    credit(invoice, "2000"),
  );
  expect(partial.shopId).toBeNull();
  expect(
    (await readApplication(pool, actors.ownerA!, id)).application.provisioned_shop_id,
  ).toBeNull();
  const current = (await readInvoice(pool, actors.operator!, invoice.id, "finance")).invoice;
  const final = await reconcileInvoice(pool, actors.operator!, invoice.id, {
    ...credit(current, "3000"),
    kind: "waiver",
    reason: "Approved fictional development waiver",
  });
  expect(final.shopId).toBeTruthy();
  expect((await readInvoice(pool, actors.ownerA!, invoice.id)).invoice.finalized).toBe(true);
  expect(
    (await pool.query("SELECT kind,reason FROM rent_events WHERE id=$1", [final.eventId])).rows[0],
  ).toEqual({ kind: "waiver", reason: "Approved fictional development waiver" });
});
test("duplicate receipt races cannot double-credit or provision and mismatched retries fail", async () => {
  const invoice = await approved(),
    input = credit(invoice);
  const [a, b] = await Promise.all([
    reconcileInvoice(pool, actors.operator!, invoice.id, input),
    reconcileInvoice(pool, actors.operator!, invoice.id, input),
  ]);
  expect(a).toEqual(b);
  expect(
    (
      await pool.query("SELECT count(*)::int AS n FROM rent_events WHERE invoice_id=$1", [
        invoice.id,
      ])
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await pool.query("SELECT count(*)::int AS n FROM rent_contracts WHERE application_id=$1", [
        invoice.application_id,
      ])
    ).rows[0].n,
  ).toBe(1);
  await expect(
    reconcileInvoice(pool, actors.operator!, invoice.id, {
      ...input,
      reason: "Different supplied reason",
    }),
  ).rejects.toMatchObject({ code: "idempotency_conflict" });
  await expect(readPublicShop(pool, a.shopId!)).rejects.toMatchObject({ status: 404 });
  await expect(reconcileInvoice(pool, actors.ownerA!, invoice.id, input)).rejects.toMatchObject({
    code: "mfa_required",
  });
});
test("overpayment, reused external reference, wrong currency and foreign invoice reads have no effects", async () => {
  const invoice = await approved();
  await expect(
    reconcileInvoice(pool, actors.operator!, invoice.id, {
      ...credit(invoice),
      invoiceReference: `LON-${randomUUID().replaceAll("-", "").toUpperCase()}`,
    }),
  ).rejects.toMatchObject({ code: "invoice_reference_mismatch" });
  await expect(
    reconcileInvoice(pool, actors.operator!, invoice.id, credit(invoice, "5001")),
  ).rejects.toMatchObject({ code: "amount_exceeds_balance" });
  await expect(
    reconcileInvoice(pool, actors.operator!, invoice.id, {
      ...credit(invoice),
      currency: "USD",
    } as never),
  ).rejects.toHaveProperty("issues");
  await expect(readInvoice(pool, actors.ownerB!, invoice.id)).rejects.toMatchObject({
    status: 404,
  });
  const input = credit(invoice, "1000");
  await reconcileInvoice(pool, actors.operator!, invoice.id, input);
  const current = (await readInvoice(pool, actors.operator!, invoice.id, "finance")).invoice;
  await expect(
    reconcileInvoice(pool, actors.operator!, invoice.id, {
      ...input,
      key: randomUUID(),
      version: current.version,
    }),
  ).rejects.toMatchObject({ code: "receipt_already_used" });
  expect(current.credited_minor).toBe("1000");
});
test("provisioning failure rolls back credit, receipt, identity and audit so retry is safe", async () => {
  const invoice = await approved(),
    input = credit(invoice);
  await pool.query(
    "CREATE FUNCTION reject_p8_contract() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected provisioning stop'; END $$; CREATE TRIGGER reject_p8_contract BEFORE INSERT ON rent_contracts FOR EACH ROW EXECUTE FUNCTION reject_p8_contract()",
  );
  try {
    await expect(reconcileInvoice(pool, actors.operator!, invoice.id, input)).rejects.toMatchObject(
      { code: "P0001" },
    );
  } finally {
    await pool.query(
      "DROP TRIGGER reject_p8_contract ON rent_contracts; DROP FUNCTION reject_p8_contract()",
    );
  }
  expect(
    (await readInvoice(pool, actors.operator!, invoice.id, "finance")).invoice.credited_minor,
  ).toBe("0");
  expect(
    (await readApplication(pool, actors.ownerA!, invoice.application_id)).application
      .provisioned_shop_id,
  ).toBeNull();
  expect((await reconcileInvoice(pool, actors.operator!, invoice.id, input)).shopId).toBeTruthy();
});
test("reversals append once, close public access and repayment never rewrites finalized coverage or suspension", async () => {
  const { invoice, result, shop } = await paid();
  const draft = await readDesign(pool, actors.ownerA!, shop);
  const saved = await saveDesign(pool, actors.ownerA!, shop, {
    version: 0,
    summary: "Empty sample layout",
    specification: draft.specification,
  });
  await publishDesign(pool, actors.ownerA!, shop, { ...saved, confirm: true });
  expect((await readPublicShop(pool, shop)).shop.id).toBe(shop);
  const before = (await readInvoice(pool, actors.operator!, invoice.id, "finance")).invoice;
  const input = {
    key: randomUUID(),
    version: before.version,
    eventId: result.eventId,
    reason: "Fictional bank correction",
    confirm: true as const,
  };
  const reversed = await reverseCredit(pool, actors.operator!, invoice.id, input);
  expect(await reverseCredit(pool, actors.operator!, invoice.id, input)).toEqual(reversed);
  expect((await shopRent(pool, actors.ownerA!, shop)).tenancy.state).toBe("closed");
  await expect(readPublicShop(pool, shop)).rejects.toMatchObject({ status: 404 });
  await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [shop]);
  const current = (await readInvoice(pool, actors.operator!, invoice.id, "finance")).invoice;
  await reconcileInvoice(pool, actors.operator!, invoice.id, credit(current));
  const after = (await readInvoice(pool, actors.operator!, invoice.id, "finance")).invoice;
  expect(after.period_end).toEqual(before.period_end);
  expect((await shopRent(pool, actors.ownerA!, shop)).tenancy.state).toBe("active");
  await expect(readPublicShop(pool, shop)).rejects.toMatchObject({ status: 404 });
  await expect(
    pool.query("UPDATE rent_events SET amount_minor=1 WHERE id=$1", [result.eventId]),
  ).rejects.toMatchObject({ code: "P0001" });
  await expect(
    pool.query("UPDATE invoices SET period_end=period_end+interval '1 day' WHERE id=$1", [
      invoice.id,
    ]),
  ).rejects.toMatchObject({ code: "P0001" });
});
test("time boundaries, renewal finalization and old scheduled jobs use current coverage", async () => {
  const { invoice, shop } = await paid();
  const first = (await readInvoice(pool, actors.ownerA!, invoice.id)).invoice,
    end = first.period_end;
  expect(tenancyAt(end, 7, new Date(end.getTime() - 1))).toBe("active");
  expect(tenancyAt(end, 7, end)).toBe("due");
  expect(tenancyAt(end, 7, new Date(end.getTime() + 86400000))).toBe("grace");
  expect(tenancyAt(end, 7, new Date(end.getTime() + 7 * 86400000))).toBe("closed");
  expect(tenancyAt(end, 0, end)).toBe("closed");
  const reminderAt = new Date(end.getTime() - 3 * 86400000);
  await synchronize(shop, reminderAt);
  await synchronize(shop, reminderAt);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM jobs WHERE payload->>'template'='tenancy-status' AND payload->>'shopId'=$1 AND payload->>'state'='renewal_due'",
        [shop],
      )
    ).rows[0].n,
  ).toBe(1);
  await synchronize(shop, end);
  expect((await shopRent(pool, actors.ownerA!, shop)).tenancy.state).toBe("due");
  await synchronize(shop, new Date(end.getTime() + 86400000));
  expect((await shopRent(pool, actors.ownerA!, shop)).tenancy.state).toBe("grace");
  const closedAt = new Date(end.getTime() + 7 * 86400000);
  await synchronize(shop, closedAt);
  let state = (await shopRent(pool, actors.ownerA!, shop)).tenancy;
  expect(state.state).toBe("closed");
  const renewal = await requestRenewal(pool, actors.ownerA!, shop, state.version, closedAt);
  expect((await requestRenewal(pool, actors.ownerA!, shop, state.version, closedAt)).id).toBe(
    renewal.id,
  );
  const renewalInvoice = (await readInvoice(pool, actors.operator!, renewal.id, "finance")).invoice;
  await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [shop]);
  await reconcileInvoice(pool, actors.operator!, renewal.id, credit(renewalInvoice), closedAt);
  state = (await shopRent(pool, actors.ownerA!, shop)).tenancy;
  expect(state.state).toBe("active");
  expect(state.period_end!.getTime()).toBe(closedAt.getTime() + 30 * 86400000);
  expect(
    (await pool.query("SELECT state FROM shop_moderation WHERE shop_id=$1", [shop])).rows[0].state,
  ).toBe("suspended");
  const jobId = randomUUID(),
    token = randomUUID();
  await pool.query(
    "INSERT INTO jobs(id,merchant_id,shop_id,kind,dedupe_key,payload,state,lease_token,lease_until) VALUES($1,$2,$3,'rent.tick',$4,$5,'running',$6,now()+interval '1 minute')",
    [jobId, seedIds.merchantA, shop, `old:${jobId}`, JSON.stringify({ shopId: shop }), token],
  );
  const job = (await pool.query("SELECT * FROM jobs WHERE id=$1", [jobId])).rows[0];
  await handleRentTick(pool, job, AbortSignal.timeout(5000), closedAt);
  await handleRentTick(pool, job, AbortSignal.timeout(5000), closedAt);
  expect((await shopRent(pool, actors.ownerA!, shop)).tenancy.state).toBe("active");
  await acknowledge(pool, job);
  await expect(handleRentTick(pool, job, AbortSignal.timeout(5000), closedAt)).rejects.toThrow(
    "lease_lost",
  );
});
test("planning capacity creates another mall under concurrent merchant provisioning", async () => {
  await pool.query("UPDATE malls SET planning_capacity=1");
  const policy = await createPolicy(pool, actors.operator!, {
    label: "Capacity one development test",
    amountMinor: "5000",
    periodDays: 30,
    graceDays: 7,
    mallCapacity: 1,
    confirm: true,
  });
  const a = await approved(policy.id),
    b = await approved(policy.id);
  // Different merchant locks exercise the shared mall allocation lock.
  const other = await createApplication(pool, actors.ownerB!, { ...details(), key: randomUUID() });
  await saveEvidence(pool, actors.ownerB!, other.id, 1, 1, image, "image/png");
  await submitApplication(pool, actors.ownerB!, other.id, { version: 2, confirm: true });
  await claimApplication(pool, actors.operator!, other.id, "review");
  const app = (await readApplication(pool, actors.operator!, other.id, "review")).application;
  await reviewApplication(pool, actors.operator!, other.id, {
    version: app.version,
    decision: "approved",
    reason: "Capacity fixture approval",
    policyId: policy.id,
    confirm: true,
  });
  await claimApplication(pool, actors.operator!, other.id, "finance");
  const c = (await applicationInvoices(pool, actors.operator!, other.id, "finance"))[0]!;
  const results = await Promise.all(
    [a, b, c].map((i) => reconcileInvoice(pool, actors.operator!, i.id, credit(i))),
  );
  const rows = (
    await pool.query("SELECT mall_id FROM shops WHERE id=ANY($1::uuid[])", [
      results.map((r) => r.shopId),
    ])
  ).rows;
  expect(new Set(rows.map((r) => r.mall_id)).size).toBe(3);
});
test("scheduler is bounded, deduplicated and private staff have no rent permission by default", async () => {
  await expect(shopRent(pool, actors.staff!, seedIds.shopA)).rejects.toMatchObject({ status: 404 });
  const now = new Date(Date.now() + 80 * 86400000);
  await schedule(pool, now);
  await schedule(pool, now);
  const jobs = (await pool.query("SELECT dedupe_key FROM jobs WHERE kind='rent.tick'")).rows;
  expect(jobs.length).toBeLessThanOrEqual(101);
  expect(new Set(jobs.map((j) => j.dedupe_key)).size).toBe(jobs.length);
  expect(jobs.length).toBeGreaterThan(0);
});
test("finance scope revoked while waiting on the merchant lock cannot settle an invoice", async () => {
  const invoice = await approved(),
    locker = await pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [invoice.merchant_id]);
    pending = reconcileInvoice(pool, actors.operator!, invoice.id, credit(invoice)).catch(
      (error) => error,
    );
    let blocked = false;
    for (let n = 0; n < 100; n++) {
      blocked = Boolean(
        (
          await pool.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM merchants%'",
          )
        ).rowCount,
      );
      if (blocked) break;
      await setTimeout(10);
    }
    expect(blocked).toBe(true);
    await pool.query(
      "DELETE FROM operator_application_scopes WHERE user_id=$1 AND application_id=$2 AND permission='finance'",
      [actors.operator!.userId, invoice.application_id],
    );
    await locker.query("COMMIT");
    expect(await pending).toMatchObject({ status: 404 });
    expect((await readInvoice(pool, actors.ownerA!, invoice.id)).invoice.credited_minor).toBe("0");
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
    await pending;
  }
});
test("database workflow ledger rejects direct over-credit and invalid reversal without altering history", async () => {
  const invoice = await approved();
  for (const [kind, value, source, reference] of [
    ["payment", "5001", "local-manual", "SQL-OVERPAY"],
    ["payment", "-1", "local-manual", "SQL-NEGATIVE"],
    ["adjustment", "-5000", "local-reversal", randomUUID()],
  ]) {
    await expect(
      pool.query(
        "INSERT INTO rent_events(id,invoice_id,merchant_id,currency,amount_minor,kind,source,source_reference,actor_id,reason) VALUES($1,$2,$3,'UGX',$4,$5,$6,$7,$8,'Fictional constraint test')",
        [
          randomUUID(),
          invoice.id,
          invoice.merchant_id,
          value,
          kind,
          source,
          reference,
          actors.operator!.userId,
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  }
  expect((await readInvoice(pool, actors.ownerA!, invoice.id)).events).toHaveLength(0);
});

test("administration upgrade reserves all addresses and operations grants remain explicit", async () => {
  expect((await pool.query("SELECT count(*)::int AS n FROM shop_addresses")).rows[0].n).toBe(
    (await pool.query("SELECT count(*)::int AS n FROM shops")).rows[0].n,
  );
  await expect(operationsQueue(pool, actors.operator!)).rejects.toMatchObject({
    code: "permission_denied",
  });
  await pool.query("INSERT INTO operator_grants(user_id,permission) VALUES($1,'operations')", [
    actors.operator!.userId,
  ]);
  expect((await ownedMerchants(pool, actors.ownerA!)).some((m) => m.id === seedIds.merchantA)).toBe(
    true,
  );
  expect(await ownedMerchants(pool, actors.staff!)).toEqual([]);
});
test("owner team lists are private and racing versioned invitations cannot overwrite access", async () => {
  await expect(readTeam(pool, actors.ownerB!, seedIds.merchantA)).rejects.toMatchObject({
    status: 404,
  });
  await expect(readTeam(pool, actors.staff!, seedIds.merchantA)).rejects.toMatchObject({
    status: 404,
  });
  const team = await readTeam(pool, actors.ownerA!, seedIds.merchantA);
  const command = {
    action: "invite" as const,
    version: team.merchant.version,
    confirm: true as const,
    value: {
      email: `team-${randomUUID()}@londos.example`,
      role: "staff" as const,
      permissions: ["catalogue" as const],
    },
  };
  const results = await Promise.allSettled([
    teamCommand(pool, actors.ownerA!, seedIds.merchantA, command),
    teamCommand(pool, actors.ownerA!, seedIds.merchantA, command),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "stale_version" },
  });
  const current = await readTeam(pool, actors.ownerA!, seedIds.merchantA);
  expect(current.merchant.version).toBe(team.merchant.version + 1);
  expect(current.invitations.filter((i) => i.email === command.value.email)).toHaveLength(1);
  expect(JSON.stringify(current)).not.toMatch(/token_hash|"token"/);
  await teamCommand(pool, actors.ownerA!, seedIds.merchantA, {
    action: "revoke_invitation",
    version: current.merchant.version,
    confirm: true,
    invitationId: current.invitations.find((i) => i.email === command.value.email)!.id,
  });
});
test("invitation acceptance advances the team version and a revoked issuer cannot revive an invitation", async () => {
  const team = await readTeam(pool, actors.ownerA!, seedIds.merchantA);
  const result = await teamCommand(pool, actors.ownerA!, seedIds.merchantA, {
    action: "invite",
    version: team.merchant.version,
    confirm: true,
    value: { email: accounts.invitee.email, role: "staff", permissions: ["catalogue"] },
  });
  const id = (result as { id: string }).id;
  const token = (
    await pool.query("SELECT payload->>'token' AS token FROM jobs WHERE dedupe_key=$1", [
      `invitation:${id}`,
    ])
  ).rows[0].token;
  const client = new Client();
  expect(
    (
      await client.request("sign-in/email", {
        email: accounts.invitee.email,
        password: accounts.invitee.password,
      })
    ).status,
  ).toBe(200);
  const actor = await resolveActor(auth, client.headers());
  await acceptInvitation(pool, actor, token);
  expect((await readTeam(pool, actors.ownerA!, seedIds.merchantA)).merchant.version).toBe(
    team.merchant.version + 2,
  );
  await expect(acceptInvitation(pool, actor, token)).rejects.toMatchObject({
    code: "invitation_unavailable",
  });
  const before = await readTeam(pool, actors.ownerA!, seedIds.merchantA);
  const pending = await teamCommand(pool, actors.ownerA!, seedIds.merchantA, {
    action: "invite",
    version: before.merchant.version,
    confirm: true,
    value: { email: `revoked-${randomUUID()}@londos.example`, role: "staff", permissions: [] },
  });
  const latest = await readTeam(pool, actors.ownerA!, seedIds.merchantA);
  await teamCommand(pool, actors.ownerA!, seedIds.merchantA, {
    action: "transfer",
    version: latest.merchant.version,
    confirm: true,
    userId: actor.userId,
  });
  await expect(readTeam(pool, actors.ownerA!, seedIds.merchantA)).rejects.toMatchObject({
    status: 404,
  });
  expect(
    (
      await pool.query("SELECT revoked_at FROM invitations WHERE id=$1", [
        (pending as { id: string }).id,
      ])
    ).rows[0].revoked_at,
  ).not.toBeNull();
  // Restore only this isolated fixture for subsequent tests; the invitation remains revoked.
  await pool.query("UPDATE memberships SET role='owner' WHERE merchant_id=$1 AND user_id=$2", [
    seedIds.merchantA,
    actors.ownerA!.userId,
  ]);
  await pool.query("UPDATE memberships SET role='staff' WHERE merchant_id=$1 AND user_id=$2", [
    seedIds.merchantA,
    actor.userId,
  ]);
  expect(
    (
      await pool.query("SELECT revoked_at FROM invitations WHERE id=$1", [
        (pending as { id: string }).id,
      ])
    ).rows[0].revoked_at,
  ).not.toBeNull();
});
test("team revisions preserve last-owner safety and restrict staff shop grants", async () => {
  let view = await readTeam(pool, actors.ownerA!, seedIds.merchantA);
  await expect(
    teamCommand(pool, actors.ownerA!, seedIds.merchantA, {
      action: "membership",
      version: view.merchant.version,
      confirm: true,
      userId: actors.ownerA!.userId,
      value: { role: "staff", status: "active", permissions: [] },
    }),
  ).rejects.toMatchObject({ code: "last_owner_required" });
  expect((await readTeam(pool, actors.ownerA!, seedIds.merchantA)).merchant.version).toBe(
    view.merchant.version,
  );
  await expect(
    teamCommand(pool, actors.ownerA!, seedIds.merchantA, {
      action: "staff_shop",
      version: view.merchant.version,
      confirm: true,
      value: { userId: actors.staff!.userId, shopId: seedIds.shopA, permissions: ["finance"] },
    }),
  ).rejects.toMatchObject({ code: "grant_exceeds_membership" });
  await teamCommand(pool, actors.ownerA!, seedIds.merchantA, {
    action: "staff_shop",
    version: view.merchant.version,
    confirm: true,
    value: { userId: actors.staff!.userId, shopId: seedIds.shopA, permissions: ["catalogue"] },
  });
  view = await readTeam(pool, actors.ownerA!, seedIds.merchantA);
  expect(
    view.grants.some(
      (g) => g.user_id === actors.staff!.userId && g.permissions.includes("catalogue"),
    ),
  ).toBe(true);
});
test("versioned owner address changes preserve aliases and reject SQL alias takeover", async () => {
  const row = (await pool.query("SELECT version,slug FROM shops WHERE id=$1", [seedIds.shopA]))
      .rows[0],
    slug = `admin-${randomUUID()}`;
  const input = {
    version: row.version,
    slug,
    reason: "Fictional shop address update",
    confirm: true as const,
  };
  await expect(changeAddress(pool, actors.staff!, seedIds.shopA, input)).rejects.toMatchObject({
    status: 404,
  });
  await expect(changeAddress(pool, actors.ownerB!, seedIds.shopA, input)).rejects.toMatchObject({
    status: 404,
  });
  const updated = await changeAddress(pool, actors.ownerA!, seedIds.shopA, input);
  await expect(changeAddress(pool, actors.ownerA!, seedIds.shopA, input)).rejects.toMatchObject({
    code: "stale_version",
  });
  expect(updated.version).toBe(row.version + 1);
  await expect(
    pool.query("UPDATE shops SET slug=$2 WHERE id=$1", [seedIds.shopB, row.slug]),
  ).rejects.toMatchObject({ code: "23505" });
  await expect(
    pool.query("DELETE FROM shop_addresses WHERE slug=$1", [row.slug]),
  ).rejects.toMatchObject({ code: "P0001" });
  await expect(
    changeAddress(pool, actors.ownerA!, seedIds.shopA, {
      ...input,
      version: updated.version,
      slug: randomUUID(),
    }),
  ).rejects.toHaveProperty("issues");
  const draft = await readDesign(pool, actors.ownerA!, seedIds.shopA),
    saved = await saveDesign(pool, actors.ownerA!, seedIds.shopA, {
      version: 0,
      summary: "Alias fixture",
      specification: draft.specification,
    });
  await publishDesign(pool, actors.ownerA!, seedIds.shopA, { ...saved, confirm: true });
  expect((await readPublicShop(pool, row.slug)).shop.slug).toBe(slug);
  expect((await readPublicShop(pool, seedIds.shopA)).shop.id).toBe(seedIds.shopA);
});
test("scoped operations block self-claim and a revoked scope cannot change a waiting command", async () => {
  await expect(readOperations(pool, actors.operator!, seedIds.shopA)).rejects.toMatchObject({
    status: 404,
  });
  await claimOperations(pool, actors.operator!, seedIds.shopA, {
    reason: "Fictional scoped investigation",
    confirm: true,
  });
  await pool.query(
    "INSERT INTO memberships(merchant_id,user_id,role,permissions) VALUES($1,$2,'staff','{}')",
    [seedIds.merchantB, actors.operator!.userId],
  );
  await expect(
    claimOperations(pool, actors.operator!, seedIds.shopB, {
      reason: "Self investigation is prohibited",
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "conflict_of_interest" });
  await pool.query("DELETE FROM memberships WHERE merchant_id=$1 AND user_id=$2", [
    seedIds.merchantB,
    actors.operator!.userId,
  ]);
  const view = await readOperations(pool, actors.operator!, seedIds.shopA),
    locker = await pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [seedIds.merchantA]);
    pending = commandOperations(pool, actors.operator!, seedIds.shopA, {
      action: "pause",
      version: view.shop.version,
      reason: "Waiting command must recheck scope",
      confirm: true,
    }).catch((e) => e);
    let blocked = false;
    for (let n = 0; n < 100; n++) {
      blocked = Boolean(
        (
          await pool.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM merchants%' ",
          )
        ).rowCount,
      );
      if (blocked) break;
      await setTimeout(10);
    }
    expect(blocked).toBe(true);
    await pool.query("DELETE FROM operator_operations_scopes WHERE user_id=$1 AND shop_id=$2", [
      actors.operator!.userId,
      seedIds.shopA,
    ]);
    await locker.query("COMMIT");
    expect(await pending).toMatchObject({ status: 404 });
    expect(
      (await pool.query("SELECT 1 FROM shop_operations WHERE shop_id=$1", [seedIds.shopA]))
        .rowCount,
    ).toBe(0);
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
    await pending;
  }
});
test("administrative pause gates shop, alias, discovery, contact and ready images despite publication or renewal", async () => {
  const { shop, invoice } = await paid(),
    department = randomUUID(),
    product = randomUUID(),
    asset = randomUUID();
  await pool.query(
    "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) VALUES($1,$2,$3,'Admin shoes','admin-shoes',0)",
    [department, shop, seedIds.merchantA],
  );
  await pool.query(
    "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,availability) VALUES($1,$2,$3,$4,'product','Admin shoes','admin-shoes','UGX','available')",
    [product, shop, seedIds.merchantA, department],
  );
  await pool.query(
    "INSERT INTO media_assets(id,shop_id,merchant_id,state,storage_key,alt) VALUES($1,$2,$3,'ready',$4,'Fictional ready image')",
    [asset, shop, seedIds.merchantA, `admin:${asset}`],
  );
  const display = await sharp(image).webp().toBuffer();
  await pool.query(
    "INSERT INTO media_blobs(asset_id,variant,bytes,width,height) VALUES($1,'display',$2,80,60)",
    [asset, display],
  );
  await pool.query(
    "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id) VALUES($1,$2,$3,$4)",
    [product, asset, shop, seedIds.merchantA],
  );
  await saveContacts(pool, actors.ownerA!, shop, {
    version: 0,
    phone: "+256700000001",
    whatsapp: "",
    website: "",
    fulfilment: "contact",
    paymentInstructions: "",
    deliveryInstructions: "",
    enquiriesEnabled: true,
    reason: "Fictional contacts",
  });
  const draft = await readDesign(pool, actors.ownerA!, shop),
    saved = await saveDesign(pool, actors.ownerA!, shop, {
      version: 0,
      summary: "Admin eligibility fixture",
      specification: draft.specification,
    });
  await publishDesign(pool, actors.ownerA!, shop, { ...saved, confirm: true });
  const slug = (await readPublicShop(pool, shop)).shop.slug;
  expect((await readPublicShop(pool, shop)).applicationReviewed).toBe(true);
  expect(await readPublicVariant(pool, shop, asset, "display")).toEqual(display);
  await claimOperations(pool, actors.operator!, shop, {
    reason: "Private investigation fixture",
    confirm: true,
  });
  let view = await readOperations(pool, actors.operator!, shop);
  await commandOperations(pool, actors.operator!, shop, {
    action: "pause",
    version: view.shop.version,
    reason: "Temporary administrative pause",
    confirm: true,
  });
  const designAtPause = await readDesign(pool, actors.ownerA!, shop);
  await publishDesign(pool, actors.ownerA!, shop, {
    version: designAtPause.version,
    revision: saved.revision,
    confirm: true,
  });
  await synchronize(shop, new Date());
  await expect(readPublicShop(pool, slug)).rejects.toMatchObject({ status: 404 });
  await expect(publicContact(pool, shop)).rejects.toMatchObject({ status: 404 });
  await expect(readPublicVariant(pool, shop, asset, "display")).rejects.toMatchObject({
    status: 404,
  });
  expect((await new PostgresSearch(pool).search({ query: "", shopId: shop })).results).toEqual([]);
  view = await readOperations(pool, actors.operator!, shop);
  await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [shop]);
  await commandOperations(pool, actors.operator!, shop, {
    action: "resume",
    version: view.shop.version,
    reason: "Administrative review completed",
    confirm: true,
  });
  await expect(readPublicShop(pool, slug)).rejects.toMatchObject({ status: 404 });
  expect((await readInvoice(pool, actors.ownerA!, invoice.id)).invoice.credited_minor).toBe("5000");
  await pool.query("UPDATE shop_moderation SET state='clear' WHERE shop_id=$1", [shop]);
  expect((await readPublicShop(pool, slug)).shop.id).toBe(shop);
  const current = (await readInvoice(pool, actors.operator!, invoice.id, "finance")).invoice,
    event = (await readInvoice(pool, actors.operator!, invoice.id, "finance")).events[0]!;
  await reverseCredit(pool, actors.operator!, invoice.id, {
    key: randomUUID(),
    version: current.version,
    eventId: event.id,
    reason: "Fictional exception fixture",
    confirm: true,
  });
  expect(
    (await rentExceptions(pool, actors.operator!)).some((i) => i.id === invoice.id && i.finalized),
  ).toBe(true);
  await pool.query(
    "DELETE FROM operator_application_scopes WHERE user_id=$1 AND application_id=$2 AND permission='finance'",
    [actors.operator!.userId, invoice.application_id],
  );
  expect((await rentExceptions(pool, actors.operator!)).some((i) => i.id === invoice.id)).toBe(
    false,
  );
});
test("racing mall reassignment respects capacity and leaves shop identity and history intact", async () => {
  const mall = randomUUID();
  await pool.query(
    "INSERT INTO malls(id,name,planning_capacity) VALUES($1,'Admin capacity target',1)",
    [mall],
  );
  for (const shopId of [seedIds.shopA, seedIds.shopB])
    await claimOperations(pool, actors.operator!, shopId, {
      reason: "Capacity assignment fixture",
      confirm: true,
    });
  const views = await Promise.all(
    [seedIds.shopA, seedIds.shopB].map((id) => readOperations(pool, actors.operator!, id)),
  );
  const results = await Promise.allSettled(
    views.map((v) =>
      commandOperations(pool, actors.operator!, v.shop.id, {
        action: "move",
        mallId: mall,
        version: v.shop.version,
        reason: "Rebalance fictional logical mall",
        confirm: true,
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "mall_at_capacity" },
  });
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM shops WHERE mall_id=$1", [mall])).rows[0].n,
  ).toBe(1);
  for (const before of views) {
    const after = await readOperations(pool, actors.operator!, before.shop.id);
    expect(after.shop.id).toBe(before.shop.id);
    expect(after.shop.slug).toBe(before.shop.slug);
    expect(after.shop.merchant_id).toBe(before.shop.merchant_id);
  }
  expect(
    (await mallOccupancy(pool, actors.operator!)).some((m) => m.id === mall && m.occupied === 1),
  ).toBe(true);
});

test("R2 finance scope revoked during shared mall allocation rolls back settlement and provisioning", async () => {
  const invoice = await approved(),
    locker = await pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await locker.query("BEGIN");
    await locker.query("SELECT pg_advisory_xact_lock(hashtextextended('londos:mall-capacity',0))");
    pending = reconcileInvoice(pool, actors.operator!, invoice.id, credit(invoice)).then(
      () => ({ accepted: true }),
      (error: unknown) => error,
    );
    let blocked = false;
    for (let n = 0; n < 100; n++) {
      blocked = Boolean(
        (
          await pool.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%londos:mall-capacity%' ",
          )
        ).rowCount,
      );
      if (blocked) break;
      await setTimeout(10);
    }
    expect(blocked).toBe(true);
    await pool.query(
      "DELETE FROM operator_application_scopes WHERE user_id=$1 AND application_id=$2 AND permission='finance'",
      [actors.operator!.userId, invoice.application_id],
    );
    await locker.query("COMMIT");
    expect(await pending).toMatchObject({ status: 404, code: "resource_unavailable" });
    expect(
      (await pool.query("SELECT 1 FROM rent_events WHERE invoice_id=$1", [invoice.id])).rowCount,
    ).toBe(0);
    expect(
      (await pool.query("SELECT 1 FROM rent_command_receipts WHERE invoice_id=$1", [invoice.id]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await pool.query("SELECT provisioned_shop_id FROM applications WHERE id=$1", [
          invoice.application_id,
        ])
      ).rows[0].provisioned_shop_id,
    ).toBeNull();
    expect((await readInvoice(pool, actors.ownerA!, invoice.id)).invoice.credited_minor).toBe("0");
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
    await pending;
  }
});

test("R2 operations grant revoked during the target mall lock cannot move a shop", async () => {
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission)VALUES($1,'operations') ON CONFLICT DO NOTHING",
    [actors.operator!.userId],
  );
  await claimOperations(pool, actors.operator!, seedIds.shopA, {
    reason: "R2 fictional mall move review",
    confirm: true,
  });
  const before = (await readOperations(pool, actors.operator!, seedIds.shopA)).shop,
    mall = randomUUID(),
    locker = await pool.connect();
  await pool.query("INSERT INTO malls(id,name,planning_capacity)VALUES($1,'R2 target mall',100)", [
    mall,
  ]);
  const auditBefore = (
    await pool.query(
      "SELECT count(*)::int AS n FROM audit_events WHERE action='shop.operations.move' AND resource_id=$1",
      [seedIds.shopA],
    )
  ).rows[0].n;
  let pending: Promise<unknown> | undefined;
  try {
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM malls WHERE id=$1 FOR UPDATE", [mall]);
    pending = commandOperations(pool, actors.operator!, seedIds.shopA, {
      action: "move",
      version: before.version,
      mallId: mall,
      reason: "R2 move waits for target capacity",
      confirm: true,
    }).then(
      () => ({ accepted: true }),
      (error: unknown) => error,
    );
    let blocked = false;
    for (let n = 0; n < 100; n++) {
      blocked = Boolean(
        (
          await pool.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id,planning_capacity FROM malls%' ",
          )
        ).rowCount,
      );
      if (blocked) break;
      await setTimeout(10);
    }
    expect(blocked).toBe(true);
    await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='operations'", [
      actors.operator!.userId,
    ]);
    await locker.query("COMMIT");
    expect(await pending).toMatchObject({ status: 403, code: "permission_denied" });
    expect(
      (await pool.query("SELECT version,mall_id FROM shops WHERE id=$1", [seedIds.shopA])).rows[0],
    ).toEqual({ version: before.version, mall_id: before.mall_id });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE action='shop.operations.move' AND resource_id=$1",
          [seedIds.shopA],
        )
      ).rows[0].n,
    ).toBe(auditBefore);
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
    await pending;
    await pool.query(
      "INSERT INTO operator_grants(user_id,permission)VALUES($1,'operations') ON CONFLICT DO NOTHING",
      [actors.operator!.userId],
    );
  }
});

function collectionSettings(version: number, label: string, notifyShops = false) {
  return {
    version,
    supportEmail: `billing-${label}@londos.test`,
    supportPhone: null,
    mobileMoneyPhone: "+256700000002",
    mobileMoneyName: `Fictional collection ${label}`,
    mtnMomoPhone: null,
    mtnMomoName: null,
    airtelMoneyPhone: null,
    airtelMoneyName: null,
    bankName: null,
    bankAccountName: null,
    bankAccountNumber: null,
    notifyShops,
    confirm: true as const,
  };
}

async function waitForSettingsWriters(applicationName: string, count: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const waiting = (
      await pool.query(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1 AND wait_event_type='Lock'",
        [applicationName],
      )
    ).rows[0].n;
    if (waiting === count) return;
    await setTimeout(10);
  }
  throw new Error("Expected concurrent fictional payment-settings writers did not reach the lock");
}

test.each(["initial", "existing"] as const)(
  "payment settings serialize %s saves without losing edits or announcing a rejected version",
  async (mode) => {
    if (mode === "initial") await pool.query("DELETE FROM payment_settings");
    else {
      const previous = await currentPaymentSettings(pool);
      await updatePaymentSettings(
        pool,
        actors.operator!,
        collectionSettings(previous?.version ?? 0, "baseline"),
      );
    }
    const before = await currentPaymentSettings(pool),
      version = before?.version ?? 0,
      auditBefore = (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE action='billing.payment-settings.changed'",
        )
      ).rows[0].n,
      campaignsBefore = (await pool.query("SELECT count(*)::int AS n FROM email_campaigns")).rows[0]
        .n;
    const label = `settings-race-${randomUUID()}`,
      writers = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 2,
        application_name: label,
      }),
      blocker = await pool.connect();
    let pending:
      | Promise<PromiseSettledResult<Awaited<ReturnType<typeof updatePaymentSettings>>>[]>
      | undefined;
    try {
      await blocker.query("BEGIN");
      if (mode === "initial") await blocker.query("LOCK TABLE payment_settings IN SHARE MODE");
      else await blocker.query("SELECT singleton FROM payment_settings FOR UPDATE");
      const inputs = [
        collectionSettings(version, "first", true),
        collectionSettings(version, "second", true),
      ];
      pending = Promise.allSettled(
        inputs.map((input) => updatePaymentSettings(writers, actors.operator!, input)),
      );
      await waitForSettingsWriters(label, 2);
      await blocker.query("COMMIT");
      const results = await pending;
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({
        status: "rejected",
        reason: { status: 409, code: "stale_version" },
      });
      const saved = await currentPaymentSettings(pool),
        winner = results.findIndex((result) => result.status === "fulfilled");
      expect(saved).toMatchObject({
        version: version + 1,
        support_email: inputs[winner]!.supportEmail,
      });
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE action='billing.payment-settings.changed'",
          )
        ).rows[0].n,
      ).toBe(auditBefore + 1);
      expect((await pool.query("SELECT count(*)::int AS n FROM email_campaigns")).rows[0].n).toBe(
        campaignsBefore + 1,
      );
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      await pending;
      await writers.end();
    }
  },
);

test("payment settings recheck current finance authority after a competing save lock", async () => {
  const before = await currentPaymentSettings(pool),
    label = `settings-scope-${randomUUID()}`,
    writers = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      application_name: label,
    }),
    blocker = await pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended('payment-settings',0))");
    pending = updatePaymentSettings(
      writers,
      actors.operator!,
      collectionSettings(before?.version ?? 0, "revoked"),
    ).then(
      (result) => ({ accepted: result }),
      (error: unknown) => error,
    );
    await waitForSettingsWriters(label, 1);
    await pool.query("DELETE FROM operator_grants WHERE user_id=$1 AND permission='finance'", [
      actors.operator!.userId,
    ]);
    await blocker.query("COMMIT");
    expect(await pending).toMatchObject({ status: 403, code: "permission_denied" });
    expect(await currentPaymentSettings(pool)).toEqual(before);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await pending;
    await writers.end();
    await pool.query(
      "INSERT INTO operator_grants(user_id,permission) VALUES($1,'finance') ON CONFLICT DO NOTHING",
      [actors.operator!.userId],
    );
  }
});
