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
  type Invoice,
} from "../../src/server/rent";
import { schedule } from "../../src/server/jobs/scheduler";
import { acknowledge } from "../../src/server/jobs/queue";
import { handleRentTick } from "../../src/server/jobs/rent";
import { readPublicShop } from "../../src/server/public-shop";
import { readDesign, saveDesign, publishDesign } from "../../src/server/shop-design";

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
