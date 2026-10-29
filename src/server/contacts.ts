import { eligibleStates, eligibilityJoins } from "./public-eligibility";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import { catalogueAccess, catalogueLock } from "./catalogue";
import { type Actor, requireStepUp, requireShop } from "./security/authorization";
import { AccessError } from "./security/errors";
import { audit } from "./security/audit";
import { enqueue } from "./jobs/enqueue";

const phone = z.string().regex(/^(|\+[1-9][0-9]{7,14})$/);
export const safeWebsite = z
  .string()
  .max(500)
  .refine((value) => {
    if (!value) return true;
    try {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) &&
        !/^([0-9.]+|.*\.(local|internal|localhost|test|invalid))$/i.test(u.hostname) &&
        u.hostname !== "localhost"
      );
    } catch {
      return false;
    }
  }, "Use a public HTTPS website without credentials");
export const contactInput = z
  .object({
    version: z.number().int().min(0),
    phone,
    whatsapp: phone,
    website: safeWebsite,
    fulfilment: z.enum(["contact", "pickup", "delivery", "pickup_and_delivery"]),
    paymentInstructions: z.string().trim().max(500),
    deliveryInstructions: z.string().trim().max(500),
    enquiriesEnabled: z.boolean(),
    reason: z.string().trim().min(3).max(240),
  })
  .strict();
export const contactDefaults = {
  version: 0,
  phone: "",
  whatsapp: "",
  website: "",
  fulfilment: "contact",
  payment_instructions: "",
  delivery_instructions: "",
  enquiries_enabled: false,
};
export async function readContacts(pool: Pool, actor: Actor, shopId: string) {
  await catalogueAccess(pool, actor, shopId, "catalogue", "support");
  return (
    (
      await pool.query(
        "SELECT version,phone,whatsapp,website,fulfilment,payment_instructions,delivery_instructions,enquiries_enabled FROM shop_contacts WHERE shop_id=$1",
        [shopId],
      )
    ).rows[0] ?? contactDefaults
  );
}
export async function saveContacts(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof contactInput>,
) {
  const v = contactInput.parse(input);
  return transaction(pool, async (client) => {
    const shop = await requireShop(client, actor, shopId, "sensitive");
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [shop.merchant_id]);
    await requireShop(client, actor, shopId, "sensitive");
    await requireStepUp(client, actor);
    return commitContacts(client, actor, shopId, shop.merchant_id, v);
  });
}
// Internal transactional writer: callers establish authority and merchant serialization.
export async function commitContacts(
  client: import("pg").PoolClient,
  actor: Actor,
  shopId: string,
  merchantId: string,
  v: z.infer<typeof contactInput>,
) {
  const old = (await client.query("SELECT version FROM shop_contacts WHERE shop_id=$1", [shopId]))
    .rows[0];
  if ((old?.version ?? 0) !== v.version) throw new AccessError(409, "stale_version");
  const result = await client.query(
    `INSERT INTO shop_contacts(shop_id,merchant_id,version,phone,whatsapp,website,fulfilment,payment_instructions,delivery_instructions,enquiries_enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(shop_id) DO UPDATE SET version=excluded.version,phone=excluded.phone,whatsapp=excluded.whatsapp,website=excluded.website,fulfilment=excluded.fulfilment,payment_instructions=excluded.payment_instructions,delivery_instructions=excluded.delivery_instructions,enquiries_enabled=excluded.enquiries_enabled RETURNING version`,
    [
      shopId,
      merchantId,
      v.version + 1,
      v.phone,
      v.whatsapp,
      v.website,
      v.fulfilment,
      v.paymentInstructions,
      v.deliveryInstructions,
      v.enquiriesEnabled,
    ],
  );
  await audit(client, actor, "shop.contacts.changed", shopId, merchantId, {
    version: v.version + 1,
    reason: v.reason,
  });
  const owners = (
    await client.query(
      `SELECT u.email FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.merchant_id=$1 AND m.role='owner' AND m.status='active' ORDER BY u.id LIMIT 11`,
      [merchantId],
    )
  ).rows;
  if (owners.length > 10) throw new AccessError(422, "notification_recipient_limit");
  for (const owner of owners)
    await enqueue(client, {
      kind: "notification.local",
      key: `contact-change:${shopId}:${v.version + 1}:${owner.email}`,
      merchantId: merchantId,
      shopId,
      payload: { template: "contact-changed", to: owner.email, shopId, version: v.version + 1 },
    });
  return result.rows[0];
}

export async function publicContact(pool: Pool, shopId: string) {
  const row = (
    await pool.query(
      `SELECT s.id,s.merchant_id,s.name,c.phone,c.whatsapp,c.website,c.fulfilment,c.delivery_instructions,c.payment_instructions FROM shops s
  JOIN shop_contacts c ON c.shop_id=s.id ${eligibilityJoins}
  JOIN shop_designs sd ON sd.shop_id=s.id AND sd.published_id IS NOT NULL
  WHERE s.id=$1 AND c.enquiries_enabled AND ${eligibleStates}`,
      [shopId],
    )
  ).rows[0];
  if (!row) throw new AccessError(404, "resource_unavailable");
  if (!safeWebsite.safeParse(row.website).success) row.website = "";
  return row;
}
export const guestInput = z
  .object({
    key: z.uuid(),
    kind: z.enum(["enquiry", "request", "reservation"]),
    name: z.string().trim().min(1).max(80),
    replyTo: z
      .string()
      .trim()
      .max(254)
      .refine((value) => z.email().safeParse(value).success || /^\+[1-9][0-9]{7,14}$/.test(value)),
    message: z.string().trim().min(1).max(2000),
    productId: z.uuid().nullable(),
  })
  .strict();
