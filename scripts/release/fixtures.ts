// Fictional data in an owned, disposable PostgreSQL cluster only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import sharp from "sharp";
import { generate } from "otplib";
import { coreConfig } from "../../src/server/config";
import { seed, seedIds } from "../../src/server/db/seed";
import { createAuth, type Auth } from "../../src/server/security/auth";
import { resolveActor } from "../../src/server/security/authorization";
import {
  createApplication,
  readApplication,
  saveEvidence,
  submitApplication,
  claimApplication,
  reviewApplication,
} from "../../src/server/applications";
import { developmentPolicyId } from "../../src/server/lifecycle-common";
import {
  applicationInvoices,
  readInvoice,
  reconcileInvoice,
  reverseCredit,
  type Invoice,
} from "../../src/server/rent";
import { readDesign, saveDesign, publishDesign } from "../../src/server/shop-design";
import { startUpload, finishUpload, processMedia } from "../../src/server/media";
import { saveProduct, readCatalogue } from "../../src/server/catalogue";
import {
  ownerPrivacyCommand,
  claimPrivacy,
  commandPrivacy,
  handlePrivacyErasure,
} from "../../src/server/privacy";
import { acknowledge, type Job } from "../../src/server/jobs/queue";
import { enqueue } from "../../src/server/jobs/enqueue";
import { LocalNotifications, LocalPrivateStorage } from "../../src/server/jobs/adapters";

