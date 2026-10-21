import { createHmac, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { coreConfig } from "./config";
import { transaction } from "./db/pool";
import { requireDevelopmentDatabase } from "./db/development";
import { requireMerchant, requireOperator, type Actor } from "./security/authorization";
import { AccessError } from "./security/errors";
import { audit } from "./security/audit";
import { enqueue } from "./jobs/enqueue";
import type { Job } from "./jobs/queue";
import { currentVersion, fingerprint as stableFingerprint } from "./lifecycle-common";
import { pilotPolicy } from "./analytics";
import {
  privacyOwnerCommand,
  privacyClaim,
  privacyCommand,
  exportInput,
  type PrivacyKind,
} from "../modules/privacy/contract";

export const privacyPolicyId = "91000000-0000-4000-8000-000000000001";
const closed = ["completed", "denied", "cancelled"];
type Queryable = Pool | PoolClient;
function privacyAccessConfiguration() {
  coreConfig();
}
export function privacyErasureEnabled() {
  try {
    return coreConfig().localAdapters && process.env.LONDOS_PRIVACY_ERASURE === "true";
  } catch {
    return false;
  }
}
const hash = (value: unknown) =>
  createHmac("sha256", coreConfig().secret)
    .update(`privacy-v1:${JSON.stringify(value)}`)
    .digest("hex");
type PrivacyRow = {
  id: string;
  merchant_id: string;
  requester_id: string;
  kind: PrivacyKind;
  target_id: string;
  request_key: string;
  fingerprint: string;
  requester_reason: string;
  policy_id: string;
  state: string;
  version: number;
  assigned_user: string | null;
  public_reason: string;
  approval_session: string | null;
  approval_until: Date | null;
  approval_hash: string | null;
  result: Record<string, unknown>;
  created_at: Date;
};
const columns =
  "id,merchant_id,requester_id,kind,target_id,request_key,fingerprint,requester_reason,policy_id,state,version,assigned_user,public_reason,approval_session,approval_until,approval_hash,result,created_at";
async function requestRow(db: Queryable, id: string) {
  z.uuid().parse(id);
  const row = (await db.query(`SELECT ${columns} FROM privacy_requests WHERE id=$1`, [id]))
    .rows[0] as PrivacyRow | undefined;
  if (!row) throw new AccessError(404, "resource_unavailable");
  return row;
}
export async function privacyOwnerAccess(db: Queryable, actor: Actor, merchantId: string) {
  privacyAccessConfiguration();
  z.uuid().parse(merchantId);
  await requireMerchant(db, actor, merchantId, "membership");
}
async function ownerLock(db: PoolClient, actor: Actor, merchantId: string) {
  await privacyOwnerAccess(db, actor, merchantId);
  await db.query("SET LOCAL statement_timeout='2000ms'");
  await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchantId]);
  await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [actor.userId]);
  await privacyOwnerAccess(db, actor, merchantId);
  await db.query("SET LOCAL statement_timeout='2000ms'");
}
async function targetAccess(
  db: Queryable,
  actor: Actor,
  merchantId: string,
  kind: PrivacyKind,
  id: string,
) {
  const sql =
    kind === "enquiry"
      ? "SELECT id FROM guest_requests WHERE id=$1 AND merchant_id=$2"
      : kind === "verification"
        ? "SELECT id FROM applications WHERE id=$1 AND merchant_id=$2 AND applicant_id=$3"
        : "SELECT id FROM shops WHERE id=$1 AND merchant_id=$2";
  if (
    !(
      await db.query(
        sql,
        kind === "verification" ? [id, merchantId, actor.userId] : [id, merchantId],
      )
    ).rowCount
  )
    throw new AccessError(404, "resource_unavailable");
}
async function history(
  db: PoolClient,
  actor: Actor,
  row: PrivacyRow,
  kind: string,
  reason: string,
  explanation = "",
) {
  await db.query(
    "INSERT INTO privacy_events(id,case_id,actor_id,kind,reason,public_reason) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), row.id, actor.userId, kind, reason, explanation],
  );
  await audit(db, actor, `privacy.${kind}`, row.id, row.merchant_id, { kind: row.kind });
}
async function update(db: PoolClient, row: PrivacyRow, state: string, explanation: string) {
  await db.query(
    "UPDATE privacy_requests SET state=$2,version=version+1,public_reason=$3,approval_session=NULL,approval_until=NULL,approval_hash=NULL,updated_at=clock_timestamp() WHERE id=$1",
    [row.id, state, explanation],
  );
}
async function held(db: Queryable, row: PrivacyRow) {
  return Boolean(
    (
      await db.query(
        "SELECT 1 FROM privacy_holds WHERE merchant_id=$1 AND kind=$2 AND target_id=$3 AND released_at IS NULL",
        [row.merchant_id, row.kind, row.target_id],
      )
    ).rowCount,
  );
}
type Plan = { eligible: boolean; reason: string; records: number; hash: string };
async function plan(db: PoolClient, row: PrivacyRow): Promise<Plan> {
  if (!coreConfig().localAdapters)
    return {
      eligible: false,
      reason:
        "This request requires manual review. Automatic erasure is disabled; retained records and external copies need separate assessment.",
      records: 0,
      hash: hash({ id: row.id, version: row.version }),
    };
  const policy = (
    await db.query(
      "SELECT terminal_days FROM privacy_policies WHERE id=$1 AND development_only=true",
      [row.policy_id],
    )
  ).rows[0] as { terminal_days: number } | undefined;
  if (!policy) throw new AccessError(409, "privacy_policy_unavailable");
  let eligible = false,
    reason =
      "Protected financial, account, investigation, contact and audit history is retained under this development policy.",
    records = 0,
    value: unknown = { kind: row.kind };
  if (row.kind === "enquiry") {
    const r = (
      await db.query(
        "SELECT id,version,status,closed_at,erased_at,name,reply_to,message,closed_at<=clock_timestamp()-($3::integer*interval '1 day') AS old_enough FROM guest_requests WHERE id=$1 AND merchant_id=$2",
        [row.target_id, row.merchant_id, policy.terminal_days],
      )
    ).rows[0];
    if (!r) throw new AccessError(404, "resource_unavailable");
    value = r;
    records = r.erased_at ? 0 : 1;
    eligible = r.status === "closed" && r.old_enough === true && !r.erased_at;
    reason = eligible
      ? "Remove primary enquiry name, reply address and message; retain minimal closed status and retry receipt."
      : `Only unerased enquiries closed for at least ${policy.terminal_days} days are eligible.`;
  } else if (row.kind === "verification") {
    const a = (
      await db.query(
        "SELECT id,version,state,applicant_id,updated_at,updated_at<=clock_timestamp()-($3::integer*interval '1 day') AS old_enough,EXISTS(SELECT 1 FROM invoices WHERE application_id=$1) OR EXISTS(SELECT 1 FROM rent_contracts WHERE application_id=$1) AS financial FROM applications WHERE id=$1 AND merchant_id=$2",
        [row.target_id, row.merchant_id, policy.terminal_days],
      )
    ).rows[0];
    if (!a) throw new AccessError(404, "resource_unavailable");
    const evidence = (
      await db.query(
        "SELECT slot,digest FROM application_evidence WHERE application_id=$1 ORDER BY slot",
        [row.target_id],
      )
    ).rows;
    value = { a, evidence };
    records = evidence.length;
    eligible =
      a.state === "rejected" &&
      a.applicant_id === row.requester_id &&
      a.old_enough === true &&
      !a.financial &&
      evidence.length > 0;
    reason = eligible
      ? "Remove rejected-application verification bytes; preserve application, submissions and audit metadata."
      : `Only your rejected applications with evidence, no financial references and at least ${policy.terminal_days} days since rejection are eligible.`;
  } else if (row.kind === "analytics") {
    const shop = (
      await db.query("SELECT id,version FROM shops WHERE id=$1 AND merchant_id=$2", [
        row.target_id,
        row.merchant_id,
      ])
    ).rows[0];
    if (!shop) throw new AccessError(404, "resource_unavailable");
    const metrics = (
      await db.query(
        "SELECT day::text,event,source,detail,count::text FROM pilot_metrics WHERE shop_id=$1 AND merchant_id=$2 ORDER BY day,event,source,detail LIMIT 5001",
        [row.target_id, row.merchant_id],
      )
    ).rows;
    const excluded = Boolean(
      (await db.query("SELECT 1 FROM shop_privacy_exclusions WHERE shop_id=$1", [row.target_id]))
        .rowCount,
    );
    value = { shop, metrics, excluded };
    records = metrics.length;
    eligible = !excluded && metrics.length <= 5000;
    reason = excluded
      ? "This shop's capture has already stopped."
      : metrics.length > 5000
        ? "More than 5,000 daily groups; bounded retention cleanup is required before review."
        : "Remove this shop's daily metrics and permanently stop future shop capture. Platform observations and canonical audit activity remain.";
  }
  if (await held(db, row)) {
    eligible = false;
    reason = "An active retention hold blocks erasure.";
  }
  return { eligible, reason, records, hash: hash({ value, policy: row.policy_id }) };
}
function summary(row: PrivacyRow) {
  return {
    id: row.id,
    kind: row.kind,
    target_id: row.target_id,
    state: row.state,
    version: row.version,
    public_reason: row.public_reason,
    result: row.result,
    created_at: row.created_at,
  };
}
export async function privacyInventory(pool: Pool, actor: Actor, merchantId: string) {
  return transaction(pool, async (db) => {
    await ownerLock(db, actor, merchantId);
    const shops = (
      await db.query(
        "SELECT id,name,EXISTS(SELECT 1 FROM shop_privacy_exclusions e WHERE e.shop_id=s.id) AS capture_stopped FROM shops s WHERE merchant_id=$1 ORDER BY id LIMIT 20",
        [merchantId],
      )
    ).rows as { id: string; name: string; capture_stopped: boolean }[];
    const enquiries = (
      await db.query(
        "SELECT id,kind,status,closed_at,erased_at FROM guest_requests WHERE merchant_id=$1 ORDER BY created_at DESC,id LIMIT 20",
        [merchantId],
      )
    ).rows as {
      id: string;
      kind: string;
      status: string;
      closed_at: Date | null;
      erased_at: Date | null;
    }[];
    const applications = (
      await db.query(
        "SELECT id,business_name,state FROM applications WHERE merchant_id=$1 AND applicant_id=$2 ORDER BY created_at DESC,id LIMIT 20",
        [merchantId, actor.userId],
      )
    ).rows as { id: string; business_name: string; state: string }[];
    const rows = (
      await db.query(
        `SELECT ${columns} FROM privacy_requests WHERE merchant_id=$1 AND requester_id=$2 ORDER BY created_at DESC,id LIMIT 20`,
        [merchantId, actor.userId],
      )
    ).rows as PrivacyRow[];
    const requests = [];
    for (const row of rows) {
      const events = (
        await db.query(
          "SELECT kind,public_reason,created_at FROM privacy_events WHERE case_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20",
          [row.id],
        )
      ).rows as { kind: string; public_reason: string; created_at: Date }[];
      requests.push({ ...summary(row), events });
    }
    await privacyOwnerAccess(db, actor, merchantId);
    return {
      merchantId,
      erasureEnabled: privacyErasureEnabled(),
      policy: coreConfig().localAdapters
        ? "Development manual review; 30 days after closure/rejection; protected history retained. No automatic deletion or approved live legal policy."
        : "Manual privacy review. Requests do not automatically delete records. Your reviewer will assess access, retention and any further action needed.",
      shops,
      enquiries,
      applications,
      requests,
      limit:
        "Newest 20 records per category; exports have explicit UUID pagination. Primary SQL effects do not erase backups, notifications, previous downloads or third-party copies.",
    };
  });
}
export async function ownerPrivacyCommand(
  pool: Pool,
  actor: Actor,
  merchantId: string,
  input: z.infer<typeof privacyOwnerCommand>,
) {
  const v = privacyOwnerCommand.parse(input);
  return transaction(pool, async (db) => {
    await ownerLock(db, actor, merchantId);
    if (v.action === "cancel") {
      const row = await requestRow(db, v.id);
      if (row.merchant_id !== merchantId || row.requester_id !== actor.userId)
        throw new AccessError(404, "resource_unavailable");
      currentVersion(row.version, v.version);
      if (closed.includes(row.state) || row.state === "approved")
        throw new AccessError(409, "privacy_request_not_cancellable");
      await update(
        db,
        row,
        "cancelled",
        "Cancelled by the requesting owner; any existing retention hold remains.",
      );
      await history(db, actor, row, "cancel", v.reason, "Cancelled by the requesting owner.");
      return { id: row.id };
    }
    await targetAccess(db, actor, merchantId, v.kind, v.target);
    const fingerprint = stableFingerprint({
      merchantId,
      kind: v.kind,
      target: v.target,
      reason: v.reason,
    });
    const prior = (
      await db.query(
        `SELECT ${columns} FROM privacy_requests WHERE requester_id=$1 AND request_key=$2`,
        [actor.userId, v.key],
      )
    ).rows[0] as PrivacyRow | undefined;
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new AccessError(409, "request_key_conflict");
      return { id: prior.id };
    }
    if (
      (
        await db.query(
          "SELECT count(*)::int AS n FROM privacy_requests WHERE merchant_id=$1 AND state NOT IN ('completed','denied','cancelled')",
          [merchantId],
        )
      ).rows[0].n >= 20
    )
      throw new AccessError(429, "privacy_request_limit");
    const id = randomUUID();
    await db.query(
      "INSERT INTO privacy_requests(id,merchant_id,requester_id,kind,target_id,request_key,fingerprint,requester_reason,policy_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        merchantId,
        actor.userId,
        v.kind,
        v.target,
        v.key,
        fingerprint,
        v.reason,
        coreConfig().localAdapters ? privacyPolicyId : "91000000-0000-4000-8000-000000000002",
      ],
    );
    await history(
      db,
      actor,
      await requestRow(db, id),
      "created",
      v.reason,
      "Requested; manual review and eligibility checks are required.",
    );
    return { id };
  });
}
export async function privacyOperatorAccess(
  db: Queryable,
  actor: Actor,
  id: string,
  scoped = true,
) {
  privacyAccessConfiguration();
  await requireOperator(db, actor, "privacy", true);
  const row = await requestRow(db, id);
  if (
    (
      await db.query(
        "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND status='active'",
        [row.merchant_id, actor.userId],
      )
    ).rowCount
  )
    throw new AccessError(403, "conflict_of_interest");
  if (
    scoped &&
    (row.assigned_user !== actor.userId ||
      !(
        await db.query("SELECT 1 FROM operator_privacy_scopes WHERE user_id=$1 AND case_id=$2", [
          actor.userId,
          id,
        ])
      ).rowCount)
  )
    throw new AccessError(404, "resource_unavailable");
  return row;
}
async function operatorLock(db: PoolClient, actor: Actor, id: string, scoped = true) {
  const first = await privacyOperatorAccess(db, actor, id, scoped);
  await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
  await db.query("SET LOCAL statement_timeout='2000ms'");
  return privacyOperatorAccess(db, actor, id, scoped);
}
export async function privacyQueue(pool: Pool, actor: Actor) {
  privacyAccessConfiguration();
  await requireOperator(pool, actor, "privacy", true);
  const rows = (
    await pool.query(
      "SELECT p.id,p.kind,p.state,p.version,p.created_at,p.assigned_user=$1 AS assigned_to_you FROM privacy_requests p WHERE p.state NOT IN ('completed','denied','cancelled') AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.merchant_id=p.merchant_id AND m.user_id=$1 AND m.status='active') ORDER BY p.created_at,p.id LIMIT 20",
      [actor.userId],
    )
  ).rows as {
    id: string;
    kind: string;
    state: string;
    version: number;
    created_at: Date;
    assigned_to_you: boolean;
  }[];
  await requireOperator(pool, actor, "privacy", true);
  return rows;
}
export async function claimPrivacy(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof privacyClaim>,
) {
  const v = privacyClaim.parse(input);
  return transaction(pool, async (db) => {
    const row = await operatorLock(db, actor, id, false);
    currentVersion(row.version, v.version);
    if (closed.includes(row.state)) throw new AccessError(409, "privacy_request_unclaimable");
    if (
      row.assigned_user &&
      (
        await db.query("SELECT 1 FROM operator_grants WHERE user_id=$1 AND permission='privacy'", [
          row.assigned_user,
        ])
      ).rowCount &&
      (
        await db.query("SELECT 1 FROM operator_privacy_scopes WHERE user_id=$1 AND case_id=$2", [
          row.assigned_user,
          id,
        ])
      ).rowCount
    )
      throw new AccessError(409, "privacy_request_unclaimable");
    await db.query("DELETE FROM operator_privacy_scopes WHERE case_id=$1", [id]);
    await db.query(
      "UPDATE privacy_requests SET state='reviewing',assigned_user=$2,approval_session=NULL,approval_until=NULL,approval_hash=NULL,version=version+1,updated_at=clock_timestamp() WHERE id=$1",
      [id, actor.userId],
    );
    await db.query("INSERT INTO operator_privacy_scopes(user_id,case_id) VALUES($1,$2)", [
      actor.userId,
      id,
    ]);
    await history(
      db,
      actor,
      row,
      "claimed",
      v.reason,
      "Assigned to an authorized privacy reviewer.",
    );
    return { id };
  });
}
export async function readPrivacy(pool: Pool, actor: Actor, id: string) {
  return transaction(pool, async (db) => {
    const row = await operatorLock(db, actor, id);
    const { hash: _hash, ...target } = await plan(db, row);
    void _hash;
    const events = (
      await db.query(
        "SELECT kind,reason,public_reason,created_at FROM privacy_events WHERE case_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20",
        [id],
      )
    ).rows as { kind: string; reason: string; public_reason: string; created_at: Date }[];
    const holds = (
      await db.query(
        "SELECT reason,created_at,released_at FROM privacy_holds WHERE merchant_id=$1 AND kind=$2 AND target_id=$3 ORDER BY created_at DESC,id LIMIT 20",
        [row.merchant_id, row.kind, row.target_id],
      )
    ).rows as { reason: string; created_at: Date; released_at: Date | null }[];
    const execution = (
      await db.query(
        "SELECT state FROM jobs WHERE dedupe_key LIKE $1 ORDER BY created_at DESC,id DESC LIMIT 1",
        [`privacy:${id}:%`],
      )
    ).rows[0]?.state as string | undefined;
    await privacyOperatorAccess(db, actor, id);
    return {
      request: { ...summary(row), requester_reason: row.requester_reason },
      target,
      events,
      holds,
      execution: execution ?? "not queued",
      erasureEnabled: privacyErasureEnabled(),
    };
  });
}
export async function commandPrivacy(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof privacyCommand>,
) {
  const v = privacyCommand.parse(input);
  if (v.action === "approve") {
    if (!privacyErasureEnabled()) throw new AccessError(403, "local_erasure_disabled");
    await requireDevelopmentDatabase(pool);
  }
  return transaction(pool, async (db) => {
    const row = await operatorLock(db, actor, id);
    currentVersion(row.version, v.version);
    if (closed.includes(row.state)) throw new AccessError(409, "privacy_request_closed");
    if (v.action === "hold") {
      if (await held(db, row)) throw new AccessError(409, "retention_hold_exists");
      await db.query(
        "INSERT INTO privacy_holds(id,case_id,merchant_id,kind,target_id,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [randomUUID(), id, row.merchant_id, row.kind, row.target_id, v.reason, actor.userId],
      );
      await update(db, row, "held", v.explanation);
    } else if (v.action === "release") {
      const released = await db.query(
        "UPDATE privacy_holds SET released_at=clock_timestamp(),released_by=$4 WHERE merchant_id=$1 AND kind=$2 AND target_id=$3 AND released_at IS NULL",
        [row.merchant_id, row.kind, row.target_id, actor.userId],
      );
      if (!released.rowCount) throw new AccessError(409, "retention_hold_missing");
      await update(db, row, "reviewing", v.explanation);
    } else if (v.action === "unassign") {
      await update(db, row, "requested", v.explanation);
      await db.query("DELETE FROM operator_privacy_scopes WHERE case_id=$1", [id]);
      await db.query("UPDATE privacy_requests SET assigned_user=NULL WHERE id=$1", [id]);
    } else if (v.action === "resolve") {
      if (row.state === "approved" || (await held(db, row)))
        throw new AccessError(409, "privacy_request_not_resolvable");
      await db.query(
        "UPDATE privacy_requests SET state='completed',version=version+1,public_reason=$3,result=$2,approval_session=NULL,approval_until=NULL,approval_hash=NULL,updated_at=clock_timestamp() WHERE id=$1",
        [id, { manualReviewCompleted: true, primaryDataErased: false }, v.explanation],
      );
    } else if (v.action === "deny") {
      await update(db, row, "denied", v.explanation);
    } else {
      const target = await plan(db, row);
      if (!target.eligible) throw new AccessError(409, "privacy_target_not_eligible");
      await db.query(
        "UPDATE privacy_requests SET state='approved',version=version+1,public_reason=$2,approval_session=$3,approval_until=clock_timestamp()+interval '5 minutes',approval_hash=$4,updated_at=clock_timestamp() WHERE id=$1",
        [id, v.explanation, actor.sessionId, target.hash],
      );
      await enqueue(db, {
        kind: "privacy.erase",
        key: `privacy:${id}:${row.version + 1}`,
        payload: { caseId: id, version: row.version + 1 },
        merchantId: row.merchant_id,
      });
    }
    await history(db, actor, row, v.action, v.reason, v.explanation);
    await privacyOperatorAccess(db, actor, id, v.action !== "unassign");
    return { id };
  });
}
export async function exportPrivacy(
  pool: Pool,
  actor: Actor,
  merchantId: string,
  input: z.infer<typeof exportInput>,
) {
  const v = exportInput.parse(input);
  return transaction(pool, async (db) => {
    await ownerLock(db, actor, merchantId);
    const after = v.after ?? "00000000-0000-0000-0000-000000000000";
    const sql: Record<Exclude<typeof v.section, "analytics">, string> = {
      shops:
        "SELECT s.id,s.name,s.slug,s.category,s.tagline,s.version FROM shops s WHERE s.merchant_id=$1 AND s.id>$2 ORDER BY s.id LIMIT 26",
      departments:
        "SELECT id,shop_id,name,slug,position,archived,version FROM departments WHERE merchant_id=$1 AND id>$2 ORDER BY id LIMIT 26",
      catalogue:
        "SELECT id,shop_id,department_id,name,slug,description,kind,currency,price_minor,availability,position,version FROM products WHERE merchant_id=$1 AND id>$2 ORDER BY id LIMIT 26",
      contacts:
        "SELECT shop_id AS id,version,phone,whatsapp,website,fulfilment,payment_instructions,delivery_instructions,enquiries_enabled FROM shop_contacts WHERE merchant_id=$1 AND shop_id>$2 ORDER BY shop_id LIMIT 26",
      invoices:
        "SELECT i.id,i.shop_id,i.currency,i.amount_minor,i.period_start,i.period_end,i.created_at,coalesce((SELECT sum(e.amount_minor)::text FROM rent_events e WHERE e.invoice_id=i.id),'0') AS net_credit_minor FROM invoices i WHERE i.merchant_id=$1 AND i.id>$2 ORDER BY i.id LIMIT 26",
      applications:
        "SELECT id,business_name,category,location,description,phone,state,version,created_at,provisioned_shop_id FROM applications WHERE merchant_id=$1 AND id>$2 AND applicant_id=$3 ORDER BY id LIMIT 26",
      incidents:
        "SELECT id,shop_id,kind,message,state,public_reason,created_at FROM incident_cases WHERE merchant_id=$1 AND id>$2 AND reporter_id=$3 ORDER BY id LIMIT 26",
    };
    let rows: Record<string, unknown>[], hasMore: boolean;
    if (v.section === "analytics") {
      const shops = (
        await db.query(
          "SELECT id,name FROM shops WHERE merchant_id=$1 AND id>$2 ORDER BY id LIMIT 2",
          [merchantId, after],
        )
      ).rows;
      hasMore = shops.length > 1;
      rows = [];
      if (shops[0]) {
        const observations = (
          await db.query(
            "SELECT event,source,detail,sum(count)::text AS count FROM pilot_metrics WHERE shop_id=$1 AND merchant_id=$2 AND day BETWEEN (clock_timestamp() AT TIME ZONE 'UTC')::date-($3::integer-1) AND (clock_timestamp() AT TIME ZONE 'UTC')::date GROUP BY event,source,detail ORDER BY event,source,detail LIMIT 100",
            [shops[0].id, merchantId, pilotPolicy().retentionDays],
          )
        ).rows;
        rows = [{ ...shops[0], observations }];
      }
    } else {
      const all = (
        await db.query(sql[v.section], [
          merchantId,
          after,
          ...(["applications", "incidents"].includes(v.section) ? [actor.userId] : []),
        ])
      ).rows;
      hasMore = all.length > 25;
      rows = all.slice(0, 25);
    }
    const result = {
      format: "londos-business-export-v1",
      generatedAt: new Date().toISOString(),
      section: v.section,
      rows,
      nextAfter: hasMore ? (rows.at(-1)!.id as string) : null,
      boundary:
        "Current authorized business section, not a complete account/subject-access or historical snapshot. Applications and incident messages belong to the requesting user. Excludes member/account secrets and identities, customer enquiry content, third-party reports, private investigation, evidence bytes, contact history, notifications/job payloads and analytics receipts. Backups and earlier downloaded copies are outside this export.",
    };
    if (Buffer.byteLength(JSON.stringify(result)) > 524288)
      throw new AccessError(422, "export_page_too_large");
    await privacyOwnerAccess(db, actor, merchantId);
    await audit(db, actor, "privacy.export", merchantId, merchantId, {
      section: v.section,
      records: rows.length,
    });
    return result;
  });
}
export async function handlePrivacyErasure(pool: Pool, job: Job, signal: AbortSignal) {
  if (!privacyErasureEnabled()) throw new Error("local_erasure_disabled");
  await requireDevelopmentDatabase(pool);
  const v = z
    .object({ caseId: z.uuid(), version: z.number().int().positive() })
    .strict()
    .parse(job.payload);
  await transaction(pool, async (db) => {
    const first = await requestRow(db, v.caseId);
    if (first.merchant_id !== job.merchant_id || job.shop_id !== null)
      throw new Error("privacy_job_scope_mismatch");
    await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
    const fence = async () => {
      signal.throwIfAborted();
      if (
        !(
          await db.query(
            "SELECT id FROM jobs WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>clock_timestamp() FOR UPDATE",
            [job.id, job.lease_token],
          )
        ).rowCount
      )
        throw new Error("lease_lost");
    };
    await fence();
    if ((await db.query("SELECT 1 FROM job_effects WHERE job_id=$1", [job.id])).rowCount) return;
    const row = await requestRow(db, v.caseId);
    if (row.state !== "approved" || row.version !== v.version) return;
    const actor = { userId: row.assigned_user!, sessionId: row.approval_session! };
    await db.query('SELECT id FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [
      [actor.userId, row.requester_id],
    ]);
    const requester = async () => {
      if (
        !(
          await db.query(
            "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND role='owner' AND status='active'",
            [row.merchant_id, row.requester_id],
          )
        ).rowCount
      )
        throw new AccessError(403, "requester_revoked");
    };
    try {
      await requester();
      await privacyOperatorAccess(db, actor, row.id);
      if (!row.approval_until || row.approval_until.getTime() <= Date.now())
        throw new AccessError(403, "approval_expired");
    } catch (error) {
      if (!(error instanceof AccessError)) throw error;
      await update(
        db,
        row,
        "reviewing",
        "Approval expired or authority changed; fresh review is required.",
      );
      await history(
        db,
        actor,
        row,
        "blocked",
        "Current approval authority unavailable.",
        "Fresh approval is required before any erasure.",
      );
      await fence();
      return;
    }
    const target = await plan(db, row);
    if (!target.eligible || target.hash !== row.approval_hash) {
      await update(
        db,
        row,
        (await held(db, row)) ? "held" : "reviewing",
        "Target or retention conditions changed; no erasure was applied.",
      );
      await history(
        db,
        actor,
        row,
        "blocked",
        "Approved target plan is no longer current.",
        "Target or retention conditions changed; no erasure was applied.",
      );
      await fence();
      return;
    }
    await db.query("SELECT set_config('londos.privacy_case',$1,true)", [row.id]);
    if (row.kind === "enquiry") {
      await db.query(
        "UPDATE guest_requests SET name='[Erased]',reply_to='[Erased]',message='[Erased]',erased_at=clock_timestamp(),version=version+1 WHERE id=$1 AND merchant_id=$2",
        [row.target_id, row.merchant_id],
      );
    } else if (row.kind === "verification") {
      await db.query(
        "DELETE FROM application_evidence WHERE application_id=$1 AND merchant_id=$2",
        [row.target_id, row.merchant_id],
      );
    } else if (row.kind === "analytics") {
      await db.query(
        "INSERT INTO shop_privacy_exclusions(shop_id,merchant_id,case_id) VALUES($1,$2,$3)",
        [row.target_id, row.merchant_id, row.id],
      );
      await db.query("DELETE FROM pilot_metrics WHERE shop_id=$1 AND merchant_id=$2", [
        row.target_id,
        row.merchant_id,
      ]);
    } else throw new Error("protected_history_retained");
    await requester();
    await privacyOperatorAccess(db, actor, row.id);
    await fence();
    if (
      !privacyErasureEnabled() ||
      !row.approval_until ||
      row.approval_until.getTime() <= Date.now()
    )
      throw new Error("privacy_approval_expired");
    await db.query("UPDATE privacy_requests SET result=$2 WHERE id=$1", [
      row.id,
      JSON.stringify({
        primaryDataErased: true,
        records: target.records,
        backupsErased: false,
        externalCopiesErased: false,
      }),
    ]);
    await update(
      db,
      row,
      "completed",
      "Primary SQL erasure completed. Required history, backups, notifications and previous copies remain outside this result.",
    );
    await history(
      db,
      actor,
      row,
      "complete",
      "Approved primary-data erasure committed.",
      "Primary SQL erasure completed; backup and external-copy obligations remain.",
    );
    await db.query("INSERT INTO job_effects(job_id) VALUES($1)", [job.id]);
    await fence();
  });
}
