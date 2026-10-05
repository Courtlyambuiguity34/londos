import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { coreConfigured, coreConfig } from "./config";
import { transaction } from "./db/pool";
import {
  requireShop,
  requireMerchant,
  requireOperator,
  type Actor,
} from "./security/authorization";
import { eligibilityJoins, eligibleStates } from "./public-eligibility";
import { AccessError } from "./security/errors";
import {
  pilotContext,
  captureInput,
  type PilotContext,
  type CaptureInput,
} from "../modules/analytics/contract";

export function pilotPolicy() {
  const days = Number(process.env.LONDOS_PILOT_RETENTION_DAYS ?? 30);
  const valid = Number.isInteger(days) && days >= 7 && days <= 90;
  let local = false;
  try {
    local = coreConfigured() && coreConfig().localAdapters;
  } catch {
    /* Fail closed. */
  }
  return {
    enabled:
      valid &&
      local &&
      process.env.LONDOS_DATA_SOURCE === "database" &&
      process.env.LONDOS_PILOT_ANALYTICS === "true",
    retentionDays: valid ? days : 30,
    valid,
    developmentOnly: true as const,
  };
}
const envelope = z
  .object({ id: z.uuid(), until: z.number().int().positive(), context: pilotContext })
  .strict();
function signature(encoded: string) {
  return createHmac("sha256", coreConfig().secret)
    .update(`londos-pilot-v1:${coreConfig().baseURL}:${encoded}`)
    .digest();
}
export function renderPilotContext(context: PilotContext) {
  if (!pilotPolicy().enabled) return null;
  try {
    const value = pilotContext.parse(context);
    const encoded = Buffer.from(
      JSON.stringify({ id: randomUUID(), until: Date.now() + 1_800_000, context: value }),
    ).toString("base64url");
    return { context: value, token: `${encoded}.${signature(encoded).toString("base64url")}` };
  } catch {
    return null;
  }
}
function decode(token: string) {
  const parts = token.split(".");
  if (parts.length !== 2) throw new AccessError(422, "invalid_context");
  const expected = signature(parts[0]!),
    supplied = Buffer.from(parts[1]!, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    throw new AccessError(422, "invalid_context");
  let value: z.infer<typeof envelope>;
  try {
    value = envelope.parse(JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")));
  } catch {
    throw new AccessError(422, "invalid_context");
  }
  if (value.until <= Date.now() || value.until > Date.now() + 1_800_000)
    throw new AccessError(422, "context_expired");
  return value;
}
export function excludedPilotTraffic(headers: Headers) {
  return (
    headers.get("dnt") === "1" ||
    headers.get("sec-gpc") === "1" ||
    /bot|crawler|spider|headlesschrome|playwright|lighthouse|monitoring/i.test(
      headers.get("user-agent") ?? "",
    ) ||
    /(?:^|;\s*)(?:__Secure-)?better-auth\.(?:session_token|two_factor)=/.test(
      headers.get("cookie") ?? "",
    )
  );
}
const globalPilot = globalThis as unknown as { pilotPool?: Pool };
export function pilotDatabase() {
  if (!globalPilot.pilotPool) {
    const pool = new Pool({
      connectionString: coreConfig().databaseUrl,
      max: 2,
      connectionTimeoutMillis: 250,
      idleTimeoutMillis: 10_000,
      statement_timeout: 500,
      application_name: "londos-pilot",
    });
    pool.on("error", () => {});
    globalPilot.pilotPool = pool;
  }
  return globalPilot.pilotPool;
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export async function storePilotEvent(pool: Pool, headers: Headers, input: CaptureInput) {
  if (!pilotPolicy().enabled || excludedPilotTraffic(headers)) return false;
  const v = captureInput.parse(input),
    signed = decode(v.token),
    c = signed.context;
  const directory = ["mall", "search"].includes(c.page);
  const allowed =
    v.event === "mall_visit"
      ? c.page === "mall"
      : v.event === "search_results_viewed"
        ? c.page === "search"
        : v.event === "search_submitted"
          ? c.page !== "contact"
          : v.event === "shop_result_clicked"
            ? directory && v.target !== null && c.shops.includes(v.target)
            : v.event === "shop_viewed"
              ? ["shop", "department", "product"].includes(c.page)
              : v.event === "department_viewed"
                ? c.page === "department" && c.departmentId !== null
                : v.event === "product_viewed"
                  ? c.page === "product" && c.productId !== null
                  : v.event === "contact_action_clicked"
                    ? !directory &&
                      c.shopId !== null &&
                      v.channel !== null &&
                      c.channels.includes(v.channel)
                    : v.event === "direct_link_entry"
                      ? ["shop", "department", "product"].includes(c.page) &&
                        c.shopId !== null &&
                        v.source === "direct"
                      : false;
  const platform = ["mall_visit", "search_submitted", "search_results_viewed"].includes(v.event);
  if (
    !allowed ||
    (v.event === "shop_result_clicked" ? v.target === null : v.target !== null) ||
    (v.event === "contact_action_clicked") !== (v.channel !== null) ||
    (v.event === "shop_result_clicked" && c.globalDiscovery && v.source !== "discovery") ||
    (platform ? v.source !== null : v.source === null)
  )
    throw new AccessError(422, "event_context_denied");
  const shopId = platform ? null : (v.target ?? c.shopId);
  if (!platform && !shopId) throw new AccessError(422, "event_context_denied");
  const detail =
    v.event === "search_results_viewed"
      ? c.resultCount === 0
        ? "empty"
        : c.resultCount <= 5
          ? "few"
          : "many"
      : (v.channel ?? "none");
  const receipt = digest(JSON.stringify([signed.id, v.event, shopId, v.channel])),
    fingerprint = digest(JSON.stringify([shopId, v.event, v.source, detail]));
  return transaction(pool, async (db) => {
    await db.query("SET LOCAL statement_timeout='500ms'");
    await db.query("SET LOCAL lock_timeout='200ms'");
    let merchantId: string | null = null;
    if (shopId) {
      const shop = await db.query(
        `SELECT s.merchant_id FROM shops s ${eligibilityJoins} JOIN shop_designs sd ON sd.shop_id=s.id AND sd.published_id IS NOT NULL WHERE s.id=$1 AND ${eligibleStates}`,
        [shopId],
      );
      if (!shop.rowCount) return false;
      merchantId = shop.rows[0].merchant_id;
      // Serialize with governed erasure; recheck the exclusion after any wait.
      await db.query("SELECT id FROM merchants WHERE id=$1 FOR SHARE", [merchantId]);
      if (
        (await db.query("SELECT 1 FROM shop_privacy_exclusions WHERE shop_id=$1", [shopId]))
          .rowCount
      )
        return false;
      if (c.shopId && (c.departmentId || c.productId)) {
        const resource = c.productId
          ? await db.query(
              "SELECT 1 FROM products p JOIN departments d ON d.id=p.department_id AND d.archived=false WHERE p.id=$1 AND p.shop_id=$2 AND p.availability<>'archived'",
              [c.productId, shopId],
            )
          : await db.query(
              "SELECT 1 FROM departments WHERE id=$1 AND shop_id=$2 AND archived=false",
              [c.departmentId, shopId],
            );
        if (!resource.rowCount) return false;
      }
    }
    const inserted = await db.query(
      "INSERT INTO pilot_receipts(id,fingerprint,expires_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",
      [receipt, fingerprint, new Date(signed.until)],
    );
    if (!inserted.rowCount) return false;
    for (const [key, limit] of [
      ["pilot:global", 2000],
      [`pilot:${digest(signed.id)}`, 30],
    ] as const) {
      const budget = await db.query(
        `INSERT INTO request_budgets(key,window_id,count) VALUES($1,floor(extract(epoch FROM now())/60)::bigint,1) ON CONFLICT(key,window_id) DO UPDATE SET count=request_budgets.count+1 WHERE request_budgets.count<$2 RETURNING count`,
        [key, limit],
      );
      if (!budget.rowCount) throw new AccessError(429, "rate_limit_exceeded");
    }
    await db.query(
      `INSERT INTO pilot_metrics(day,shop_id,merchant_id,event,source,detail,count) VALUES((clock_timestamp() AT TIME ZONE 'UTC')::date,$1,$2,$3,$4,$5,1) ON CONFLICT(day,shop_id,event,source,detail) DO UPDATE SET count=pilot_metrics.count+1`,
      [shopId, merchantId, v.event, v.source ?? "none", detail],
    );
    return true;
  });
}
export async function cleanupPilotMetrics(db: PoolClient) {
  const policy = pilotPolicy(),
    days = policy.retentionDays;
  const receipts = await db.query(
    "DELETE FROM pilot_receipts WHERE id IN (SELECT id FROM pilot_receipts WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT 1000)",
  );
  if (!policy.valid) return { receipts: receipts.rowCount, metrics: 0 };
  const metrics = await db.query(
    "DELETE FROM pilot_metrics WHERE ctid IN (SELECT ctid FROM pilot_metrics WHERE day<(clock_timestamp() AT TIME ZONE 'UTC')::date-($1::integer-1) ORDER BY day LIMIT 1000)",
    [days],
  );
  return { receipts: receipts.rowCount, metrics: metrics.rowCount };
}
const windowInput = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export async function shopPilotAccess(db: Pool | PoolClient, actor: Actor, shopId: string) {
  if (!coreConfig().localAdapters) throw new Error("local_analytics_only");
  z.uuid().parse(shopId);
  const shop = await requireShop(db, actor, shopId, "catalogue");
  await requireMerchant(db, actor, shop.merchant_id, "membership");
  return shop;
}
export type PilotRow = { event: string; source: string; detail: string; count: string };
async function counters(db: PoolClient, days: number, shopId: string | null) {
  return (
    await db.query(
      `SELECT event,source,detail,sum(count)::text AS count FROM pilot_metrics WHERE day>=(clock_timestamp() AT TIME ZONE 'UTC')::date-($1::integer-1) AND day<=(clock_timestamp() AT TIME ZONE 'UTC')::date AND ($2::uuid IS NULL OR shop_id=$2) GROUP BY event,source,detail ORDER BY event,source,detail LIMIT 100`,
      [days, shopId],
    )
  ).rows as PilotRow[];
}
async function activity(db: PoolClient, days: number, shopId: string | null) {
  return (
    await db.query(
      `WITH relevant AS (
    SELECT a.action FROM audit_events a JOIN shop_revisions r ON r.id::text=a.resource_id AND r.merchant_id=a.merchant_id WHERE a.action='shop.design.published' AND ($2::uuid IS NULL OR r.shop_id=$2) AND a.created_at>=(clock_timestamp() AT TIME ZONE 'UTC')::date-($1::integer-1)
    UNION ALL SELECT a.action FROM audit_events a JOIN products p ON p.id::text=a.resource_id AND p.merchant_id=a.merchant_id WHERE a.action='catalogue.product.saved' AND ($2::uuid IS NULL OR p.shop_id=$2) AND a.created_at>=(clock_timestamp() AT TIME ZONE 'UTC')::date-($1::integer-1)
    UNION ALL SELECT a.action FROM audit_events a JOIN departments d ON d.id::text=a.resource_id AND d.merchant_id=a.merchant_id WHERE a.action='catalogue.department.saved' AND ($2::uuid IS NULL OR d.shop_id=$2) AND a.created_at>=(clock_timestamp() AT TIME ZONE 'UTC')::date-($1::integer-1))
    SELECT CASE WHEN action='shop.design.published' THEN 'merchant_publish' ELSE 'merchant_catalogue_update' END AS event,'canonical' AS source,'none' AS detail,count(*)::text AS count FROM relevant GROUP BY event ORDER BY event`,
      [days, shopId],
    )
  ).rows as PilotRow[];
}
export async function readShopPilot(pool: Pool, actor: Actor, shopId: string, window = 30) {
  windowInput.parse(window);
  return transaction(pool, async (db) => {
    const first = await shopPilotAccess(db, actor, shopId);
    await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
    const shop = await shopPilotAccess(db, actor, shopId);
    await db.query("SET LOCAL statement_timeout='2000ms'");
    const policy = pilotPolicy(),
      days = Math.min(window, policy.retentionDays);
    return {
      policy,
      days,
      shop: { name: shop.name },
      observations: await counters(db, days, shopId),
      canonical: await activity(db, days, shopId),
    };
  });
}
export async function readOperatorPilot(pool: Pool, actor: Actor, window = 30) {
  windowInput.parse(window);
  if (!coreConfig().localAdapters) throw new Error("local_analytics_only");
  return transaction(pool, async (db) => {
    await requireOperator(db, actor, "analytics", true);
    await db.query("SET LOCAL statement_timeout='2000ms'");
    const policy = pilotPolicy(),
      days = Math.min(window, policy.retentionDays);
    const cutoff = `(clock_timestamp() AT TIME ZONE 'UTC')::date-($1::integer-1)`;
    const activation = (
      await db.query(
        `SELECT count(*)::text AS applications,count(*) FILTER(WHERE provisioned_shop_id IS NOT NULL)::text AS provisioned FROM applications WHERE created_at>=${cutoff}`,
        [days],
      )
    ).rows[0] as { applications: string; provisioned: string };
    const firstPublish = (
      await db.query(
        `SELECT count(*)::text AS measured,percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM p.first_at-a.created_at)) AS median_seconds FROM applications a JOIN LATERAL(SELECT min(e.created_at) AS first_at FROM audit_events e JOIN shop_revisions r ON r.id::text=e.resource_id AND r.shop_id=a.provisioned_shop_id AND r.merchant_id=e.merchant_id WHERE e.action='shop.design.published') p ON p.first_at>=a.created_at WHERE a.created_at>=${cutoff}`,
        [days],
      )
    ).rows[0] as { measured: string; median_seconds: number | null };
    const renewal = (
      await db.query(
        `WITH credits AS(SELECT i.id,i.amount_minor,s.finalized,coalesce(sum(CASE WHEN e.kind='payment' OR original.kind='payment' THEN e.amount_minor ELSE 0 END),0) AS paid,coalesce(sum(CASE WHEN e.kind='waiver' OR original.kind='waiver' THEN e.amount_minor ELSE 0 END),0) AS waived FROM invoices i JOIN rent_invoice_state s ON s.invoice_id=i.id AND s.kind='renewal' LEFT JOIN rent_events e ON e.invoice_id=i.id LEFT JOIN rent_reversals rr ON rr.reversal_event_id=e.id LEFT JOIN rent_events original ON original.id=rr.original_event_id WHERE i.created_at>=${cutoff} GROUP BY i.id,s.finalized)
      SELECT count(*)::text AS issued,count(*) FILTER(WHERE finalized AND paid>=amount_minor)::text AS fully_paid,count(*) FILTER(WHERE finalized AND paid<amount_minor AND paid+waived>=amount_minor)::text AS waiver_supported FROM credits`,
        [days],
      )
    ).rows[0] as { issued: string; fully_paid: string; waiver_supported: string };
    const backlog = (
      await db.query(
        `SELECT 'incident' AS workflow,kind,state,count(*)::text AS count,floor(extract(epoch FROM clock_timestamp()-min(created_at)))::text AS oldest_seconds FROM incident_cases WHERE state NOT IN ('resolved','cancelled') GROUP BY kind,state UNION ALL SELECT 'trust' AS workflow,'moderation' AS kind,state,count(*)::text AS count,floor(extract(epoch FROM clock_timestamp()-min(created_at)))::text AS oldest_seconds FROM trust_cases WHERE state NOT IN ('dismissed','reinstated') GROUP BY state ORDER BY workflow,kind,state LIMIT 50`,
      )
    ).rows as {
      workflow: string;
      kind: string;
      state: string;
      count: string;
      oldest_seconds: string;
    }[];
    const observations = await counters(db, days, null),
      canonical = await activity(db, days, null);
    await requireOperator(db, actor, "analytics", true);
    return { policy, days, observations, canonical, activation, firstPublish, renewal, backlog };
  });
}
