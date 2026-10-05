import { beforeAll, afterAll, beforeEach, test, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
  readCatalogue,
  saveDepartment,
  saveProduct,
  productInput,
} from "../../src/server/catalogue";
import {
  saveContacts,
  readContacts,
  publicContact,
  submitGuestRequest,
  listGuestRequests,
  updateGuestRequest,
  contactInput,
} from "../../src/server/contacts";
import {
  startUpload,
  finishUpload,
  uploadAuthority,
  readVariant,
  deleteMedia,
  retryMedia,
  listMedia,
  processMedia,
  cleanupMedia,
  imageVariants,
  mediaReservation,
} from "../../src/server/media";
import { claim, acknowledge, fail, type Job } from "../../src/server/jobs/queue";
import { LocalNotifications, LocalPrivateStorage } from "../../src/server/jobs/adapters";

const parent = new Pool({ connectionString: process.env.DATABASE_URL }),
  databaseName = `londos_test_${randomUUID().replaceAll("-", "")}`;
const parentDatabaseUrl = process.env.DATABASE_URL;
let pool: Pool,
  accounts: SeedAccounts,
  auth: Auth,
  directory: string,
  shop: string,
  department: string;
let actors: Record<string, Actor>, clients: Record<string, Client>;
let previousProduct: unknown;
class Client {
  cookies = new Map<string, string>();
  constructor(readonly account: SeedAccounts[keyof SeedAccounts]) {}
  headers() {
    return new Headers({
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      origin: coreConfig().baseURL,
      "content-type": "application/json",
    });
  }
  async request(path: string, body: Record<string, unknown>) {
    const response = await auth.handler(
      new Request(`${coreConfig().baseURL}/api/auth/${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      }),
    );
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(";")[0]!,
        i = first.indexOf("=");
      this.cookies.set(first.slice(0, i), first.slice(i + 1));
    }
    return response;
  }
  async login() {
    expect(
      (
        await this.request("sign-in/email", {
          email: this.account.email,
          password: this.account.password,
        })
      ).status,
    ).toBe(200);
    return resolveActor(auth, this.headers());
  }
}
beforeAll(async () => {
  await requireDevelopmentDatabase(parent);
  await parent.query(`CREATE DATABASE ${databaseName}`);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${databaseName}`;
  process.env.DATABASE_URL = url.toString();
  pool = new Pool({ connectionString: url.toString(), max: 12 });
  directory = await mkdtemp(join(tmpdir(), "londos-p5-"));
  await migrate(pool, undefined, "007_r1_security_contracts.sql");
  auth = createAuth(pool, coreConfig(), true);
  accounts = await seed(pool, auth, directory);
  const foreignDepartment = randomUUID(),
    foreignProduct = randomUUID();
  await pool.query(
    "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) VALUES($1,$2,$3,'Foreign fixture','foreign',0)",
    [foreignDepartment, seedIds.shopB, seedIds.merchantB],
  );
  await pool.query(
    "INSERT INTO products(id,shop_id,merchant_id,department_id,kind,name,slug,currency,availability) VALUES($1,$2,$3,$4,'product','Foreign fixture','foreign','UGX','available')",
    [foreignProduct, seedIds.shopB, seedIds.merchantB, foreignDepartment],
  );
  previousProduct = (
    await pool.query("SELECT id,price_minor,name,version FROM products ORDER BY id")
  ).rows;
  await migrate(pool);
  await migrate(pool);
  actors = {};
  clients = {};
  for (const name of ["ownerA", "ownerB", "staff", "operator"] as const) {
    clients[name] = new Client(accounts[name]);
    actors[name] = await clients[name]!.login();
  }
});
afterAll(async () => {
  await pool?.end();
  // pg's pool can finish before the server observes the socket close. Do not
  // force-drop into an idle error while those closing connections still exist.
  const deadline = Date.now() + 2000;
  while (
    (await parent.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1", [databaseName])).rowCount
  ) {
    if (Date.now() > deadline) throw new Error("P5 test connections did not close");
    await setTimeout(10);
  }
  await parent.query(`DROP DATABASE IF EXISTS ${databaseName}`);
  await parent.end();
  process.env.DATABASE_URL = parentDatabaseUrl;
  await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  shop = randomUUID();
  department = randomUUID();
  await pool.query(
    "INSERT INTO shops(id,merchant_id,mall_id,name,slug) VALUES($1,$2,$3,'P5 fictional shop',$4)",
    [shop, seedIds.merchantA, seedIds.mallA, `p5-${shop}`],
  );
  await pool.query(
    "INSERT INTO departments(id,shop_id,merchant_id,name,slug,position) VALUES($1,$2,$3,'New arrivals','new-arrivals',0)",
    [department, shop, seedIds.merchantA],
  );
  await pool.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'active')", [shop]);
  await pool.query("INSERT INTO tenancies(shop_id,state) VALUES($1,'active')", [shop]);
  await pool.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [shop]);
});
const product = () => ({
  departmentId: department,
  kind: "product" as const,
  name: "Fictional shoes",
  slug: "shoes",
  description: "Sample catalogue",
  currency: "UGX" as const,
  priceMinor: "99999999999999999999",
  availability: "available" as const,
  position: 1,
  mediaId: null,
  version: 0,
});
const contacts = () => ({
  version: 0,
  phone: "+256700000001",
  whatsapp: "+256700000001",
  website: "https://example.com",
  fulfilment: "pickup" as const,
  paymentInstructions: "Pay after merchant confirmation",
  deliveryInstructions: "Agree pickup first",
  enquiriesEnabled: true,
  reason: "Fictional test setup",
});
const guest = () => ({
  key: randomUUID(),
  kind: "enquiry" as const,
  name: "Sample customer",
  replyTo: "sample@example.com",
  message: "Do you have a sample size?",
  productId: null,
});
async function image() {
  return sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#aa5533" } })
    .png()
    .toBuffer();
}
async function upload(bytes: Buffer, type = "image/png", id?: string) {
  const asset = id
    ? { id }
    : await startUpload(pool, actors.ownerA!, shop, {
        contentType: type as "image/png",
        bytes: bytes.length,
        alt: "Sample product image",
      });
  await finishUpload(pool, actors.ownerA!, shop, asset.id, bytes, type);
  return asset.id as string;
}
async function mediaJob(id: string) {
  await pool.query(
    "UPDATE jobs SET state='done',lease_token=NULL,lease_until=NULL WHERE state IN ('pending','running') AND NOT (kind='media.process' AND payload->>'assetId'=$1)",
    [id],
  );
  const job = await claim(pool);
  expect(job?.payload.assetId).toBe(id);
  return job!;
}

test("007 to 008 and repeat seed preserve existing catalogue and identity data", async () => {
  expect(
    (await pool.query("SELECT id,price_minor,name,version FROM products ORDER BY id")).rows,
  ).toEqual(previousProduct);
  const before = await pool.query('SELECT id,email FROM "user" ORDER BY id');
  await seed(pool, auth, directory);
  expect((await pool.query('SELECT id,email FROM "user" ORDER BY id')).rows).toEqual(before.rows);
  expect(
    (await pool.query("SELECT count(*)::int AS count FROM schema_migrations")).rows[0].count,
  ).toBe(8);
});
test("catalogue checks tenant, nested references, staff action and explicit shop scope", async () => {
  await expect(readCatalogue(pool, actors.ownerB!, shop)).rejects.toMatchObject({ status: 404 });
  await expect(readCatalogue(pool, actors.staff!, shop)).rejects.toMatchObject({ status: 404 });
  await pool.query(
    "INSERT INTO staff_shop_grants(merchant_id,user_id,shop_id,permissions) VALUES($1,$2,$3,ARRAY['catalogue'])",
    [seedIds.merchantA, accounts.staff.id, shop],
  );
  await expect(saveProduct(pool, actors.staff!, shop, null, product())).resolves.toMatchObject({
    version: 1,
  });
  const foreign = (await pool.query("SELECT id FROM departments WHERE shop_id=$1", [seedIds.shopB]))
    .rows[0].id;
  await expect(
    saveProduct(pool, actors.ownerA!, shop, null, {
      ...product(),
      slug: "foreign",
      departmentId: foreign,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(saveProduct(pool, actors.ownerB!, shop, null, product())).rejects.toMatchObject({
    status: 404,
  });
});
test("concurrent edits commit one version and one audit; money and slugs reject unsafe input", async () => {
  const created = await saveProduct(pool, actors.ownerA!, shop, null, product());
  const input = { ...product(), version: 1 };
  const attempts = await Promise.allSettled([
    saveProduct(pool, actors.ownerA!, shop, created.id, { ...input, name: "First" }),
    saveProduct(pool, actors.ownerA!, shop, created.id, { ...input, name: "Second" }),
  ]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(attempts.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM audit_events WHERE resource_id=$1 AND action='catalogue.product.saved'",
        [created.id],
      )
    ).rows[0].count,
  ).toBe(2);
  for (const value of ["100.5", "-1", "1e3", "NaN", "0001"])
    expect(productInput.safeParse({ ...product(), priceMinor: value }).success).toBe(false);
  await expect(saveProduct(pool, actors.ownerA!, shop, null, product())).rejects.toMatchObject({
    status: 409,
    code: "slug_in_use",
  });
});
test("catalogue revocation committed during a merchant lock wait denies the pending write", async () => {
  await pool.query(
    "INSERT INTO staff_shop_grants(merchant_id,user_id,shop_id,permissions) VALUES($1,$2,$3,ARRAY['catalogue'])",
    [seedIds.merchantA, accounts.staff.id, shop],
  );
  const blocker = await pool.connect();
  let attempt: Promise<PromiseSettledResult<unknown>> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [seedIds.merchantA]);
    attempt = saveProduct(pool, actors.staff!, shop, null, product()).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason) => ({ status: "rejected" as const, reason }),
    );
    const deadline = Date.now() + 2000;
    while (
      !(
        await pool.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM merchants%'",
        )
      ).rowCount
    ) {
      if (Date.now() > deadline) throw new Error("Expected merchant lock wait");
      await setTimeout(10);
    }
    await blocker.query(
      "UPDATE memberships SET status='revoked' WHERE merchant_id=$1 AND user_id=$2",
      [seedIds.merchantA, accounts.staff.id],
    );
    await blocker.query("COMMIT");
    expect(await attempt).toMatchObject({ status: "rejected", reason: { status: 404 } });
    expect((await pool.query("SELECT 1 FROM products WHERE shop_id=$1", [shop])).rowCount).toBe(0);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await attempt;
    await pool.query("UPDATE memberships SET status='active' WHERE merchant_id=$1 AND user_id=$2", [
      seedIds.merchantA,
      accounts.staff.id,
    ]);
  }
});
test("archive and ordering keep identities and reject a department with active products", async () => {
  const p = await saveProduct(pool, actors.ownerA!, shop, null, product());
  await expect(
    saveDepartment(pool, actors.ownerA!, shop, department, {
      name: "New arrivals",
      slug: "new-arrivals",
      position: 2,
      archived: true,
      version: 1,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await saveProduct(pool, actors.ownerA!, shop, p.id, {
    ...product(),
    availability: "archived",
    position: 9,
    version: 1,
  });
  await saveDepartment(pool, actors.ownerA!, shop, department, {
    name: "New arrivals",
    slug: "new-arrivals",
    position: 2,
    archived: true,
    version: 1,
  });
  await expect(
    pool.query("UPDATE products SET shop_id=$2 WHERE id=$1", [p.id, seedIds.shopB]),
  ).rejects.toMatchObject({ code: "23514" });
  expect((await readCatalogue(pool, actors.ownerA!, shop)).departments[0]).toMatchObject({
    archived: true,
    position: 2,
    version: 2,
  });
});
test("catalogue pagination is bounded and deterministic for tied positions", async () => {
  for (let i = 0; i < 25; i++)
    await saveProduct(pool, actors.ownerA!, shop, null, { ...product(), slug: `sample-${i}` });
  const first = await readCatalogue(pool, actors.ownerA!, shop),
    second = await readCatalogue(pool, actors.ownerA!, shop, 20);
  expect(first.products).toHaveLength(20);
  expect(first.hasMore).toBe(true);
  expect(second.products).toHaveLength(5);
  expect(new Set([...first.products, ...second.products].map((p) => p.id)).size).toBe(25);
  await expect(readCatalogue(pool, actors.ownerA!, shop, -1)).rejects.toThrow();
});
test("contact changes require fresh sensitive access and audit with owner notifications", async () => {
  await expect(saveContacts(pool, actors.staff!, shop, contacts())).rejects.toMatchObject({
    status: 404,
  });
  await pool.query("UPDATE session SET \"createdAt\"=now()-interval '6 minutes' WHERE id=$1", [
    actors.ownerA!.sessionId,
  ]);
  try {
    await expect(saveContacts(pool, actors.ownerA!, shop, contacts())).rejects.toMatchObject({
      status: 403,
    });
  } finally {
    await pool.query('UPDATE session SET "createdAt"=now() WHERE id=$1', [
      actors.ownerA!.sessionId,
    ]);
  }
  for (const website of [
    "javascript:alert(1)",
    "http://example.com",
    "https://user:pass@example.com",
    "https://127.0.0.1",
    "https://localhost",
    "https://example.com:444",
  ])
    expect(contactInput.safeParse({ ...contacts(), website }).success).toBe(false);
  await saveContacts(pool, actors.ownerA!, shop, contacts());
  await expect(saveContacts(pool, actors.ownerA!, shop, contacts())).rejects.toMatchObject({
    status: 409,
  });
  const job = (
    await pool.query(
      "SELECT id,payload FROM jobs WHERE shop_id=$1 AND payload->>'template'='contact-changed'",
      [shop],
    )
  ).rows[0];
  expect(job.payload).toMatchObject({ to: accounts.ownerA.email, version: 1 });
  await new LocalNotifications(new LocalPrivateStorage(join(directory, "mail"))).deliver(
    job.id,
    job.payload,
    AbortSignal.timeout(5000),
  );
  expect((await readContacts(pool, actors.ownerA!, shop)).version).toBe(1);
});
test("guest requests require eligibility, stay scoped and deduplicate without promising a sale", async () => {
  const input = guest();
  await expect(submitGuestRequest(pool, shop, input)).rejects.toMatchObject({ status: 404 });
  await saveContacts(pool, actors.ownerA!, shop, contacts());
  await Promise.all([submitGuestRequest(pool, shop, input), submitGuestRequest(pool, shop, input)]);
  expect(await listGuestRequests(pool, actors.ownerA!, shop)).toHaveLength(1);
  await expect(
    submitGuestRequest(pool, shop, { ...input, message: "Different" }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    submitGuestRequest(pool, shop, {
      ...guest(),
      productId: (await pool.query("SELECT id FROM products WHERE shop_id=$1", [seedIds.shopB]))
        .rows[0].id,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(listGuestRequests(pool, actors.ownerB!, shop)).rejects.toMatchObject({
    status: 404,
  });
  const item = (await listGuestRequests(pool, actors.ownerA!, shop))[0]!;
  await updateGuestRequest(pool, actors.ownerA!, shop, item.id, { status: "closed", version: 1 });
  await expect(
    updateGuestRequest(pool, actors.ownerA!, shop, item.id, { status: "acknowledged", version: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  await pool.query("UPDATE shop_moderation SET state='suspended' WHERE shop_id=$1", [shop]);
  await expect(publicContact(pool, shop)).rejects.toMatchObject({ status: 404 });
  await expect(submitGuestRequest(pool, shop, guest())).rejects.toMatchObject({ status: 404 });
});
test("real decoding strips metadata and produces bounded responsive rebuild variants", async () => {
  const input = await sharp(await image())
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const outputs = await imageVariants(input, "image/jpeg", AbortSignal.timeout(5000));
  expect(outputs.map((v) => v.variant)).toEqual(["thumbnail", "card", "display", "source"]);
  for (const output of outputs) {
    const metadata = await sharp(output.bytes).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(Math.max(output.width, output.height)).toBeLessThanOrEqual(
      { thumbnail: 320, card: 640, display: 1280, source: 2048 }[output.variant],
    );
    expect(output.bytes.length).toBeLessThan(input.length);
  }
});
test("ready media is private, reference protected and idempotent after effect before acknowledgment", async () => {
  const id = await upload(await image()),
    job = await mediaJob(id);
  await expect(readVariant(pool, actors.ownerA!, shop, id, "thumbnail")).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    saveProduct(pool, actors.ownerA!, shop, null, { ...product(), mediaId: id }),
  ).rejects.toMatchObject({ status: 404 });
  await processMedia(pool, job, AbortSignal.timeout(5000));
  const before = (
    await pool.query("SELECT stored_bytes,reserved_bytes FROM media_quotas WHERE shop_id=$1", [
      shop,
    ])
  ).rows[0];
  await processMedia(pool, job, AbortSignal.timeout(5000));
  expect(
    (
      await pool.query("SELECT stored_bytes,reserved_bytes FROM media_quotas WHERE shop_id=$1", [
        shop,
      ])
    ).rows[0],
  ).toEqual(before);
  await acknowledge(pool, job);
  await expect(readVariant(pool, actors.ownerB!, shop, id, "thumbnail")).rejects.toMatchObject({
    status: 404,
  });
  expect((await readVariant(pool, actors.ownerA!, shop, id, "thumbnail")).length).toBeGreaterThan(
    0,
  );
  await saveProduct(pool, actors.ownerA!, shop, null, { ...product(), mediaId: id });
  await expect(deleteMedia(pool, actors.ownerA!, shop, id, 2)).rejects.toMatchObject({
    status: 409,
    code: "media_in_use",
  });
  expect(
    (await pool.query("SELECT 1 FROM media_blobs WHERE asset_id=$1 AND variant='quarantine'", [id]))
      .rowCount,
  ).toBe(0);
});
test.each(["svg", "trailing-polyglot", "truncated", "wrong-type", "pixel-bomb", "animated"])(
  "unsafe upload %s rejects privately and releases storage reservation",
  async (kind) => {
    let bytes = await image(),
      type = "image/png";
    if (kind === "svg")
      bytes = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
    if (kind === "trailing-polyglot")
      bytes = Buffer.concat([bytes, Buffer.from("<script>alert(1)</script>")]);
    if (kind === "truncated") bytes = bytes.subarray(0, 20);
    if (kind === "wrong-type") type = "image/jpeg";
    if (kind === "pixel-bomb")
      bytes = await sharp({
        create: { width: 8192, height: 8192, channels: 3, background: "white" },
      })
        .png()
        .toBuffer();
    if (kind === "animated") {
      bytes = await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {
        raw: { width: 1, height: 2, channels: 3, pageHeight: 1 },
      })
        .webp({ loop: 0, delay: [100, 100] })
        .toBuffer();
      type = "image/webp";
      expect((await sharp(bytes, { animated: true }).metadata()).pages).toBe(2);
    }
    const id = await upload(bytes, type);
    const job = await mediaJob(id);
    await processMedia(pool, job, AbortSignal.timeout(5000));
    await acknowledge(pool, job);
    expect((await listMedia(pool, actors.ownerA!, shop))[0].state).toBe("rejected");
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM media_blobs WHERE asset_id=$1", [id]))
        .rows[0].count,
    ).toBe(0);
    expect(
      (
        await pool.query("SELECT reserved_bytes,stored_bytes FROM media_quotas WHERE shop_id=$1", [
          shop,
        ])
      ).rows[0],
    ).toEqual({ reserved_bytes: "0", stored_bytes: "0" });
  },
);
test("concurrent upload reservations enforce storage quota and cleanup restores capacity", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      startUpload(pool, actors.ownerA!, shop, {
        contentType: "image/png",
        bytes: 100,
        alt: "Sample",
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(6);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
  expect(
    (await pool.query("SELECT reserved_bytes FROM media_quotas WHERE shop_id=$1", [shop])).rows[0]
      .reserved_bytes,
  ).toBe(String(6 * mediaReservation));
  await pool.query(
    "UPDATE media_assets SET expires_at=clock_timestamp()-interval '1 second' WHERE shop_id=$1",
    [shop],
  );
  await transaction(pool, cleanupMedia);
  expect(
    (
      await pool.query(
        "SELECT asset_count,reserved_bytes,stored_bytes FROM media_quotas WHERE shop_id=$1",
        [shop],
      )
    ).rows[0],
  ).toEqual({ asset_count: 0, reserved_bytes: "0", stored_bytes: "0" });
});
test("upload ownership, byte/type checks and expiry survive an existing shop grant", async () => {
  const bytes = await image(),
    asset = await startUpload(pool, actors.ownerA!, shop, {
      contentType: "image/png",
      bytes: bytes.length,
      alt: "Sample",
    });
  await pool.query(
    "INSERT INTO staff_shop_grants(merchant_id,user_id,shop_id,permissions) VALUES($1,$2,$3,ARRAY['catalogue'])",
    [seedIds.merchantA, accounts.staff.id, shop],
  );
  await expect(uploadAuthority(pool, actors.staff!, shop, asset.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    finishUpload(pool, actors.ownerA!, shop, asset.id, bytes.subarray(0, 10), "image/png"),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    finishUpload(pool, actors.ownerA!, shop, asset.id, bytes, "image/jpeg"),
  ).rejects.toMatchObject({ status: 422 });
  await pool.query(
    "UPDATE media_assets SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [asset.id],
  );
  await expect(uploadAuthority(pool, actors.ownerA!, shop, asset.id)).rejects.toMatchObject({
    status: 404,
  });
});
test("deleting pending media and stale leases cannot resurrect blobs or corrupt quota", async () => {
  const first = await upload(await image()),
    old = await mediaJob(first);
  await deleteMedia(pool, actors.ownerA!, shop, first, 2);
  await processMedia(pool, old, AbortSignal.timeout(5000));
  await acknowledge(pool, old);
  expect(
    (await pool.query("SELECT count(*)::int AS count FROM media_blobs WHERE asset_id=$1", [first]))
      .rows[0].count,
  ).toBe(0);
  const second = await upload(await image()),
    job = await mediaJob(second);
  await pool.query("UPDATE jobs SET lease_token=$2 WHERE id=$1", [job.id, randomUUID()]);
  await expect(processMedia(pool, job, AbortSignal.timeout(5000))).rejects.toThrow("lease_lost");
  expect((await listMedia(pool, actors.ownerA!, shop))[0].state).toBe("processing");
});
test("dead-letter media reports failure and an audited retry fences the old version", async () => {
  const id = await upload(await image()),
    job = await mediaJob(id);
  await pool.query("UPDATE jobs SET max_attempts=1 WHERE id=$1", [job.id]);
  await fail(pool, { ...job, max_attempts: 1 } as Job, "handler_failed");
  expect((await listMedia(pool, actors.ownerA!, shop))[0].state).toBe("failed");
  await retryMedia(pool, actors.ownerA!, shop, id, 2);
  const retry = await mediaJob(id);
  expect(retry.payload.version).toBe(3);
  await processMedia(pool, job, AbortSignal.timeout(5000));
  await processMedia(pool, retry, AbortSignal.timeout(5000));
  await acknowledge(pool, retry);
  expect((await listMedia(pool, actors.ownerA!, shop))[0].state).toBe("ready");
});
test("operator support/recovery requires real MFA, an explicit grant, shop scope and freshness", async () => {
  const operator = clients.operator!;
  const enabled = await operator.request("two-factor/enable", {
    password: accounts.operator.password,
  });
  expect(enabled.status).toBe(200);
  const setup = await enabled.json();
  const secret = new URL(setup.totpURI).searchParams.get("secret")!;
  expect(
    (
      await operator.request("two-factor/verify-totp", {
        code: await generate({ secret }),
        trustDevice: false,
      })
    ).status,
  ).toBe(200);
  actors.operator = await resolveActor(auth, operator.headers());
  await pool.query(
    "INSERT INTO operator_grants(user_id,permission) VALUES($1,'support'),($1,'recovery')",
    [accounts.operator.id],
  );
  await expect(readCatalogue(pool, actors.operator!, shop)).rejects.toMatchObject({ status: 404 });
  await pool.query("INSERT INTO operator_shop_scopes(user_id,shop_id) VALUES($1,$2)", [
    accounts.operator.id,
    shop,
  ]);
  await readCatalogue(pool, actors.operator!, shop);
  await expect(saveProduct(pool, actors.operator!, shop, null, product())).rejects.toMatchObject({
    status: 404,
  });
  await saveContacts(pool, actors.operator!, shop, contacts());
  await pool.query(
    "UPDATE mfa_proofs SET verified_at=now()-interval '6 minutes' WHERE session_id=$1",
    [actors.operator!.sessionId],
  );
  await expect(
    saveContacts(pool, actors.operator!, shop, { ...contacts(), version: 1 }),
  ).rejects.toMatchObject({ status: 403 });
});
test("a foreign ready image is denied by both the product command and composite SQL reference", async () => {
  const bytes = await image(),
    asset = await startUpload(pool, actors.ownerB!, seedIds.shopB, {
      contentType: "image/png",
      bytes: bytes.length,
      alt: "Foreign sample",
    });
  await finishUpload(pool, actors.ownerB!, seedIds.shopB, asset.id, bytes, "image/png");
  const job = await mediaJob(asset.id);
  await processMedia(pool, job, AbortSignal.timeout(5000));
  await acknowledge(pool, job);
  await expect(
    saveProduct(pool, actors.ownerA!, shop, null, { ...product(), mediaId: asset.id }),
  ).rejects.toMatchObject({ status: 404 });
  const p = await saveProduct(pool, actors.ownerA!, shop, null, product());
  await expect(
    pool.query(
      "INSERT INTO product_media(product_id,asset_id,shop_id,merchant_id) VALUES($1,$2,$3,$4)",
      [p.id, asset.id, shop, seedIds.merchantA],
    ),
  ).rejects.toMatchObject({ code: "23503" });
});
test("notification fanout limit rolls back contact changes and guest receipt atomically", async () => {
  await saveContacts(pool, actors.ownerA!, shop, contacts());
  const ids: string[] = [];
  try {
    for (let i = 0; i < 10; i++) {
      const id = randomUUID();
      ids.push(id);
      await pool.query(
        'INSERT INTO "user"(id,name,email,"emailVerified","updatedAt") VALUES($1,\'Owner fixture\',$2,true,now())',
        [id, `${id}@example.com`],
      );
      await pool.query("INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')", [
        seedIds.merchantA,
        id,
      ]);
    }
    await expect(
      saveContacts(pool, actors.ownerA!, shop, {
        ...contacts(),
        version: 1,
        phone: "+256700000002",
      }),
    ).rejects.toMatchObject({ status: 422, code: "notification_recipient_limit" });
    expect((await readContacts(pool, actors.ownerA!, shop)).version).toBe(1);
    await expect(submitGuestRequest(pool, shop, guest())).rejects.toMatchObject({ status: 429 });
    expect(await listGuestRequests(pool, actors.ownerA!, shop)).toHaveLength(0);
  } finally {
    await pool.query("DELETE FROM memberships WHERE user_id=ANY($1::text[])", [ids]);
    await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [ids]);
  }
});
