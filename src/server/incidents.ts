import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import {
  localLifecycle,
  reasonInput,
  fingerprint,
  currentVersion,
  notifyOwners,
} from "./lifecycle-common";
import {
  requireShop,
  requireMerchant,
  requireOperator,
  type Actor,
  type OperatorPermission,
} from "./security/authorization";
import { AccessError } from "./security/errors";
import { audit } from "./security/audit";
import { contactInput, commitContacts } from "./contacts";

export const incidentPermissions = {
  security: "recovery",
  account_recovery: "recovery",
  contact_change: "recovery",
  fraud: "moderation",
  payment_exception: "finance",
  verification: "review",
  support: "support",
} as const satisfies Record<string, OperatorPermission>;
const kind = z.enum([
  "security",
  "account_recovery",
  "contact_change",
  "fraud",
  "payment_exception",
  "verification",
  "support",
]);
export const incidentInput = z
  .object({
    key: z.uuid(),
    kind,
    message: z.string().trim().min(10).max(2000),
    contactVersion: z.number().int().positive().nullable(),
    requestedRevision: z.number().int().positive().nullable(),
    confirm: z.literal(true),
  })
  .strict()
  .refine((v) =>
    v.kind === "contact_change"
      ? v.contactVersion !== null &&
        v.requestedRevision !== null &&
        v.requestedRevision < v.contactVersion
      : v.contactVersion === null && v.requestedRevision === null,
  );
export const incidentClaimInput = z
  .object({ version: z.number().int().positive(), reason: reasonInput, confirm: z.literal(true) })
  .strict();
export const incidentCommandInput = z
  .object({
    version: z.number().int().positive(),
    action: z.enum(["note", "escalate", "resolve", "contain_sessions", "restore_contacts"]),
    priority: z.number().int().min(0).max(2),
    reason: z.string().trim().min(5).max(2000),
    publicReason: z.string().trim().max(500),
    confirm: z.literal(true),
  })
  .strict()
  .refine((v) => v.action === "note" || v.publicReason.length >= 5);
export const ownerIncidentCommandInput = z
  .object({
    version: z.number().int().positive(),
    action: z.enum(["confirm_restore", "cancel"]),
    contactVersion: z.number().int().positive().nullable(),
    reason: reasonInput,
    confirm: z.literal(true),
  })
  .strict()
  .refine((v) =>
    v.action === "confirm_restore" ? v.contactVersion !== null : v.contactVersion === null,
  );
const pageInput = z.number().int().min(0).max(500);
export type IncidentCase = {
  id: string;
  shop_id: string;
  merchant_id: string;
  reporter_id: string;
  kind: z.infer<typeof kind>;
  message: string;
  requested_contact_revision: number | null;
  state: string;
  version: number;
  priority: number;
  assigned_user: string | null;
  public_reason: string;
  approved_contact_version: number | null;
  approval_until: Date | string | null;
  contained_at: Date | string | null;
  created_at: Date | string;
};
export type ContactSnapshot = {
  version: number;
  phone: string;
  whatsapp: string;
  website: string;
  fulfilment: string;
  payment_instructions: string;
  delivery_instructions: string;
  enquiries_enabled: boolean;
  captured_at: Date | string;
};
export type OwnerIncidentView = {
  case: Pick<
    IncidentCase,
    | "id"
    | "kind"
    | "message"
    | "requested_contact_revision"
    | "state"
    | "version"
    | "priority"
    | "public_reason"
    | "approval_until"
    | "contained_at"
    | "created_at"
  >;
  canConfirm: boolean;
  contactVersion: number;
  requested: ContactSnapshot | null;
  events: { kind: string; public_reason: string; created_at: Date | string }[];
};
export type OperatorIncidentView = {
  case: IncidentCase;
  shop: { name: string };
  requested: ContactSnapshot | null;
  contactVersion: number;
  approvalValid: boolean;
  reporterActive: boolean;
  events: { kind: string; reason: string; public_reason: string; created_at: Date | string }[];
};
const snapshotFields =
  "version,phone,whatsapp,website,fulfilment,payment_instructions,delivery_instructions,enquiries_enabled,captured_at";
const caseFields =
  "id,shop_id,merchant_id,reporter_id,kind,message,requested_contact_revision,state,version,priority,assigned_user,public_reason,approved_contact_version,approval_until,contained_at,created_at";
