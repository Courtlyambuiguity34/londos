import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import {
  applicationAccess,
  currentVersion,
  fingerprint,
  localLifecycle,
  notifyOwners,
  reasonInput,
  type Application,
} from "./lifecycle-common";
import { requireOperator, requireShop, requireStepUp, type Actor } from "./security/authorization";
import { AccessError } from "./security/errors";
import { audit } from "./security/audit";

const day = 86400000;
const amount = z.string().regex(/^[1-9][0-9]{0,19}$/);
export const policyInput = z
  .object({
    label: z.string().trim().min(3).max(100),
    amountMinor: z.string().regex(/^[1-9][0-9]{0,8}$|^1000000000$/),
    periodDays: z.number().int().min(1).max(366),
    graceDays: z.number().int().min(0).max(30),
    mallCapacity: z.number().int().min(1).max(5000),
    confirm: z.literal(true),
  })
  .strict();
export const reconcileInput = z
  .object({
    key: z.uuid(),
    version: z.number().int().positive(),
    kind: z.enum(["payment", "waiver"]),
    amountMinor: amount,
    currency: z.literal("UGX"),
    invoiceReference: z.string().regex(/^LON-[A-F0-9]{32}$/),
    reference: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9/-]{5,79}$/),
    reason: reasonInput,
    confirm: z.literal(true),
  })
  .strict();
export const reverseInput = z
  .object({
    key: z.uuid(),
    version: z.number().int().positive(),
    eventId: z.uuid(),
    reason: reasonInput,
    confirm: z.literal(true),
  })
  .strict();
export type RentPolicy = {
  id: string;
  label: string;
  currency: string;
  amount_minor: string;
  period_days: number;
  grace_days: number;
  mall_capacity: number;
  development_only: boolean;
};
export type Invoice = {
  id: string;
  merchant_id: string;
  application_id: string;
  shop_id: string | null;
  currency: string;
  amount_minor: string;
  period_start: Date;
  period_end: Date;
  reference: string;
  policy_id: string;
  kind: string;
  version: number;
  finalized: boolean;
  credited_minor: string;
};
const invoiceColumns =
  "i.id,i.merchant_id,i.application_id,i.shop_id,i.currency,i.amount_minor::text,i.period_start,i.period_end,s.reference,s.policy_id,s.kind,s.version,s.finalized,coalesce((SELECT sum(e.amount_minor) FROM rent_events e WHERE e.invoice_id=i.id AND e.kind IN ('payment','waiver','adjustment')),0)::text AS credited_minor";