export async function submitGuestRequest(
  pool: Pool,
  shopId: string,
  input: z.infer<typeof guestInput>,
) {
  const v = guestInput.parse(input),
    fingerprint = createHash("sha256").update(JSON.stringify(v)).digest("hex");
  return transaction(pool, async (client) => {
    const lookup = (await client.query("SELECT merchant_id FROM shops WHERE id=$1", [shopId]))
      .rows[0];
    if (!lookup) throw new AccessError(404, "resource_unavailable");
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [lookup.merchant_id]);
    const eligible = await client.query(
      `SELECT 1 FROM shops s JOIN shop_contacts c ON c.shop_id=s.id ${eligibilityJoins} JOIN shop_designs sd ON sd.shop_id=s.id AND sd.published_id IS NOT NULL WHERE s.id=$1 AND c.enquiries_enabled AND ${eligibleStates}`,
      [shopId],
    );
    if (!eligible.rowCount) throw new AccessError(404, "resource_unavailable");
    if (
      v.productId &&
      !(
        await client.query(
          "SELECT 1 FROM products p JOIN departments d ON d.id=p.department_id WHERE p.id=$1 AND p.shop_id=$2 AND p.availability='available' AND d.archived=false",
          [v.productId, shopId],
        )
      ).rowCount
    )
      throw new AccessError(404, "resource_unavailable");
    const previous = (
      await client.query(
        "SELECT fingerprint FROM guest_requests WHERE shop_id=$1 AND request_key=$2",
        [shopId, v.key],
      )
    ).rows[0];
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new AccessError(409, "request_key_conflict");
      return { received: true };
    }
    if (
      (
        await client.query(
          "SELECT count(*)::int AS count FROM guest_requests WHERE shop_id=$1 AND status<>'closed'",
          [shopId],
        )
      ).rows[0].count >= 500
    )
      throw new AccessError(429, "request_capacity");
    const id = randomUUID();
    await client.query(
      "INSERT INTO guest_requests(id,shop_id,merchant_id,product_id,request_key,fingerprint,kind,name,reply_to,message) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        id,
        shopId,
        lookup.merchant_id,
        v.productId,
        v.key,
        fingerprint,
        v.kind,
        v.name,
        v.replyTo,
        v.message,
      ],
    );
    const owners = (
      await client.query(
        `SELECT u.email FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.merchant_id=$1 AND m.role='owner' AND m.status='active' ORDER BY u.id LIMIT 11`,
        [lookup.merchant_id],
      )
    ).rows;
    if (owners.length > 10) throw new AccessError(429, "notification_recipient_limit");
    for (const owner of owners)
      await enqueue(client, {
        kind: "notification.local",
        key: `guest-request:${id}:${owner.email}`,
        merchantId: lookup.merchant_id,
        shopId,
        payload: { template: "guest-request", to: owner.email, shopId, requestId: id },
      });
    return { received: true };
  });
}
export async function listGuestRequests(pool: Pool, actor: Actor, shopId: string, offset = 0) {
  await catalogueAccess(pool, actor, shopId);
  return (
    await pool.query(
      `SELECT r.id,r.kind,r.name,r.reply_to,r.message,r.status,r.version,r.created_at,r.erased_at,
        CASE WHEN r.erased_at IS NULL THEN q.name ELSE NULL END AS product_name,
        CASE WHEN r.erased_at IS NULL THEN q.slug ELSE NULL END AS product_slug
       FROM guest_requests r LEFT JOIN products q ON q.id=r.product_id AND q.shop_id=r.shop_id
       WHERE r.shop_id=$1 ORDER BY r.created_at DESC,r.id LIMIT 20 OFFSET $2`,
      [shopId, z.number().int().min(0).max(10000).parse(offset)],
    )
  ).rows;
}
export const requestStatus = z
  .object({ status: z.enum(["acknowledged", "closed"]), version: z.number().int().positive() })
  .strict();
export async function updateGuestRequest(
  pool: Pool,
  actor: Actor,
  shopId: string,
  id: string,
  input: z.infer<typeof requestStatus>,
) {
  const v = requestStatus.parse(input);
  return transaction(pool, async (client) => {
    const shop = await catalogueLock(client, actor, shopId);
    const current = (
      await client.query("SELECT version,status FROM guest_requests WHERE id=$1 AND shop_id=$2", [
        id,
        shopId,
      ])
    ).rows[0];
    if (!current) throw new AccessError(404, "resource_unavailable");
    if (current.version !== v.version || current.status === "closed")
      throw new AccessError(409, "stale_version");
    const updated = await client.query(
      "UPDATE guest_requests SET status=$3,version=version+1 WHERE id=$1 AND shop_id=$2 RETURNING id,status,version",
      [id, shopId, v.status],
    );
    await audit(client, actor, "guest-request.status.changed", id, shop.merchant_id, {
      status: v.status,
    });
    return updated.rows[0];
  });
}