function open(row: IncidentCase) {
  if (["resolved", "cancelled"].includes(row.state)) throw new AccessError(409, "incident_closed");
}
async function ownerAccess(db: Pool | PoolClient, actor: Actor, shopId: string) {
  localLifecycle();
  z.uuid().parse(shopId);
  const shop = await requireShop(db, actor, shopId, "sensitive");
  await requireMerchant(db, actor, shop.merchant_id, "membership");
  return shop;
}
async function noSelf(db: Pool | PoolClient, actor: Actor, merchantId: string) {
  if (
    (
      await db.query(
        "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND status='active'",
        [merchantId, actor.userId],
      )
    ).rowCount
  )
    throw new AccessError(403, "conflict_of_interest");
}
async function record(
  db: PoolClient,
  actor: Actor,
  row: Pick<IncidentCase, "id" | "merchant_id" | "shop_id">,
  action: string,
  reason: string,
  publicReason = "",
) {
  await db.query(
    "INSERT INTO incident_events(id,case_id,actor_id,kind,reason,public_reason) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), row.id, actor.userId, action, reason, publicReason],
  );
  await audit(db, actor, `incident.${action}`, row.id, row.merchant_id);
}
async function notice(db: PoolClient, row: IncidentCase, state: string) {
  await notifyOwners(db, row.merchant_id, `incident-status:${row.id}:${row.version + 1}`, {
    template: "incident-status",
    caseId: row.id,
    shopId: row.shop_id,
    state,
  });
}
export async function ownerIncidents(pool: Pool, actor: Actor, shopId: string, page = 0) {
  pageInput.parse(page);
  return transaction(pool, async (db) => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await ownerAccess(db, actor, shopId);
    const cases = (
      await db.query(
        "SELECT id,kind,state,priority,version,public_reason,created_at,(assigned_user IS NOT NULL) AS assigned FROM incident_cases WHERE shop_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2",
        [shopId, page * 20],
      )
    ).rows as {
      id: string;
      kind: string;
      state: string;
      priority: number;
      version: number;
      public_reason: string;
      created_at: Date | string;
      assigned: boolean;
    }[];
    const contacts = (
      await db.query(
        `SELECT ${snapshotFields} FROM shop_contact_history WHERE shop_id=$1 ORDER BY version DESC LIMIT 20`,
        [shopId],
      )
    ).rows as ContactSnapshot[];
    return { cases, contacts, page };
  });
}
export async function createIncident(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof incidentInput>,
) {
  localLifecycle();
  const v = incidentInput.parse(input);
  return transaction(pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `londos:incident:${v.key}`,
    ]);
    const first = await ownerAccess(db, actor, shopId);
    await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
    await ownerAccess(db, actor, shopId);
    const hash = fingerprint({ actor: actor.userId, shopId, ...v }),
      prior = (await db.query("SELECT id,fingerprint FROM incident_cases WHERE id=$1", [v.key]))
        .rows[0];
    if (prior) {
      if (prior.fingerprint !== hash) throw new AccessError(409, "request_key_conflict");
      return { id: prior.id };
    }
    if (
      (
        await db.query(
          "SELECT count(*)::int AS n FROM incident_cases WHERE shop_id=$1 AND state NOT IN ('resolved','cancelled')",
          [shopId],
        )
      ).rows[0].n >= 50
    )
      throw new AccessError(429, "incident_capacity");
    if (v.kind === "contact_change") {
      const current = (
        await db.query("SELECT version FROM shop_contacts WHERE shop_id=$1", [shopId])
      ).rows[0];
      currentVersion(current?.version ?? 0, v.contactVersion!);
      if (
        !(
          await db.query("SELECT 1 FROM shop_contact_history WHERE shop_id=$1 AND version=$2", [
            shopId,
            v.requestedRevision,
          ])
        ).rowCount
      )
        throw new AccessError(404, "resource_unavailable");
    }
    await db.query(
      "INSERT INTO incident_cases(id,shop_id,merchant_id,reporter_id,kind,message,fingerprint,requested_contact_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        v.key,
        shopId,
        first.merchant_id,
        actor.userId,
        v.kind,
        v.message,
        hash,
        v.requestedRevision,
      ],
    );
    await record(
      db,
      actor,
      { id: v.key, shop_id: shopId, merchant_id: first.merchant_id },
      "created",
      v.message,
    );
    return { id: v.key };
  });
}
export async function incidentAccess(db: Pool | PoolClient, actor: Actor, id: string) {
  localLifecycle();
  z.uuid().parse(id);
  const row = (await db.query(`SELECT ${caseFields} FROM incident_cases WHERE id=$1`, [id]))
    .rows[0] as IncidentCase | undefined;
  if (!row) throw new AccessError(404, "resource_unavailable");
  await requireOperator(db, actor, incidentPermissions[row.kind], true);
  if (
    row.assigned_user !== actor.userId ||
    !(
      await db.query("SELECT 1 FROM operator_incident_scopes WHERE case_id=$1 AND user_id=$2", [
        id,
        actor.userId,
      ])
    ).rowCount
  )
    throw new AccessError(404, "resource_unavailable");
  await noSelf(db, actor, row.merchant_id);
  return row;
}
export async function incidentQueue(pool: Pool, actor: Actor, page = 0) {
  localLifecycle();
  pageInput.parse(page);
  const grants = (
    await pool.query(
      "SELECT permission FROM operator_grants WHERE user_id=$1 AND permission=ANY($2::text[])",
      [actor.userId, [...new Set(Object.values(incidentPermissions))]],
    )
  ).rows.map((x) => x.permission) as OperatorPermission[];
  if (!grants.length) throw new AccessError(403, "permission_denied");
  await requireOperator(pool, actor, grants[0]!);
  const kinds = Object.entries(incidentPermissions)
    .filter(([, p]) => grants.includes(p))
    .map(([k]) => k);
  return (
    await pool.query(
      "SELECT c.id,c.kind,c.state,c.priority,c.version,c.created_at,s.name,(c.assigned_user=$1) AS claimed,(c.assigned_user IS NOT NULL) AS assigned FROM incident_cases c JOIN shops s ON s.id=c.shop_id JOIN operator_grants g ON g.user_id=$1 AND g.permission=CASE WHEN c.kind IN ('security','account_recovery','contact_change') THEN 'recovery' WHEN c.kind='fraud' THEN 'moderation' WHEN c.kind='payment_exception' THEN 'finance' WHEN c.kind='verification' THEN 'review' ELSE 'support' END WHERE c.kind=ANY($2::text[]) AND c.state NOT IN ('resolved','cancelled') AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.merchant_id=c.merchant_id AND m.user_id=$1 AND m.status='active') ORDER BY (c.state='escalated') DESC,c.priority DESC,c.created_at,c.id LIMIT 20 OFFSET $3",
      [actor.userId, kinds, page * 20],
    )
  ).rows as {
    id: string;
    kind: string;
    state: string;
    priority: number;
    version: number;
    created_at: Date | string;
    name: string;
    claimed: boolean | null;
    assigned: boolean;
  }[];
}
export async function claimIncident(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof incidentClaimInput>,
) {
  localLifecycle();
  z.uuid().parse(id);
  const v = incidentClaimInput.parse(input);
  return transaction(pool, async (db) => {
    const first = (await db.query(`SELECT ${caseFields} FROM incident_cases WHERE id=$1`, [id]))
      .rows[0] as IncidentCase | undefined;
    if (!first) throw new AccessError(404, "resource_unavailable");
    await requireOperator(db, actor, incidentPermissions[first.kind], true);
    await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
    await requireOperator(db, actor, incidentPermissions[first.kind], true);
    await noSelf(db, actor, first.merchant_id);
    const row = (await db.query(`SELECT ${caseFields} FROM incident_cases WHERE id=$1`, [id]))
      .rows[0] as IncidentCase;
    open(row);
    currentVersion(row.version, v.version);
    if (row.assigned_user && row.assigned_user !== actor.userId)
      throw new AccessError(409, "incident_assigned");
    await db.query(
      "INSERT INTO operator_incident_scopes(user_id,case_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [actor.userId, id],
    );
    await db.query(
      "UPDATE incident_cases SET assigned_user=$2,state='investigating',version=version+1,updated_at=now() WHERE id=$1",
      [id, actor.userId],
    );
    await record(db, actor, row, "claimed", v.reason);
    return { id };
  });
}
async function snapshot(db: PoolClient, row: IncidentCase) {
  return row.requested_contact_revision === null
    ? null
    : ((
        await db.query(
          `SELECT ${snapshotFields} FROM shop_contact_history WHERE shop_id=$1 AND version=$2`,
          [row.shop_id, row.requested_contact_revision],
        )
      ).rows[0] as ContactSnapshot);
}
async function approval(db: PoolClient, row: IncidentCase) {
  return Boolean(
    (
      await db.query(
        "SELECT 1 FROM incident_cases c JOIN \"user\" u ON u.id=c.reporter_id JOIN memberships m ON m.user_id=u.id AND m.merchant_id=c.merchant_id JOIN shop_contacts sc ON sc.shop_id=c.shop_id WHERE c.id=$1 AND m.status='active' AND m.role='owner' AND c.approval_until>clock_timestamp() AND c.approved_epoch=u.auth_epoch AND c.approved_contact_version=sc.version",
        [row.id],
      )
    ).rowCount,
  );
}
export async function readOperatorIncident(
  pool: Pool,
  actor: Actor,
  id: string,
): Promise<OperatorIncidentView> {
  return transaction(pool, async (db) => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const row = await incidentAccess(db, actor, id);
    return {
      case: row,
      shop: (await db.query("SELECT name FROM shops WHERE id=$1", [row.shop_id])).rows[0],
      requested: await snapshot(db, row),
      contactVersion:
        (await db.query("SELECT version FROM shop_contacts WHERE shop_id=$1", [row.shop_id]))
          .rows[0]?.version ?? 0,
      approvalValid: await approval(db, row),
      reporterActive: Boolean(
        (
          await db.query(
            "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND role='owner' AND status='active'",
            [row.merchant_id, row.reporter_id],
          )
        ).rowCount,
      ),
      events: (
        await db.query(
          "SELECT kind,reason,public_reason,created_at FROM incident_events WHERE case_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20",
          [id],
        )
      ).rows,
    };
  });
}
export async function readOwnerIncident(
  pool: Pool,
  actor: Actor,
  shopId: string,
  id: string,
): Promise<OwnerIncidentView> {
  z.uuid().parse(id);
  return transaction(pool, async (db) => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await ownerAccess(db, actor, shopId);
    const row = (
      await db.query(`SELECT ${caseFields} FROM incident_cases WHERE id=$1 AND shop_id=$2`, [
        id,
        shopId,
      ])
    ).rows[0] as IncidentCase | undefined;
    if (!row) throw new AccessError(404, "resource_unavailable");
    const {
      id: caseId,
      kind,
      message,
      requested_contact_revision,
      state,
      version,
      priority,
      public_reason,
      approval_until,
      contained_at,
      created_at,
    } = row;
    return {
      case: {
        id: caseId,
        kind,
        message,
        requested_contact_revision,
        state,
        version,
        priority,
        public_reason,
        approval_until,
        contained_at,
        created_at,
      },
      canConfirm: row.reporter_id === actor.userId,
      contactVersion:
        (await db.query("SELECT version FROM shop_contacts WHERE shop_id=$1", [shopId])).rows[0]
          ?.version ?? 0,
      requested: await snapshot(db, row),
      events: (
        await db.query(
          "SELECT kind,public_reason,created_at FROM incident_events WHERE case_id=$1 AND public_reason<>'' ORDER BY created_at DESC,id DESC LIMIT 20",
          [id],
        )
      ).rows,
    };
  });
}
export async function ownerIncidentCommand(
  pool: Pool,
  actor: Actor,
  shopId: string,
  id: string,
  input: z.infer<typeof ownerIncidentCommandInput>,
) {
  z.uuid().parse(id);
  const v = ownerIncidentCommandInput.parse(input);
  return transaction(pool, async (db) => {
    const first = await ownerAccess(db, actor, shopId);
    await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
    await ownerAccess(db, actor, shopId);
    const row = (
      await db.query(`SELECT ${caseFields} FROM incident_cases WHERE id=$1 AND shop_id=$2`, [
        id,
        shopId,
      ])
    ).rows[0] as IncidentCase | undefined;
    if (!row) throw new AccessError(404, "resource_unavailable");
    open(row);
    currentVersion(row.version, v.version);
    if (v.action === "confirm_restore") {
      await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [actor.userId]);
      await ownerAccess(db, actor, shopId);
      if (row.kind !== "contact_change" || row.reporter_id !== actor.userId)
        throw new AccessError(403, "restore_confirmation_denied");
      const c = (await db.query("SELECT version FROM shop_contacts WHERE shop_id=$1", [shopId]))
        .rows[0];
      currentVersion(c?.version ?? 0, v.contactVersion!);
      if (v.contactVersion! <= row.requested_contact_revision!)
        throw new AccessError(409, "contact_request_outdated");
      await db.query(
        "UPDATE incident_cases SET approved_contact_version=$2,approved_epoch=(SELECT auth_epoch FROM \"user\" WHERE id=$3),approval_until=clock_timestamp()+interval '30 minutes',version=version+1,updated_at=now() WHERE id=$1",
        [id, v.contactVersion, actor.userId],
      );
    } else
      await db.query(
        "UPDATE incident_cases SET state='cancelled',public_reason=$2,version=version+1,updated_at=now() WHERE id=$1",
        [id, v.reason],
      );
    await record(db, actor, row, v.action, v.reason, v.reason);
    return { version: row.version + 1 };
  });
}
export async function commandIncident(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof incidentCommandInput>,
) {
  const v = incidentCommandInput.parse(input);
  return transaction(pool, async (db) => {
    const first = await incidentAccess(db, actor, id);
    await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
    const row = await incidentAccess(db, actor, id);
    open(row);
    currentVersion(row.version, v.version);
    if (["contain_sessions", "restore_contacts"].includes(v.action)) {
      await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [row.reporter_id]);
      await incidentAccess(db, actor, id);
    }
    if (v.action === "contain_sessions") {
      if (!["security", "account_recovery", "contact_change"].includes(row.kind))
        throw new AccessError(403, "incident_action_denied");
      if (row.contained_at) throw new AccessError(409, "account_already_contained");
      if (
        !(
          await db.query(
            "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND status='active' AND role='owner'",
            [row.merchant_id, row.reporter_id],
          )
        ).rowCount
      )
        throw new AccessError(409, "reporter_authority_changed");
      await db.query("SELECT invalidate_authentication($1,true)", [row.reporter_id]);
      await db.query(
        "DELETE FROM verification WHERE value=$1 AND identifier LIKE 'reset-password:%'",
        [row.reporter_id],
      );
      await db.query(
        "UPDATE incident_cases SET contained_at=clock_timestamp(),approved_contact_version=NULL,approved_epoch=NULL,approval_until=NULL WHERE id=$1",
        [id],
      );
    }
    if (v.action === "restore_contacts") {
      if (row.kind !== "contact_change") throw new AccessError(403, "incident_action_denied");
      // Serialize against password/factor generation changes until the restore commits.
      if (!(await approval(db, row))) throw new AccessError(409, "owner_confirmation_required");
      const old = await snapshot(db, row);
      if (!old) throw new AccessError(404, "resource_unavailable");
      const contact = contactInput.parse({
        version: row.approved_contact_version!,
        phone: old.phone,
        whatsapp: old.whatsapp,
        website: old.website,
        fulfilment: old.fulfilment,
        paymentInstructions: old.payment_instructions,
        deliveryInstructions: old.delivery_instructions,
        enquiriesEnabled: old.enquiries_enabled,
        reason: `Incident restoration ${id}`,
      });
      await commitContacts(db, actor, row.shop_id, row.merchant_id, contact);
    }
    const state =
      v.action === "escalate"
        ? "escalated"
        : ["resolve", "restore_contacts"].includes(v.action)
          ? "resolved"
          : row.state;
    await db.query(
      "UPDATE incident_cases SET state=$2,priority=$3,public_reason=CASE WHEN $4='note' THEN public_reason ELSE $5 END,assigned_user=CASE WHEN $4='escalate' THEN NULL ELSE assigned_user END,version=version+1,updated_at=now() WHERE id=$1",
      [id, state, v.priority, v.action, v.publicReason],
    );
    if (v.action === "escalate")
      await db.query("DELETE FROM operator_incident_scopes WHERE case_id=$1", [id]);
    await record(db, actor, row, v.action, v.reason, v.action === "note" ? "" : v.publicReason);
    if (v.action !== "note") await notice(db, row, state);
    return { version: row.version + 1, state };
  });
}