export class NativeClient {
  cookies = new Map<string, string>();
  constructor(readonly auth: Auth) {}
  headers() {
    return new Headers({
      origin: coreConfig().baseURL,
      "content-type": "application/json",
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    });
  }
  async post(path: string, body: unknown) {
    const r = await this.auth.handler(
      new Request(`${coreConfig().baseURL}/api/auth/${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      }),
    );
    for (const c of r.headers.getSetCookie()) {
      const first = c.split(";")[0]!,
        i = first.indexOf("=");
      this.cookies.set(first.slice(0, i), first.slice(i + 1));
    }
    assert.equal(r.status, 200, `Native authentication ${path}`);
    return r;
  }
}
async function lease(pool: Pool, id: string) {
  return (
    await pool.query(
      "UPDATE jobs SET state='running',attempts=attempts+1,lease_token=$2,lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$1 AND state='pending' RETURNING *",
      [id, randomUUID()],
    )
  ).rows[0] as Job;
}
export async function recoveryFixtures(pool: Pool, directory: string, notifications: string) {
  const auth = createAuth(pool, coreConfig(), true),
    accounts = await seed(pool, auth, directory);
  const owner = new NativeClient(auth),
    foreign = new NativeClient(auth),
    operator = new NativeClient(auth);
  await owner.post("sign-in/email", accounts.ownerA);
  await foreign.post("sign-in/email", accounts.ownerB);
  await operator.post("sign-in/email", accounts.operator);
  const factor = await (
    await operator.post("two-factor/enable", { password: accounts.operator.password })
  ).json();
  const secret = new URL(factor.totpURI).searchParams.get("secret")!;
  await operator.post("two-factor/verify-totp", {
    code: await generate({ secret }),
    trustDevice: false,
  });
  const ownerActor = await resolveActor(auth, owner.headers()),
    operatorActor = await resolveActor(auth, operator.headers());
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'finance'),($1,'privacy') ON CONFLICT DO NOTHING",
    [operatorActor.userId],
  );
  const png = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#748352" } })
    .png()
    .toBuffer();
  const application = await createApplication(pool, ownerActor, {
    key: randomUUID(),
    merchantId: seedIds.merchantA,
    businessName: "Fictional recovery shop",
    category: "fashion",
    location: "Kampala sample",
    description: "Fictional recovery rehearsal only",
    phone: "+256700000001",
  });
  let a = (await readApplication(pool, ownerActor, application.id)).application;
  await saveEvidence(pool, ownerActor, a.id, 1, a.version, png, "image/png");
  a = (await readApplication(pool, ownerActor, a.id)).application;
  await submitApplication(pool, ownerActor, a.id, { version: a.version, confirm: true });
  await claimApplication(pool, operatorActor, a.id, "review");
  a = (await readApplication(pool, operatorActor, a.id, "review")).application;
  await reviewApplication(pool, operatorActor, a.id, {
    version: a.version,
    decision: "approved",
    reason: "Fictional verified evidence",
    policyId: developmentPolicyId,
    confirm: true,
  });
  await claimApplication(pool, operatorActor, a.id, "finance");
  let invoice = (await applicationInvoices(pool, operatorActor, a.id, "finance"))[0]!;
  const credit = (i: Invoice) => ({
    key: randomUUID(),
    version: i.version,
    kind: "payment" as const,
    amountMinor: "5000",
    currency: "UGX" as const,
    invoiceReference: i.reference,
    reference: `TEST-${randomUUID().toUpperCase()}`,
    reason: "Fictional manual bank reconciliation",
    confirm: true as const,
  });
  const initial = await reconcileInvoice(pool, operatorActor, invoice.id, credit(invoice));
  invoice = (await readInvoice(pool, operatorActor, invoice.id, "finance")).invoice;
  await reverseCredit(pool, operatorActor, invoice.id, {
    key: randomUUID(),
    version: invoice.version,
    eventId: initial.eventId,
    reason: "Fictional reversal before recovery",
    confirm: true,
  });
  invoice = (await readInvoice(pool, operatorActor, invoice.id, "finance")).invoice;
  const repayment = credit(invoice);
  await reconcileInvoice(pool, operatorActor, invoice.id, repayment);
  const shop = seedIds.shopA,
    design = await readDesign(pool, ownerActor, shop);
  const saved = await saveDesign(pool, ownerActor, shop, {
    version: design.version,
    summary: "Recovery fixture published layout",
    specification: { ...design.specification, theme: "plum" },
  });
  await publishDesign(pool, ownerActor, shop, { ...saved, confirm: true });
  const media = await startUpload(pool, ownerActor, shop, {
    contentType: "image/png",
    bytes: png.length,
    alt: "Fictional recovery image",
  });
  await finishUpload(pool, ownerActor, shop, media.id, png, "image/png");
  const mediaJob = (
    await pool.query("SELECT id FROM jobs WHERE kind='media.process' AND payload->>'assetId'=$1", [
      media.id,
    ])
  ).rows[0];
  const job = await lease(pool, mediaJob.id);
  await processMedia(pool, job, new AbortController().signal);
  assert(await acknowledge(pool, job));
  const catalogue = await readCatalogue(pool, ownerActor, shop),
    p = catalogue.products[0]!;
  await saveProduct(pool, ownerActor, shop, p.id, {
    departmentId: p.department_id,
    kind: p.kind,
    name: p.name,
    slug: p.slug,
    description: p.description,
    currency: p.currency,
    priceMinor: p.price_minor,
    availability: p.availability,
    position: p.position,
    mediaId: media.id,
    version: p.version,
  });
  await pool.query(
    "INSERT INTO pilot_metrics(day,shop_id,merchant_id,event,source,detail,count) VALUES(current_date,$1,$2,'shop_viewed','direct','none',5)",
    [shop, seedIds.merchantA],
  );
  const payload = {
    template: "contact-changed",
    to: accounts.ownerA.email,
    shopId: shop,
    version: 1,
  };
  const pending = await enqueue(pool, {
    kind: "notification.local",
    key: `recovery:${randomUUID()}`,
    merchantId: seedIds.merchantA,
    shopId: shop,
    payload,
  });
  assert(pending);
  // Simulate delivery committed but acknowledgement lost. The external sink is
  // part of the encrypted recovery set; its idempotency receipt must survive.
  await new LocalNotifications(new LocalPrivateStorage(notifications)).deliver(
    pending,
    payload,
    new AbortController().signal,
  );
  return {
    accounts,
    owner,
    foreign,
    operator,
    ownerActor,
    operatorActor,
    invoiceId: invoice.id,
    repayment,
    mediaId: media.id,
    pending,
    payload,
    shop,
    auth,
  };
}
export async function eraseFixture(pool: Pool, f: Awaited<ReturnType<typeof recoveryFixtures>>) {
  const id = (
    await ownerPrivacyCommand(pool, f.ownerActor, seedIds.merchantA, {
      action: "request",
      key: randomUUID(),
      kind: "analytics",
      target: f.shop,
      reason: "Fictional owner erasure request",
      confirm: true,
    })
  ).id;
  const version = async () =>
    (await pool.query("SELECT version FROM privacy_requests WHERE id=$1", [id])).rows[0].version;
  await claimPrivacy(pool, f.operatorActor, id, {
    version: await version(),
    reason: "Qualified fictional privacy review",
    confirm: true,
  });
  await commandPrivacy(pool, f.operatorActor, id, {
    action: "approve",
    version: await version(),
    reason: "Fictional approved analytics erasure",
    explanation: "Recovery must preserve this completed erasure",
    confirm: true,
  });
  const queued = (
    await pool.query("SELECT id FROM jobs WHERE dedupe_key=$1", [
      `privacy:${id}:${await version()}`,
    ])
  ).rows[0];
  const job = await lease(pool, queued.id);
  await handlePrivacyErasure(pool, job, new AbortController().signal);
  assert(await acknowledge(pool, job));
  assert.equal(
    (await pool.query("SELECT state FROM privacy_requests WHERE id=$1", [id])).rows[0].state,
    "completed",
  );
  return id;
}
