import { beforeAll, afterAll, test, expect } from "vitest";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { Pool } from "pg";
import sharp from "sharp";
import { generate } from "otplib";
import { migrate } from "../../src/server/db/migrate";
import { seed, seedIds, type SeedAccounts } from "../../src/server/db/seed";
import { requireDevelopmentDatabase } from "../../src/server/db/development";
import { coreConfig } from "../../src/server/config";
import { createAuth, type Auth } from "../../src/server/security/auth";
import { resolveActor, type Actor } from "../../src/server/security/authorization";
import {
  submitReport,
  attachReportImage,
  readTrustEvidence,
  claimTrustCase,
  trustQueue,
  readTrustCase,
  noteTrustCase,
  decideTrustCase,
  ownerTrust,
  appealTrustCase,
  reportInput,
} from "../../src/server/trust";
import { readDesign, saveDesign, publishDesign } from "../../src/server/shop-design";
import { readPublicShop, readPublicVariant } from "../../src/server/public-shop";
import { saveContacts, publicContact, submitGuestRequest } from "../../src/server/contacts";
import { PostgresSearch } from "../../src/server/discovery";
import {
  claimOperations,
  commandOperations,
  readOperations,
} from "../../src/server/administration";
import { LocalNotifications, LocalPrivateStorage } from "../../src/server/jobs/adapters";

const parentURL = process.env.DATABASE_URL!,
  parent = new Pool({ connectionString: parentURL }),
  name = `londos_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  auth: Auth,
  directory: string,
  accounts: SeedAccounts,
  image: Buffer,
  display: Buffer,
  baseline: unknown,
  defaultModerationGrants: number;
const actors: Record<string, Actor> = {};
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
    const r = await auth.handler(
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
    return r;
  }
}
async function signIn(key: string, account: { email: string; password: string }, mfa = false) {
  const client = new Client();
  expect((await client.request("sign-in/email", account)).status).toBe(200);
  if (mfa) {
    const r = await client.request("two-factor/enable", { password: account.password });
    expect(r.status).toBe(200);
    const secret = new URL((await r.json()).totpURI).searchParams.get("secret")!;
    expect(
      (
        await client.request("two-factor/verify-totp", {
          code: await generate({ secret }),
          trustDevice: false,
        })
      ).status,
    ).toBe(200);
  }
  actors[key] = await resolveActor(auth, client.headers());
}
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${name}`);
  const url = new URL(parentURL);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  pool = new Pool({ connectionString: url.toString(), max: 12 });
  directory = await mkdtemp(join(tmpdir(), "londos-p9-"));
  await migrate(pool, undefined, "011_local_administration_and_addresses.sql");
  auth = createAuth(pool, coreConfig(), true);
  accounts = await seed(pool, auth, directory);
  baseline = (
    await pool.query(
      "SELECT s.*,m.state AS moderation_state,m.version AS moderation_version FROM shops s JOIN shop_moderation m ON m.shop_id=s.id ORDER BY s.id",
    )
  ).rows;
  defaultModerationGrants = (
    await pool.query("SELECT count(*)::int AS n FROM operator_grants WHERE permission='moderation'")
  ).rows[0].n;
  await migrate(pool);
  await migrate(pool);
  for (const key of ["ownerA", "ownerB", "staff", "operator", "invitee"] as const)
    await signIn(key, accounts[key], key === "operator");
  const second = {
    email: `independent-${randomUUID()}@londos.example`,
    password: `Trust-${randomUUID()}`,
  };
  const created = await auth.api.signUpEmail({
    body: { ...second, name: "Fictional independent reviewer" },
  });
  await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [created.user.id]);
  await signIn("second", second, true);
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'moderation'),($1,'operations'),($2,'moderation'),($3,'moderation')",
    [actors.operator!.userId, actors.second!.userId, actors.invitee!.userId],
  );
  image = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#657954" } })
    .png()
    .toBuffer();
  display = await sharp(image).webp().toBuffer();
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
async function shop(merchantId = seedIds.merchantA, legacy = "clear") {
  const id = randomUUID(),
    slug = `trust-${id}`,
    department = randomUUID(),
    product = randomUUID();
  await pool.query(
    "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category) VALUES($1,$2,$3,'Fictional trust shoes',$4,'fashion')",
    [id, merchantId, seedIds.mallA, slug],
  );
  await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [id]);
  await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [id]);
  await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,$2)", [id, legacy]);
  await pool.query(
    "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) VALUES($1,$2,$3,'Trust shoes','trust-shoes',0)",
    [department, id, merchantId],
  );
  await pool.query(
    "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,availability) VALUES($1,$2,$3,$4,'product','Trust shoes','trust-shoes','UGX','available')",
    [product, id, merchantId, department],
  );
  return { id, slug, department, product };
}
function report(shopId: string) {
  return {
    key: randomUUID(),
    shopId,
    capability: randomBytes(32).toString("base64url"),
    category: "content" as const,
    message: "Private fictional concern about this shop.",
  };
}
async function newCase(shopId: string) {
  const input = report(shopId);
  await submitReport(pool, input);
  const id = (await pool.query("SELECT id FROM trust_cases WHERE report_id=$1", [input.key]))
    .rows[0].id as string;
  return { id, input };
}
async function claim(id: string, actor = actors.operator!) {
  return claimTrustCase(pool, actor, id, {
    reason: "Fictional trust investigation assignment",
    confirm: true,
  });
}
async function decision(
  id: string,
  action: "review" | "suspend" | "dismiss" | "reinstate",
  actor = actors.operator!,
  reason = "Private fictional investigation reason",
) {
  const view = await readTrustCase(pool, actor, id);
  return decideTrustCase(pool, actor, id, {
    action,
    version: view.case.version,
    moderationVersion: view.moderation.version,
    reason,
    publicReason: `Fictional merchant explanation for ${action}`,
    confirm: true,
  });
}
async function published() {
  const s = await shop(),
    asset = randomUUID();
  await saveContacts(pool, actors.ownerA!, s.id, {
    version: 0,
    phone: "+256700000001",
    whatsapp: "",
    website: "",
    fulfilment: "contact",
    paymentInstructions: "",
    deliveryInstructions: "",
    enquiriesEnabled: true,
    reason: "Fictional contact fixture",
  });
  const draft = await readDesign(pool, actors.ownerA!, s.id),
    saved = await saveDesign(pool, actors.ownerA!, s.id, {
      version: 0,
      summary: "Trust test fixture",
      specification: draft.specification,
    });
  await publishDesign(pool, actors.ownerA!, s.id, { ...saved, confirm: true });
  await pool.query(
    "INSERT INTO media_assets(id,shop_id,merchant_id,state,storage_key,alt) VALUES($1,$2,$3,'ready',$4,'Fictional trust image')",
    [asset, s.id, seedIds.merchantA, `trust:${asset}`],
  );
  await pool.query(
    "INSERT INTO media_blobs(asset_id,variant,bytes,width,height) VALUES($1,'display',$2,80,60)",
    [asset, display],
  );
  await pool.query(
    "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id) VALUES($1,$2,$3,$4)",
    [s.product, asset, s.id, seedIds.merchantA],
  );
  return { ...s, asset };
}
function guest() {
  return {
    key: randomUUID(),
    kind: "enquiry" as const,
    name: "Fictional visitor",
    replyTo: "+256700000003",
    message: "Fictional shoes enquiry",
    productId: null,
  };
}