export async function listPolicies(pool: Pool, actor: Actor) {
  localLifecycle();
  await requireOperator(pool, actor, "review");
  return (await pool.query("SELECT * FROM rent_policies ORDER BY created_at DESC,id LIMIT 50"))
    .rows as RentPolicy[];
}
export async function createPolicy(pool: Pool, actor: Actor, input: z.infer<typeof policyInput>) {
  localLifecycle();
  const v = policyInput.parse(input);
  return transaction(pool, async (client) => {
    await requireOperator(client, actor, "finance", true);
    const id = randomUUID();
    await client.query(
      "INSERT INTO rent_policies(id,label,currency,amount_minor,period_days,grace_days,mall_capacity,development_only) VALUES($1,$2,'UGX',$3,$4,$5,$6,true)",
      [id, v.label, v.amountMinor, v.periodDays, v.graceDays, v.mallCapacity],
    );
    await audit(client, actor, "rent.policy.created", id, undefined, { developmentOnly: true });
    return { id };
  });
}
export async function issueInvoice(
  client: PoolClient,
  actor: Actor,
  application: Application,
  policyId: string,
  kind: "initial" | "renewal",
  shopId: string | null,
  now: Date,
) {
  const policy = (
    await client.query("SELECT * FROM rent_policies WHERE id=$1 AND development_only=true", [
      policyId,
    ])
  ).rows[0] as RentPolicy | undefined;
  if (!policy) throw new AccessError(422, "policy_unavailable");
  const id = randomUUID(),
    reference = `LON-${id.replaceAll("-", "").toUpperCase()}`;
  await client.query(
    "INSERT INTO invoices(id,merchant_id,application_id,shop_id,currency,amount_minor,period_start,period_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      id,
      application.merchant_id,
      application.id,
      shopId,
      policy.currency,
      policy.amount_minor,
      now,
      new Date(now.getTime() + policy.period_days * day),
    ],
  );
  await client.query(
    "INSERT INTO rent_invoice_state(invoice_id,reference,policy_id,kind,application_id) VALUES($1,$2,$3,$4,$5)",
    [id, reference, policyId, kind, application.id],
  );
  await audit(client, actor, "rent.invoice.issued", id, application.merchant_id, {
    reference,
    kind,
    policyId,
  });
  return { id, reference };
}
export async function invoiceAccess(
  db: Pool | PoolClient,
  actor: Actor,
  id: string,
  mode: "owner" | "finance",
) {
  localLifecycle();
  z.uuid().parse(id);
  if (mode === "finance") await requireOperator(db, actor, "finance");
  const row = (
    await db.query(
      `SELECT ${invoiceColumns} FROM invoices i JOIN rent_invoice_state s ON s.invoice_id=i.id WHERE i.id=$1`,
      [id],
    )
  ).rows[0] as Invoice | undefined;
  if (!row) throw new AccessError(404, "resource_unavailable");
  if (mode === "finance") await applicationAccess(db, actor, row.application_id, "finance");
  else if (row.shop_id) await requireShop(db, actor, row.shop_id, "finance");
  else await applicationAccess(db, actor, row.application_id, "owner");
  return row;
}
export async function readInvoice(
  pool: Pool,
  actor: Actor,
  id: string,
  mode: "owner" | "finance" = "owner",
) {
  return transaction(pool, async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const invoice = await invoiceAccess(client, actor, id, mode);
    const events = (
      await client.query(
        "SELECT e.id,e.kind,e.amount_minor::text,e.source_reference,e.reason,e.created_at,EXISTS(SELECT 1 FROM rent_reversals r WHERE r.original_event_id=e.id) AS reversed FROM rent_events e WHERE invoice_id=$1 ORDER BY e.created_at DESC,e.id DESC LIMIT 50",
        [id],
      )
    ).rows as {
      id: string;
      kind: string;
      amount_minor: string;
      source_reference: string;
      reason: string;
      created_at: Date;
      reversed: boolean;
    }[];
    const policy = (
      await client.query("SELECT * FROM rent_policies WHERE id=$1", [invoice.policy_id])
    ).rows[0] as RentPolicy;
    return { invoice, events, policy };
  });
}
export async function applicationInvoices(
  pool: Pool,
  actor: Actor,
  id: string,
  mode: "owner" | "finance",
  offset = 0,
) {
  await applicationAccess(pool, actor, id, mode);
  z.number().int().min(0).max(10000).parse(offset);
  return (
    await pool.query(
      `SELECT ${invoiceColumns} FROM invoices i JOIN rent_invoice_state s ON s.invoice_id=i.id WHERE i.application_id=$1 ORDER BY i.created_at DESC,i.id DESC LIMIT 20 OFFSET $2`,
      [id, offset],
    )
  ).rows as Invoice[];
}
export async function shopRent(pool: Pool, actor: Actor, shopId: string, offset = 0) {
  localLifecycle();
  z.uuid().parse(shopId);
  z.number().int().min(0).max(10000).parse(offset);
  await requireShop(pool, actor, shopId, "finance");
  const tenancy = (
    await pool.query(
      "SELECT t.state,t.version,t.period_start,t.period_end,c.policy_id FROM tenancies t LEFT JOIN rent_contracts c ON c.shop_id=t.shop_id WHERE t.shop_id=$1",
      [shopId],
    )
  ).rows[0] as {
    state: string;
    version: number;
    period_start: Date | null;
    period_end: Date | null;
    policy_id: string | null;
  };
  const invoices = (
    await pool.query(
      `SELECT ${invoiceColumns} FROM invoices i JOIN rent_invoice_state s ON s.invoice_id=i.id WHERE i.shop_id=$1 ORDER BY i.created_at DESC,i.id DESC LIMIT 20 OFFSET $2`,
      [shopId, offset],
    )
  ).rows as Invoice[];
  return { tenancy, invoices };
}
export async function requestRenewal(
  pool: Pool,
  actor: Actor,
  shopId: string,
  version: number,
  now = new Date(),
) {
  localLifecycle();
  z.number().int().positive().parse(version);
  return transaction(pool, async (client) => {
    const shop = await requireShop(client, actor, shopId, "finance");
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [shop.merchant_id]);
    await requireShop(client, actor, shopId, "finance");
    await requireStepUp(client, actor);
    const contract = (
      await client.query(
        "SELECT c.application_id,c.policy_id,t.version,t.period_end,p.period_days FROM rent_contracts c JOIN tenancies t ON t.shop_id=c.shop_id JOIN rent_policies p ON p.id=c.policy_id WHERE c.shop_id=$1",
        [shopId],
      )
    ).rows[0];
    if (!contract) throw new AccessError(409, "rent_contract_unavailable");
    const open = (
      await client.query(
        `SELECT ${invoiceColumns} FROM invoices i JOIN rent_invoice_state s ON s.invoice_id=i.id WHERE i.shop_id=$1 AND (NOT s.finalized OR coalesce((SELECT sum(e.amount_minor) FROM rent_events e WHERE e.invoice_id=i.id),0)<i.amount_minor) ORDER BY i.created_at,i.id LIMIT 1`,
        [shopId],
      )
    ).rows[0];
    if (open) return { id: open.id as string };
    currentVersion(contract.version, version);
    if (
      contract.period_end &&
      new Date(contract.period_end).getTime() > now.getTime() + contract.period_days * day
    )
      throw new AccessError(409, "renewal_not_due_yet");
    const application = (
      await client.query("SELECT * FROM applications WHERE id=$1", [contract.application_id])
    ).rows[0] as Application;
    return issueInvoice(client, actor, application, contract.policy_id, "renewal", shopId, now);
  });
}
async function allocateMall(client: PoolClient, capacity: number) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('londos:mall-capacity',0))");
  const available = (
    await client.query(
      "SELECT m.id FROM malls m WHERE (SELECT count(*) FROM shops s WHERE s.mall_id=m.id)<m.planning_capacity ORDER BY m.created_at,m.id LIMIT 1",
    )
  ).rows[0];
  if (available) return available.id as string;
  const id = randomUUID();
  await client.query("INSERT INTO malls(id,name,planning_capacity) VALUES($1,$2,$3)", [
    id,
    `Development mall ${id.slice(0, 8)}`,
    capacity,
  ]);
  return id;
}
async function provision(
  client: PoolClient,
  actor: Actor,
  invoice: Invoice,
  policy: RentPolicy,
  start: Date,
  end: Date,
) {
  const application = (
    await client.query("SELECT * FROM applications WHERE id=$1", [invoice.application_id])
  ).rows[0] as Application;
  if (application.state !== "approved") throw new AccessError(409, "application_not_approved");
  if (application.provisioned_shop_id) throw new AccessError(409, "already_provisioned");
  const id = randomUUID(),
    mall = await allocateMall(client, policy.mall_capacity);
  const prefix =
    application.business_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30)
      .replace(/-$/g, "") || "shop";
  await client.query(
    "INSERT INTO shops(id,merchant_id,mall_id,name,slug,category) VALUES($1,$2,$3,$4,$5,$6)",
    [
      id,
      invoice.merchant_id,
      mall,
      application.business_name,
      `${prefix}-${id}`,
      application.category,
    ],
  );
  await client.query("INSERT INTO shop_publication(shop_id,state) VALUES($1,'unpublished')", [id]);
  await client.query("INSERT INTO shop_moderation(shop_id,state) VALUES($1,'clear')", [id]);
  await client.query(
    "INSERT INTO tenancies(shop_id,state,period_start,period_end) VALUES($1,'active',$2,$3)",
    [id, start, end],
  );
  await client.query(
    "INSERT INTO rent_contracts(shop_id,merchant_id,application_id,policy_id) VALUES($1,$2,$3,$4)",
    [id, invoice.merchant_id, invoice.application_id, invoice.policy_id],
  );
  await client.query(
    "UPDATE applications SET provisioned_shop_id=$2,version=version+1,updated_at=now() WHERE id=$1",
    [invoice.application_id, id],
  );
  await client.query("UPDATE invoices SET shop_id=$2 WHERE id=$1", [invoice.id, id]);
  await client.query(
    "INSERT INTO operator_shop_scopes(user_id,shop_id) SELECT DISTINCT user_id,$2::uuid FROM operator_application_scopes WHERE application_id=$1 ON CONFLICT DO NOTHING",
    [invoice.application_id, id],
  );
  await audit(client, actor, "rent.shop.provisioned", id, invoice.merchant_id, {
    applicationId: invoice.application_id,
    invoiceId: invoice.id,
    mallId: mall,
  });
  return id;
}
export function tenancyAt(end: Date, graceDays: number, now: Date, debt = false) {
  if (debt || now.getTime() >= end.getTime() + graceDays * day) return "closed";
  if (now < end) return "active";
  return now.getTime() < end.getTime() + day ? "due" : "grace";
}
export async function syncTenancy(client: PoolClient, shopId: string, now: Date, actor?: Actor) {
  const row = (
    await client.query(
      "SELECT c.merchant_id,t.state,t.version,t.period_start,t.period_end,p.grace_days FROM rent_contracts c JOIN tenancies t ON t.shop_id=c.shop_id JOIN rent_policies p ON p.id=c.policy_id WHERE c.shop_id=$1",
      [shopId],
    )
  ).rows[0];
  if (!row) throw new AccessError(404, "rent_contract_unavailable");
  const latest = (
    await client.query(
      "SELECT i.period_start,i.period_end FROM invoices i JOIN rent_invoice_state s ON s.invoice_id=i.id WHERE i.shop_id=$1 AND s.finalized ORDER BY i.period_end DESC,i.id DESC LIMIT 1",
      [shopId],
    )
  ).rows[0];
  if (!latest) throw new AccessError(409, "coverage_unavailable");
  const debt = Boolean(
    (
      await client.query(
        "SELECT 1 FROM invoices i JOIN rent_invoice_state s ON s.invoice_id=i.id WHERE i.shop_id=$1 AND s.finalized AND coalesce((SELECT sum(e.amount_minor) FROM rent_events e WHERE e.invoice_id=i.id),0)<i.amount_minor LIMIT 1",
        [shopId],
      )
    ).rowCount,
  );
  const end = new Date(latest.period_end),
    start = new Date(latest.period_start),
    state = tenancyAt(end, row.grace_days, now, debt);
  const changed =
    state !== row.state ||
    end.getTime() !== new Date(row.period_end).getTime() ||
    start.getTime() !== new Date(row.period_start).getTime();
  if (changed) {
    await client.query(
      "UPDATE tenancies SET state=$2,period_start=$3,period_end=$4,version=version+1 WHERE shop_id=$1",
      [shopId, state, start, end],
    );
    await client.query(
      "INSERT INTO audit_events(id,merchant_id,actor_id,action,resource_id,details) VALUES($1,$2,$3,'rent.tenancy.changed',$4,$5)",
      [
        randomUUID(),
        row.merchant_id,
        actor?.userId ?? null,
        shopId,
        JSON.stringify({ from: row.state, to: state, periodEnd: end.toISOString(), debt }),
      ],
    );
  }
  const notice =
    state === "active" && end.getTime() - now.getTime() <= 3 * day ? "renewal_due" : state;
  if (notice !== "active")
    await notifyOwners(
      client,
      row.merchant_id,
      `rent:${shopId}:${end.toISOString()}:${notice}:${debt ? "debt" : "time"}`,
      { template: "tenancy-status", shopId, state: notice, periodEnd: end.toISOString() },
    );
  const milestones = [
    end.getTime() - 3 * day,
    end.getTime(),
    end.getTime() + day,
    end.getTime() + row.grace_days * day,
  ].filter((t) => t > now.getTime());
  const next = new Date(Math.min(now.getTime() + day, ...milestones));
  await client.query("UPDATE rent_contracts SET next_check_at=$2 WHERE shop_id=$1", [shopId, next]);
  return { state, version: row.version + (changed ? 1 : 0) };
}
type CommandResult = {
  eventId: string;
  shopId: string | null;
  version: number;
  creditedMinor: string;
};
async function previousCommand(client: PoolClient, actor: Actor, key: string, hash: string) {
  const row = (
    await client.query(
      "SELECT fingerprint,result FROM rent_command_receipts WHERE actor_id=$1 AND request_key=$2",
      [actor.userId, key],
    )
  ).rows[0];
  if (row && row.fingerprint !== hash) throw new AccessError(409, "idempotency_conflict");
  return row?.result as CommandResult | undefined;
}
async function recordCommand(
  client: PoolClient,
  actor: Actor,
  key: string,
  hash: string,
  invoiceId: string,
  result: CommandResult,
) {
  await client.query(
    "INSERT INTO rent_command_receipts(actor_id,request_key,fingerprint,invoice_id,result) VALUES($1,$2,$3,$4,$5)",
    [actor.userId, key, hash, invoiceId, JSON.stringify(result)],
  );
  return result;
}
export async function reconcileInvoice(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof reconcileInput>,
  now?: Date,
) {
  const v = reconcileInput.parse(input),
    hash = fingerprint({ id, ...v });
  return transaction(pool, async (client) => {
    await invoiceAccess(client, actor, id, "finance");
    await requireOperator(client, actor, "finance", true);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `rent-command:${actor.userId}:${v.key}`,
    ]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `rent-reference:${v.reference}`,
    ]);
    const initial = await invoiceAccess(client, actor, id, "finance");
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [initial.merchant_id]);
    const invoice = await invoiceAccess(client, actor, id, "finance");
    await requireOperator(client, actor, "finance", true);
    const previous = await previousCommand(client, actor, v.key, hash);
    if (previous) return previous;
    currentVersion(invoice.version, v.version);
    const effectiveNow = now ?? new Date();
    if (invoice.currency !== v.currency) throw new AccessError(422, "currency_mismatch");
    if (invoice.reference !== v.invoiceReference)
      throw new AccessError(422, "invoice_reference_mismatch");
    if (
      (
        await client.query(
          "SELECT 1 FROM rent_events WHERE source='local-manual' AND source_reference=$1",
          [v.reference],
        )
      ).rowCount
    )
      throw new AccessError(409, "receipt_already_used");
    const total = BigInt(invoice.credited_minor) + BigInt(v.amountMinor),
      due = BigInt(invoice.amount_minor);
    if (total > due) throw new AccessError(409, "amount_exceeds_balance");
    const eventId = randomUUID();
    await client.query(
      "INSERT INTO rent_events(id,invoice_id,merchant_id,currency,amount_minor,kind,source,source_reference,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,'local-manual',$7,$8,$9)",
      [
        eventId,
        id,
        invoice.merchant_id,
        v.currency,
        v.amountMinor,
        v.kind,
        v.reference,
        actor.userId,
        v.reason,
      ],
    );
    let shopId = invoice.shop_id;
    if (total === due && !invoice.finalized) {
      const policy = (
        await client.query("SELECT * FROM rent_policies WHERE id=$1", [invoice.policy_id])
      ).rows[0] as RentPolicy;
      const previousEnd = shopId
        ? (await client.query("SELECT period_end FROM tenancies WHERE shop_id=$1", [shopId]))
            .rows[0]?.period_end
        : null;
      const start = new Date(
          Math.max(effectiveNow.getTime(), previousEnd ? new Date(previousEnd).getTime() : 0),
        ),
        end = new Date(start.getTime() + policy.period_days * day);
      await client.query("UPDATE invoices SET period_start=$2,period_end=$3 WHERE id=$1", [
        id,
        start,
        end,
      ]);
      if (!shopId) shopId = await provision(client, actor, invoice, policy, start, end);
      await client.query("UPDATE rent_invoice_state SET finalized=true WHERE invoice_id=$1", [id]);
      await audit(client, actor, "rent.coverage.finalized", id, invoice.merchant_id, {
        start: start.toISOString(),
        end: end.toISOString(),
      });
    }
    await client.query("UPDATE rent_invoice_state SET version=version+1 WHERE invoice_id=$1", [id]);
    if (shopId) await syncTenancy(client, shopId, effectiveNow, actor);
    await audit(client, actor, `rent.${v.kind}.recorded`, id, invoice.merchant_id, {
      eventId,
      amountMinor: v.amountMinor,
      reference: v.reference,
      reason: v.reason,
    });
    await notifyOwners(client, invoice.merchant_id, `rent-credit:${eventId}`, {
      template: "rent-credit",
      invoiceId: id,
      eventId,
    });
    // Provisioning may wait on shared mall capacity after the merchant lock.
    // Revocation during that wait must roll back the entire financial command.
    await invoiceAccess(client, actor, id, "finance");
    await requireOperator(client, actor, "finance", true);
    return recordCommand(client, actor, v.key, hash, id, {
      eventId,
      shopId,
      version: invoice.version + 1,
      creditedMinor: total.toString(),
    });
  });
}
export async function reverseCredit(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof reverseInput>,
  now?: Date,
) {
  const v = reverseInput.parse(input),
    hash = fingerprint({ id, ...v });
  return transaction(pool, async (client) => {
    const initial = await invoiceAccess(client, actor, id, "finance");
    await requireOperator(client, actor, "finance", true);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `rent-command:${actor.userId}:${v.key}`,
    ]);
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [initial.merchant_id]);
    const invoice = await invoiceAccess(client, actor, id, "finance");
    await requireOperator(client, actor, "finance", true);
    const previous = await previousCommand(client, actor, v.key, hash);
    if (previous) return previous;
    currentVersion(invoice.version, v.version);
    const effectiveNow = now ?? new Date();
    const original = (
      await client.query(
        "SELECT id,amount_minor::text FROM rent_events WHERE id=$1 AND invoice_id=$2 AND source='local-manual' AND kind IN ('payment','waiver')",
        [v.eventId, id],
      )
    ).rows[0];
    if (!original) throw new AccessError(404, "resource_unavailable");
    if (
      (await client.query("SELECT 1 FROM rent_reversals WHERE original_event_id=$1", [v.eventId]))
        .rowCount
    )
      throw new AccessError(409, "credit_already_reversed");
    const eventId = randomUUID(),
      negative = (-BigInt(original.amount_minor)).toString();
    await client.query(
      "INSERT INTO rent_events(id,invoice_id,merchant_id,currency,amount_minor,kind,source,source_reference,actor_id,reason) VALUES($1,$2,$3,$4,$5,'adjustment','local-reversal',$6,$7,$8)",
      [
        eventId,
        id,
        invoice.merchant_id,
        invoice.currency,
        negative,
        v.eventId,
        actor.userId,
        v.reason,
      ],
    );
    await client.query(
      "INSERT INTO rent_reversals(original_event_id,reversal_event_id,invoice_id) VALUES($1,$2,$3)",
      [v.eventId, eventId, id],
    );
    await client.query("UPDATE rent_invoice_state SET version=version+1 WHERE invoice_id=$1", [id]);
    if (invoice.shop_id) await syncTenancy(client, invoice.shop_id, effectiveNow, actor);
    await audit(client, actor, "rent.credit.reversed", id, invoice.merchant_id, {
      eventId,
      originalEventId: v.eventId,
      reason: v.reason,
    });
    await notifyOwners(client, invoice.merchant_id, `rent-credit:${eventId}`, {
      template: "rent-credit",
      invoiceId: id,
      eventId,
    });
    return recordCommand(client, actor, v.key, hash, id, {
      eventId,
      shopId: invoice.shop_id,
      version: invoice.version + 1,
      creditedMinor: (BigInt(invoice.credited_minor) + BigInt(negative)).toString(),
    });
  });
}
