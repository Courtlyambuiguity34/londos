import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { coreConfig } from "./config";
import { transaction } from "./db/pool";
import {
  requireMerchant,
  requireOperator,
  requireShop,
  type Actor,
} from "./security/authorization";
import { AccessError } from "./security/errors";
import { fingerprint, currentVersion } from "./lifecycle-common";
import { audit } from "./security/audit";
import { costWindow, costCursor, costClaim, costCommand } from "../modules/costs/contract";
type Queryable = Pool | PoolClient;
function local() {
  if (!coreConfig().localAdapters) throw new AccessError(403, "local_costs_only");
}
export async function ownerCostAccess(db: Queryable, actor: Actor, id: string) {
  local();
  z.uuid().parse(id);
  const shop = await requireShop(db, actor, id, "catalogue");
  await requireMerchant(db, actor, shop.merchant_id, "membership");
  return shop;
}
export async function operatorCostAccess(db: Queryable, actor: Actor, id: string, scoped = true) {
  local();
  z.uuid().parse(id);
  await requireOperator(db, actor, "costs", true);
  const shop = (await db.query("SELECT id,merchant_id,name,version FROM shops WHERE id=$1", [id]))
    .rows[0] as { id: string; merchant_id: string; name: string; version: number } | undefined;
  if (!shop) throw new AccessError(404, "resource_unavailable");
  if (
    (
      await db.query(
        "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND status='active'",
        [shop.merchant_id, actor.userId],
      )
    ).rowCount
  )
    throw new AccessError(403, "conflict_of_interest");
  if (
    scoped &&
    !(
      await db.query(
        "SELECT 1 FROM operator_cost_scopes WHERE user_id=$1 AND shop_id=$2 AND merchant_id=$3",
        [actor.userId, id, shop.merchant_id],
      )
    ).rowCount
  )
    throw new AccessError(404, "resource_unavailable");
  return shop;
}
async function lock(db: PoolClient, actor: Actor, id: string, owner: boolean, scoped = true) {
  const access = () =>
    owner ? ownerCostAccess(db, actor, id) : operatorCostAccess(db, actor, id, scoped);
  const first = await access();
  await db.query("SET LOCAL statement_timeout='2000ms'");
  await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
  await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [actor.userId]);
  return access();
}
const limits = {
  media:
    "Logical managed SQL blob bytes now; excludes physical DB overhead, fixtures/external files, WAL, backups and replication. Reserved quota is headroom, not stored bytes.",
  jobs: "Current queue state and counters only. Authorized replay resets attempts; counts are not lifetime executions, wall time, CPU or charges. Shared jobs are not allocated to shops.",
  reported:
    "Operator-reported minutes and UGX expenses, net of linked corrections by original UTC work day. Completeness is unknown; these are not independently verified provider measurements or merchant charges.",
};
const unavailable = [
  {
    source: "bandwidth",
    reason: "No ingress/CDN byte meter or provider billing source configured.",
  },
  {
    source: "AI usage and charges",
    reason: "AI/provider integration is not implemented; absence is not a zero-cost measurement.",
  },
  {
    source: "compute and storage charges",
    reason:
      "No approved price rates or provider bill integration; bytes and job counts do not establish money cost.",
  },
  {
    source: "independently measured staff time",
    reason:
      "Only explicitly operator-reported work is available; case age and queue latency are not working time.",
  },
  {
    source: "live rent collection fees",
    reason:
      "Collection is disabled; manually reported development expenses are separate from rent credits.",
  },
];
export type ResourceSnapshot = {
  assets: { state: string; count: string }[];
  blobs: { variant: string; count: string; bytes: string }[];
  quota: { stored_bytes: string; reserved_bytes: string; asset_count: number } | null;
  jobs: { state: string; count: string; attempt_counter_sum: string }[];
};
async function resourceSnapshot(
  db: PoolClient,
  id: string,
  merchant: string,
): Promise<ResourceSnapshot> {
  const assets = (
    await db.query(
      "SELECT state,count(*)::text AS count FROM media_assets WHERE shop_id=$1 AND merchant_id=$2 AND created_by IS NOT NULL AND state<>'deleted' GROUP BY state ORDER BY state",
      [id, merchant],
    )
  ).rows;
  const blobs = (
    await db.query(
      "SELECT b.variant,count(*)::text AS count,sum(octet_length(b.bytes))::text AS bytes FROM media_assets a JOIN media_blobs b ON b.asset_id=a.id WHERE a.shop_id=$1 AND a.merchant_id=$2 AND a.created_by IS NOT NULL AND a.state<>'deleted' GROUP BY b.variant ORDER BY b.variant",
      [id, merchant],
    )
  ).rows;
  const quota =
    (
      await db.query(
        "SELECT stored_bytes::text,reserved_bytes::text,asset_count FROM media_quotas WHERE shop_id=$1",
        [id],
      )
    ).rows[0] ?? null;
  const jobs = (
    await db.query(
      "SELECT state,count(*)::text AS count,sum(attempts)::text AS attempt_counter_sum FROM jobs WHERE shop_id=$1 AND merchant_id=$2 GROUP BY state ORDER BY state",
      [id, merchant],
    )
  ).rows;
  return { assets, blobs, quota, jobs };
}
export type ReportedTotals = {
  category: string;
  recorded_entries: string;
  corrections: string;
  net_minutes: string;
  net_expense_minor: string;
}[];
async function reported(db: PoolClient, days: number, id: string | null): Promise<ReportedTotals> {
  return (
    await db.query(
      "SELECT category,count(*) FILTER(WHERE reverses_id IS NULL)::text AS recorded_entries,count(*) FILTER(WHERE reverses_id IS NOT NULL)::text AS corrections,sum(minutes)::text AS net_minutes,sum(expense_minor)::text AS net_expense_minor FROM resource_cost_entries WHERE work_day>=(clock_timestamp() AT TIME ZONE 'UTC')::date-($1::integer-1) AND work_day<=(clock_timestamp() AT TIME ZONE 'UTC')::date AND ($2::uuid IS NULL OR shop_id=$2) GROUP BY category ORDER BY category",
      [days, id],
    )
  ).rows;
}
async function snapshot(db: PoolClient, id: string, merchant: string, days: number) {
  return {
    asOf: new Date().toISOString(),
    days,
    currency: "UGX" as const,
    resource: await resourceSnapshot(db, id, merchant),
    reported: await reported(db, days, id),
    limits,
    unavailable,
  };
}
export async function readOwnerCosts(pool: Pool, actor: Actor, id: string, days = 30) {
  costWindow.parse(days);
  return transaction(pool, async (db) => {
    const shop = await lock(db, actor, id, true),
      result = await snapshot(db, id, shop.merchant_id, days);
    await ownerCostAccess(db, actor, id);
    return { ...result, shop: { name: shop.name } };
  });
}
export async function readOperatorCosts(
  pool: Pool,
  actor: Actor,
  days = 30,
  after: string | null = null,
) {
  local();
  costWindow.parse(days);
  costCursor.parse(after);
  return transaction(pool, async (db) => {
    await requireOperator(db, actor, "costs", true);
    await db.query("SET LOCAL statement_timeout='2000ms'");
    const media = (
      await db.query(
        "SELECT count(*)::text AS blobs,coalesce(sum(octet_length(b.bytes)),0)::text AS bytes FROM media_blobs b JOIN media_assets a ON a.id=b.asset_id WHERE a.created_by IS NOT NULL AND a.state<>'deleted'",
      )
    ).rows[0] as { blobs: string; bytes: string };
    const evidence = (
      await db.query(
        "SELECT 'application' AS category,count(*)::text AS blobs,coalesce(sum(octet_length(bytes)),0)::text AS bytes FROM application_evidence UNION ALL SELECT 'trust' AS category,count(*)::text AS blobs,coalesce(sum(octet_length(bytes)),0)::text AS bytes FROM trust_evidence ORDER BY category",
      )
    ).rows as { category: string; blobs: string; bytes: string }[];
    const quota = (
      await db.query(
        "SELECT coalesce(sum(stored_bytes),0)::text AS stored_bytes,coalesce(sum(reserved_bytes),0)::text AS reserved_bytes FROM media_quotas",
      )
    ).rows[0] as { stored_bytes: string; reserved_bytes: string };
    const jobs = (
      await db.query(
        "SELECT CASE WHEN shop_id IS NOT NULL THEN 'shop-bound' WHEN merchant_id IS NOT NULL THEN 'merchant-shared' ELSE 'platform-shared' END AS scope,state,count(*)::text AS count,sum(attempts)::text AS attempt_counter_sum FROM jobs GROUP BY scope,state ORDER BY scope,state",
      )
    ).rows as { scope: string; state: string; count: string; attempt_counter_sum: string }[];
    const rows = (
      await db.query(
        "SELECT s.id,s.name,s.version AS shop_version,EXISTS(SELECT 1 FROM operator_cost_scopes c WHERE c.shop_id=s.id AND c.merchant_id=s.merchant_id AND c.user_id=$1) AS scoped FROM shops s WHERE s.id>$2 AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.merchant_id=s.merchant_id AND m.user_id=$1 AND m.status='active') ORDER BY s.id LIMIT 21",
        [actor.userId, after ?? "00000000-0000-0000-0000-000000000000"],
      )
    ).rows as { id: string; name: string; shop_version: number; scoped: boolean }[];
    const totals = await reported(db, days, null);
    await requireOperator(db, actor, "costs", true);
    return {
      asOf: new Date().toISOString(),
      days,
      currency: "UGX" as const,
      media,
      evidence,
      quota,
      jobs,
      reported: totals,
      shops: rows.slice(0, 20),
      nextAfter: rows.length > 20 ? rows[19]!.id : null,
      limits,
      unavailable,
    };
  });
}
export async function claimCostScope(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof costClaim>,
) {
  const v = costClaim.parse(input);
  return transaction(pool, async (db) => {
    const shop = await lock(db, actor, id, false, false);
    currentVersion(shop.version, v.shopVersion);
    const inserted = await db.query(
      "INSERT INTO operator_cost_scopes(user_id,shop_id,merchant_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [actor.userId, id, shop.merchant_id],
    );
    if (inserted.rowCount)
      await audit(db, actor, "cost.scope.claimed", id, shop.merchant_id, { reason: v.reason });
    await operatorCostAccess(db, actor, id);
    return { id };
  });
}
export type CostEntry = {
  id: string;
  category: string;
  work_day: string;
  minutes: number;
  expense_minor: string;
  reason: string;
  reverses_id: string | null;
  created_at: Date;
  reversed: boolean;
};
export async function readCostJournal(
  pool: Pool,
  actor: Actor,
  id: string,
  days = 30,
  after: string | null = null,
) {
  costWindow.parse(days);
  costCursor.parse(after);
  return transaction(pool, async (db) => {
    const shop = await lock(db, actor, id, false),
      result = await snapshot(db, id, shop.merchant_id, days);
    const version =
      (
        await db.query("SELECT version FROM shop_cost_state WHERE shop_id=$1 AND merchant_id=$2", [
          id,
          shop.merchant_id,
        ])
      ).rows[0]?.version ?? 0;
    const rows = (
      await db.query(
        "SELECT e.id,e.category,e.work_day::text,e.minutes,e.expense_minor::text,e.reason,e.reverses_id,e.created_at,EXISTS(SELECT 1 FROM resource_cost_entries r WHERE r.reverses_id=e.id) AS reversed FROM resource_cost_entries e WHERE e.shop_id=$1 AND e.merchant_id=$2 AND e.id>$3 ORDER BY e.id LIMIT 21",
        [id, shop.merchant_id, after ?? "00000000-0000-0000-0000-000000000000"],
      )
    ).rows as CostEntry[];
    await operatorCostAccess(db, actor, id);
    return {
      ...result,
      shop: { id, name: shop.name },
      version,
      entries: rows.slice(0, 20),
      nextAfter: rows.length > 20 ? rows[19]!.id : null,
    };
  });
}
export async function writeCostEntry(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof costCommand>,
) {
  const v = costCommand.parse(input);
  return transaction(pool, async (db) => {
    const shop = await lock(db, actor, id, false),
      digest = fingerprint({ shopId: id, ...v });
    const previous = (
      await db.query(
        "SELECT id,fingerprint FROM resource_cost_entries WHERE actor_id=$1 AND request_key=$2",
        [actor.userId, v.key],
      )
    ).rows[0];
    if (previous) {
      if (previous.fingerprint !== digest) throw new AccessError(409, "retry_payload_changed");
      return { id: previous.id as string };
    }
    await db.query(
      "INSERT INTO shop_cost_state(shop_id,merchant_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [id, shop.merchant_id],
    );
    const state = (
      await db.query("SELECT version FROM shop_cost_state WHERE shop_id=$1 AND merchant_id=$2", [
        id,
        shop.merchant_id,
      ])
    ).rows[0];
    currentVersion(state.version, v.version);
    let category: string,
      day: string,
      minutes: number,
      expense: string,
      original: string | null = null;
    if (v.action === "record") {
      if (
        !(
          await db.query(
            "SELECT 1 WHERE $1::date BETWEEN (clock_timestamp() AT TIME ZONE 'UTC')::date-89 AND (clock_timestamp() AT TIME ZONE 'UTC')::date",
            [v.workDay],
          )
        ).rowCount
      )
        throw new AccessError(422, "work_day_outside_window");
      if (
        Number(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM resource_cost_entries WHERE shop_id=$1 AND reverses_id IS NULL AND created_at>=((clock_timestamp() AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'UTC')",
              [id],
            )
          ).rows[0].n,
        ) >= 100
      )
        throw new AccessError(429, "daily_reporting_limit");
      category = v.category;
      day = v.workDay;
      minutes = v.minutes;
      expense = String(v.expenseMinor);
    } else {
      const entry = (
        await db.query(
          "SELECT category,work_day::text,minutes,expense_minor::text,reverses_id FROM resource_cost_entries WHERE id=$1 AND shop_id=$2 AND merchant_id=$3",
          [v.originalId, id, shop.merchant_id],
        )
      ).rows[0];
      if (!entry) throw new AccessError(404, "resource_unavailable");
      if (
        entry.reverses_id ||
        (await db.query("SELECT 1 FROM resource_cost_entries WHERE reverses_id=$1", [v.originalId]))
          .rowCount
      )
        throw new AccessError(409, "cost_entry_already_reversed");
      category = entry.category;
      day = entry.work_day;
      minutes = -entry.minutes;
      expense = (-BigInt(entry.expense_minor)).toString();
      original = v.originalId;
    }
    const entryId = randomUUID();
    await db.query(
      "INSERT INTO resource_cost_entries(id,merchant_id,shop_id,actor_id,request_key,fingerprint,category,work_day,minutes,currency,expense_minor,reason,reverses_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'UGX',$10,$11,$12)",
      [
        entryId,
        shop.merchant_id,
        id,
        actor.userId,
        v.key,
        digest,
        category,
        day,
        minutes,
        expense,
        v.reason,
        original,
      ],
    );
    await db.query(
      "UPDATE shop_cost_state SET version=version+1 WHERE shop_id=$1 AND merchant_id=$2",
      [id, shop.merchant_id],
    );
    await audit(
      db,
      actor,
      original ? "cost.reported.reversed" : "cost.reported.recorded",
      entryId,
      shop.merchant_id,
      { category },
    );
    await operatorCostAccess(db, actor, id);
    return { id: entryId };
  });
}