test("011→012 upgrade preserves shop fields/moderation and does not seed moderation authority", async () => {
  expect(
    (
      await pool.query(
        "SELECT s.*,m.state AS moderation_state,m.version AS moderation_version FROM shops s JOIN shop_moderation m ON m.shop_id=s.id ORDER BY s.id",
      )
    ).rows,
  ).toEqual(baseline);
  expect(defaultModerationGrants).toBe(0);
  expect((await pool.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n).toBe(17);
});
test("anonymous retry races create one immutable report/case, with uniform unknown-target receipt", async () => {
  const s = await shop(),
    v = report(s.id);
  expect(await Promise.all([submitReport(pool, v), submitReport(pool, v)])).toEqual([
    { received: true },
    { received: true },
  ]);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM trust_cases WHERE report_id=$1", [v.key]))
      .rows[0].n,
  ).toBe(1);
  await expect(
    submitReport(pool, { ...v, message: "A changed private report under the same key." }),
  ).rejects.toMatchObject({ code: "request_key_conflict" });
  expect(await submitReport(pool, report(randomUUID()))).toEqual({ received: true });
  const stored = (await pool.query("SELECT * FROM trust_reports WHERE id=$1", [v.key])).rows[0];
  expect(JSON.stringify(stored)).not.toContain(v.capability);
  await expect(
    pool.query("UPDATE trust_reports SET message='Tampered private report' WHERE id=$1", [v.key]),
  ).rejects.toMatchObject({ code: "P0001" });
  await expect(pool.query("DELETE FROM trust_reports WHERE id=$1", [v.key])).rejects.toMatchObject({
    code: "P0001",
  });
});
test("report inputs reject forged fields, unsupported categories and unbounded private text", async () => {
  const v = report(seedIds.shopA);
  for (const bad of [
    { ...v, actorId: actors.operator!.userId },
    { ...v, category: "verified" },
    { ...v, message: "x".repeat(2001) },
    { ...v, capability: "short" },
  ])
    expect(reportInput.safeParse(bad).success).toBe(false);
});
test("anonymous private attachment is normalized, capability-bound, immutable and frozen after claim", async () => {
  const s = await shop(),
    c = await newCase(s.id);
  await expect(
    attachReportImage(pool, c.input.key, randomBytes(32).toString("base64url"), image, "image/png"),
  ).rejects.toMatchObject({ status: 404 });
  await attachReportImage(pool, c.input.key, c.input.capability, image, "image/png");
  await attachReportImage(pool, c.input.key, c.input.capability, image, "image/png");
  const stored = (
    await pool.query("SELECT bytes FROM trust_evidence WHERE report_id=$1", [c.input.key])
  ).rows[0].bytes as Buffer;
  expect((await sharp(stored).metadata()).format).toBe("webp");
  expect((await sharp(stored).metadata()).exif).toBeUndefined();
  await expect(readTrustEvidence(pool, actors.ownerA!, c.id)).rejects.toMatchObject({
    status: 403,
  });
  await expect(readTrustEvidence(pool, actors.operator!, c.id)).rejects.toMatchObject({
    status: 404,
  });
  await claim(c.id);
  expect(await readTrustEvidence(pool, actors.operator!, c.id)).toEqual(stored);
  await expect(
    attachReportImage(pool, c.input.key, c.input.capability, image, "image/png"),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    pool.query("DELETE FROM trust_evidence WHERE report_id=$1", [c.input.key]),
  ).rejects.toMatchObject({ code: "P0001" });
});
test("unsafe report attachments and expired capabilities fail without storing evidence", async () => {
  const c = await newCase((await shop()).id);
  for (const [bytes, type] of [
    [Buffer.from("<svg></svg>"), "image/svg+xml"],
    [image, "image/jpeg"],
    [Buffer.from("not an image"), "image/png"],
  ] as const)
    await expect(
      attachReportImage(pool, c.input.key, c.input.capability, bytes, type),
    ).rejects.toMatchObject({ code: "invalid_evidence_image" });
  await expect(
    attachReportImage(pool, c.input.key, c.input.capability, Buffer.alloc(2097153), "image/png"),
  ).rejects.toMatchObject({ code: "evidence_too_large" });
  const expired = report((await shop()).id),
    caseId = randomUUID();
  await pool.query(
    "INSERT INTO trust_reports(id,shop_id,merchant_id,category,message,capability_hash,fingerprint,attachment_until) VALUES($1,$2,$3,'other',$4,$5,$5,now()-interval '1 second')",
    [
      expired.key,
      expired.shopId,
      seedIds.merchantA,
      expired.message,
      createHash("sha256").update(expired.capability).digest("hex"),
    ],
  );
  await pool.query(
    "INSERT INTO trust_cases(id,report_id,shop_id,merchant_id) VALUES($1,$2,$3,$4)",
    [caseId, expired.key, expired.shopId, seedIds.merchantA],
  );
  await expect(
    attachReportImage(pool, expired.key, expired.capability, image, "image/png"),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (await pool.query("SELECT 1 FROM trust_evidence WHERE report_id=$1", [c.input.key])).rowCount,
  ).toBe(0);
});
test("moderation scope is distinct, native MFA is mandatory, and self-review is denied", async () => {
  const s = await shop(),
    c = await newCase(s.id);
  await expect(claim(c.id, actors.invitee!)).rejects.toMatchObject({ code: "mfa_required" });
  await expect(readTrustCase(pool, actors.operator!, c.id)).rejects.toMatchObject({ status: 404 });
  await claimOperations(pool, actors.operator!, s.id, {
    reason: "Separate operations scope fixture",
    confirm: true,
  });
  await expect(readTrustCase(pool, actors.operator!, c.id)).rejects.toMatchObject({ status: 404 });
  await pool.query(
    "INSERT INTO memberships(merchant_id,user_id,role,permissions) VALUES($1,$2,'staff','{}')",
    [seedIds.merchantA, actors.operator!.userId],
  );
  try {
    await expect(claim(c.id)).rejects.toMatchObject({ code: "conflict_of_interest" });
  } finally {
    await pool.query("DELETE FROM memberships WHERE merchant_id=$1 AND user_id=$2", [
      seedIds.merchantA,
      actors.operator!.userId,
    ]);
  }
  await claim(c.id);
  await expect(readTrustCase(pool, actors.second!, c.id)).rejects.toMatchObject({ status: 404 });
});
test("queue omits report text and capability; owner view redacts private investigation and foreign/staff access", async () => {
  const s = await shop(),
    c = await newCase(s.id);
  await claim(c.id);
  await decision(c.id, "review", actors.operator!, "PRIVATE-NOTE-SECRET fictional investigation");
  const queue = JSON.stringify(await trustQueue(pool, actors.operator!));
  expect(queue).not.toContain(c.input.message);
  expect(queue).not.toContain(c.input.capability);
  const view = await ownerTrust(pool, actors.ownerA!, s.id),
    serialized = JSON.stringify(view);
  expect(serialized).toContain("merchant explanation");
  expect(serialized).not.toContain(c.input.message);
  expect(serialized).not.toContain("PRIVATE-NOTE-SECRET");
  expect(serialized).not.toContain("report_id");
  await expect(ownerTrust(pool, actors.ownerB!, s.id)).rejects.toMatchObject({ status: 404 });
  await expect(ownerTrust(pool, actors.staff!, s.id)).rejects.toMatchObject({ status: 404 });
});
test("case and moderation versions fence racing decisions; append-only history and tenant identity remain intact", async () => {
  const s = await shop(),
    c = await newCase(s.id);
  await claim(c.id);
  const view = await readTrustCase(pool, actors.operator!, c.id),
    v = {
      action: "review" as const,
      version: view.case.version,
      moderationVersion: view.moderation.version,
      reason: "Fictional review decision",
      publicReason: "Fictional review explanation",
      confirm: true as const,
    };
  const outcomes = await Promise.allSettled([
    decideTrustCase(pool, actors.operator!, c.id, v),
    decideTrustCase(pool, actors.operator!, c.id, v),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "stale_version" },
  });
  await expect(
    pool.query("UPDATE trust_cases SET shop_id=$2 WHERE id=$1", [c.id, seedIds.shopB]),
  ).rejects.toMatchObject({ code: "P0001" });
  await expect(
    pool.query("UPDATE trust_events SET reason='tampered' WHERE case_id=$1", [c.id]),
  ).rejects.toMatchObject({ code: "P0001" });
  await expect(
    pool.query("UPDATE shop_trust_control SET baseline='clear' WHERE shop_id=$1", [s.id]),
  ).resolves.toBeDefined();
  await expect(
    pool.query("UPDATE shop_trust_control SET baseline='suspended' WHERE shop_id=$1", [s.id]),
  ).rejects.toMatchObject({ code: "P0001" });
});
test("scope revoked during a proven merchant-lock wait prevents notes without a partial effect", async () => {
  const s = await shop(),
    c = await newCase(s.id);
  await claim(c.id);
  const view = await readTrustCase(pool, actors.operator!, c.id),
    locker = await pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [seedIds.merchantA]);
    pending = noteTrustCase(pool, actors.operator!, c.id, {
      version: view.case.version,
      priority: 2,
      reason: "This waiting note must not commit",
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
    await pool.query("DELETE FROM operator_trust_scopes WHERE user_id=$1 AND case_id=$2", [
      actors.operator!.userId,
      c.id,
    ]);
    await locker.query("COMMIT");
    expect(await pending).toMatchObject({ status: 404 });
    expect((await pool.query("SELECT 1 FROM trust_events WHERE case_id=$1", [c.id])).rowCount).toBe(
      0,
    );
    expect(
      (await pool.query("SELECT version FROM trust_cases WHERE id=$1", [c.id])).rows[0].version,
    ).toBe(view.case.version);
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
    if (pending) await pending;
  }
});
test("fresh MFA revoked during a merchant-lock wait prevents a decision and private evidence reads", async () => {
  const s = await shop(),
    c = await newCase(s.id);
  await attachReportImage(pool, c.input.key, c.input.capability, image, "image/png");
  await claim(c.id);
  const view = await readTrustCase(pool, actors.operator!, c.id),
    locker = await pool.connect(),
    proof = (
      await pool.query("SELECT verified_at FROM mfa_proofs WHERE session_id=$1", [
        actors.operator!.sessionId,
      ])
    ).rows[0].verified_at;
  let pending: Promise<unknown> | undefined;
  try {
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [seedIds.merchantA]);
    pending = decideTrustCase(pool, actors.operator!, c.id, {
      action: "suspend",
      version: view.case.version,
      moderationVersion: view.moderation.version,
      reason: "Waiting decision cannot use stale MFA",
      publicReason: "Fictional waiting decision",
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
    await pool.query(
      "UPDATE mfa_proofs SET verified_at=now()-interval '6 minutes' WHERE session_id=$1",
      [actors.operator!.sessionId],
    );
    await locker.query("COMMIT");
    expect(await pending).toMatchObject({ code: "fresh_authentication_required" });
    await expect(readTrustEvidence(pool, actors.operator!, c.id)).rejects.toMatchObject({
      code: "fresh_authentication_required",
    });
    expect(
      (await pool.query("SELECT state FROM shop_moderation WHERE shop_id=$1", [s.id])).rows[0]
        .state,
    ).toBe("clear");
    expect((await pool.query("SELECT 1 FROM trust_events WHERE case_id=$1", [c.id])).rowCount).toBe(
      0,
    );
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
    if (pending) await pending;
    await pool.query("UPDATE mfa_proofs SET verified_at=$2 WHERE session_id=$1", [
      actors.operator!.sessionId,
      proof,
    ]);
  }
});
test("canonical suspension blocks shops, aliases, search, contacts, media, enquiry intake and republication", async () => {
  const s = await published(),
    c = await newCase(s.id);
  expect((await readPublicShop(pool, s.id)).shop.id).toBe(s.id);
  await submitGuestRequest(pool, s.id, guest());
  await claim(c.id);
  await decision(c.id, "suspend");
  for (const key of [s.id, s.slug])
    await expect(readPublicShop(pool, key)).rejects.toMatchObject({ status: 404 });
  expect(
    (await new PostgresSearch(pool).search({ query: "shoes", shopId: s.id })).results,
  ).toHaveLength(0);
  await expect(publicContact(pool, s.id)).rejects.toMatchObject({ status: 404 });
  await expect(readPublicVariant(pool, s.id, s.asset, "display")).rejects.toMatchObject({
    status: 404,
  });
  await expect(submitGuestRequest(pool, s.id, guest())).rejects.toMatchObject({ status: 404 });
  const design = await readDesign(pool, actors.ownerA!, s.id);
  await expect(
    publishDesign(pool, actors.ownerA!, s.id, {
      version: design.version,
      revision: design.publishedRevision!,
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "shop_not_eligible" });
});
test("owner appeal is versioned and pending until a different scoped reviewer reinstates", async () => {
  const s = await published(),
    c = await newCase(s.id);
  await claim(c.id);
  await decision(c.id, "suspend");
  let view = await readTrustCase(pool, actors.operator!, c.id);
  await expect(
    appealTrustCase(pool, actors.ownerB!, s.id, c.id, {
      version: view.case.version,
      reason: "Foreign merchant appeal must be denied",
      confirm: true,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await appealTrustCase(pool, actors.ownerA!, s.id, c.id, {
    version: view.case.version,
    reason: "Fictional owner requests independent review",
    confirm: true,
  });
  view = await readTrustCase(pool, actors.operator!, c.id);
  expect(view.appealPending).toBe(true);
  await expect(decision(c.id, "reinstate")).rejects.toMatchObject({
    code: "independent_review_required",
  });
  await expect(
    appealTrustCase(pool, actors.ownerA!, s.id, c.id, {
      version: view.case.version,
      reason: "A second pending appeal is not permitted",
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "appeal_already_pending" });
  await claim(c.id, actors.second!);
  await decision(c.id, "reinstate", actors.second!);
  expect((await readPublicShop(pool, s.id)).shop.id).toBe(s.id);
  expect((await readTrustCase(pool, actors.second!, c.id)).appealPending).toBe(false);
});
test("clearing one of multiple trust cases cannot lift another restriction or legacy baseline", async () => {
  const s = await shop(),
    one = await newCase(s.id),
    two = await newCase(s.id);
  await claim(one.id);
  await claim(two.id);
  await decision(one.id, "suspend");
  await decision(two.id, "review");
  await claim(one.id, actors.second!);
  await decision(one.id, "reinstate", actors.second!);
  expect(
    (await pool.query("SELECT state FROM shop_moderation WHERE shop_id=$1", [s.id])).rows[0].state,
  ).toBe("under_review");
  await claim(two.id, actors.second!);
  await decision(two.id, "dismiss", actors.second!);
  expect(
    (await pool.query("SELECT state FROM shop_moderation WHERE shop_id=$1", [s.id])).rows[0].state,
  ).toBe("clear");
  const legacy = await shop(seedIds.merchantA, "suspended"),
    c = await newCase(legacy.id);
  await claim(c.id);
  await decision(c.id, "review");
  await claim(c.id, actors.second!);
  await decision(c.id, "reinstate", actors.second!);
  expect(
    (await pool.query("SELECT state FROM shop_moderation WHERE shop_id=$1", [legacy.id])).rows[0]
      .state,
  ).toBe("suspended");
});
test("external moderation changes fail closed, and stale moderation version cannot decide another case", async () => {
  const s = await shop(),
    c = await newCase(s.id);
  await claim(c.id);
  await decision(c.id, "review");
  await claim(c.id, actors.second!);
  await pool.query(
    "UPDATE shop_moderation SET state='suspended',version=version+1 WHERE shop_id=$1",
    [s.id],
  );
  await expect(decision(c.id, "reinstate", actors.second!)).rejects.toMatchObject({
    code: "moderation_changed_externally",
  });
  const view = await readTrustCase(pool, actors.second!, c.id);
  await expect(
    decideTrustCase(pool, actors.second!, c.id, {
      action: "reinstate",
      version: view.case.version,
      moderationVersion: view.moderation.version - 1,
      reason: "Stale canonical moderation is not authority",
      publicReason: "Fictional stale decision",
      confirm: true,
    }),
  ).rejects.toMatchObject({ code: "stale_version" });
});
test("reinstatement preserves operational pause, tenancy and financial records; paused enquiry intake fails", async () => {
  const s = await published(),
    c = await newCase(s.id);
  await claimOperations(pool, actors.operator!, s.id, {
    reason: "Independent administrative hold",
    confirm: true,
  });
  const before = (await pool.query("SELECT * FROM tenancies WHERE shop_id=$1", [s.id])).rows[0],
    rent = (await pool.query("SELECT * FROM rent_events ORDER BY id")).rows;
  await commandOperations(pool, actors.operator!, s.id, {
    action: "pause",
    version: (await readOperations(pool, actors.operator!, s.id)).shop.version,
    reason: "Pause while trust investigation proceeds",
    confirm: true,
  });
  await expect(submitGuestRequest(pool, s.id, guest())).rejects.toMatchObject({ status: 404 });
  await claim(c.id);
  await decision(c.id, "suspend");
  await claim(c.id, actors.second!);
  await decision(c.id, "reinstate", actors.second!);
  await expect(readPublicShop(pool, s.id)).rejects.toMatchObject({ status: 404 });
  expect((await readOperations(pool, actors.operator!, s.id)).shop.paused).toBe(true);
  expect((await pool.query("SELECT * FROM tenancies WHERE shop_id=$1", [s.id])).rows[0]).toEqual(
    before,
  );
  expect((await pool.query("SELECT * FROM rent_events ORDER BY id")).rows).toEqual(rent);
});
test("private notes set bounded queue priority without changing moderation and local notices exclude report text", async () => {
  const s = await shop(),
    c = await newCase(s.id);
  await claim(c.id);
  const view = await readTrustCase(pool, actors.operator!, c.id);
  await noteTrustCase(pool, actors.operator!, c.id, {
    version: view.case.version,
    priority: 2,
    reason: "Private urgent investigation note",
    confirm: true,
  });
  expect((await readTrustCase(pool, actors.operator!, c.id)).moderation.state).toBe("clear");
  expect(
    (await trustQueue(pool, actors.operator!)).some((row) => row.id === c.id && row.priority === 2),
  ).toBe(true);
  await decision(c.id, "suspend");
  const jobs = (
    await pool.query(
      "SELECT id,payload FROM jobs WHERE payload->>'template'='trust-status' AND payload->>'caseId'=$1",
      [c.id],
    )
  ).rows;
  expect(jobs.length).toBeGreaterThan(0);
  expect(JSON.stringify(jobs)).not.toContain(c.input.message);
  expect(JSON.stringify(jobs)).not.toContain("Private urgent");
  await new LocalNotifications(new LocalPrivateStorage(join(directory, "notifications"))).deliver(
    jobs[0].id,
    jobs[0].payload,
    AbortSignal.timeout(2000),
  );
});
