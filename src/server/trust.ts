import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import { imageVariants } from "./media";
import {
  localLifecycle,
  reasonInput,
  currentVersion,
  notifyOwners,
  fingerprint,
} from "./lifecycle-common";
import {
  requireOperator,
  requireShop,
  requireMerchant,
  type Actor,
} from "./security/authorization";
import { AccessError } from "./security/errors";
import { audit } from "./security/audit";

export const reportInput = z
  .object({
    key: z.uuid(),
    shopId: z.uuid(),
    capability: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    category: z.enum(["content", "product", "payment", "privacy", "other"]),
    message: z.string().trim().min(10).max(2000),
  })
  .strict();
export const trustClaimInput = z.object({ reason: reasonInput, confirm: z.literal(true) }).strict();
export const trustDecisionInput = z
  .object({
    action: z.enum(["review", "suspend", "dismiss", "reinstate"]),
    version: z.number().int().positive(),
    moderationVersion: z.number().int().positive(),
    reason: reasonInput,
    publicReason: reasonInput,
    confirm: z.literal(true),
  })
  .strict();
export const trustNoteInput = z
  .object({
    version: z.number().int().positive(),
    priority: z.number().int().min(0).max(2),
    reason: z.string().trim().min(5).max(2000),
    confirm: z.literal(true),
  })
  .strict();
export const appealInput = z
  .object({
    version: z.number().int().positive(),
    reason: z.string().trim().min(10).max(2000),
    confirm: z.literal(true),
  })
  .strict();
type Case = {
  id: string;
  report_id: string;
  shop_id: string;
  merchant_id: string;
  state: string;
  restriction: string;
  version: number;
  priority: number;
  public_reason: string;
  restricting_actor: string | null;
  created_at: Date | string;
};
type Moderation = { state: string; version: number };
export type TrustView = {
  case: Case;
  shop: { name: string; slug: string };
  moderation: Moderation;
  report: { category: string; message: string };
  evidence: boolean;
  events: {
    id: string;
    kind: string;
    reason: string;
    public_reason: string;
    created_at: Date | string;
  }[];
  appealPending: boolean;
};
export type OwnerTrustView = {
  cases: {
    id: string;
    state: string;
    version: number;
    public_reason: string;
    created_at: Date | string;
    appeal_pending: boolean;
  }[];
  moderation: Moderation;
  page: number;
};
const pageInput = z.number().int().min(0).max(500);
function capabilityHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
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
export async function submitReport(pool: Pool, input: z.infer<typeof reportInput>) {
  localLifecycle();
  const v = reportInput.parse(input),
    hash = fingerprint(v);
  return transaction(pool, async (client) => {
    // Serialize global retry keys without revealing whether a target shop exists.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `londos:trust-report:${v.key}`,
    ]);
    const previous = (
      await client.query("SELECT fingerprint FROM trust_reports WHERE id=$1", [v.key])
    ).rows[0];
    if (previous) {
      if (previous.fingerprint !== hash) throw new AccessError(409, "request_key_conflict");
      return { received: true };
    }
    const target = (await client.query("SELECT merchant_id FROM shops WHERE id=$1", [v.shopId]))
      .rows[0];
    if (!target) return { received: true };
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [target.merchant_id]);
    const count = (
      await client.query(
        "SELECT count(*)::int AS n FROM trust_cases WHERE shop_id=$1 AND state NOT IN ('dismissed','reinstated')",
        [v.shopId],
      )
    ).rows[0].n;
    if (count >= 500) throw new AccessError(429, "report_capacity");
    await client.query(
      "INSERT INTO trust_reports(id,shop_id,merchant_id,category,message,capability_hash,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        v.key,
        v.shopId,
        target.merchant_id,
        v.category,
        v.message,
        capabilityHash(v.capability),
        hash,
      ],
    );
    await client.query(
      "INSERT INTO trust_cases(id,report_id,shop_id,merchant_id) VALUES($1,$2,$3,$4)",
      [randomUUID(), v.key, v.shopId, target.merchant_id],
    );
    return { received: true };
  });
}
export async function attachmentAuthority(db: Pool | PoolClient, key: string, capability: string) {
  localLifecycle();
  z.uuid().parse(key);
  reportInput.shape.capability.parse(capability);
  const row = (
    await db.query(
      "SELECT r.merchant_id FROM trust_reports r JOIN trust_cases c ON c.report_id=r.id WHERE r.id=$1 AND r.capability_hash=$2 AND r.attachment_until>clock_timestamp() AND c.version=1",
      [key, capabilityHash(capability)],
    )
  ).rows[0] as { merchant_id: string } | undefined;
  if (!row) throw new AccessError(404, "resource_unavailable");
  return row;
}
export async function attachReportImage(
  pool: Pool,
  key: string,
  capability: string,
  bytes: Buffer,
  contentType: string,
) {
  await attachmentAuthority(pool, key, capability);
  if (bytes.length > 2097152) throw new AccessError(422, "evidence_too_large");
  let normalized: Buffer;
  try {
    const variants = await imageVariants(bytes, contentType, AbortSignal.timeout(10000));
    normalized = variants.find((v) => v.variant === "display")!.bytes;
  } catch {
    throw new AccessError(422, "invalid_evidence_image");
  }
  if (normalized.length > 2097152) throw new AccessError(422, "evidence_too_large");
  return transaction(pool, async (client) => {
    const first = await attachmentAuthority(client, key, capability);
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
    await attachmentAuthority(client, key, capability);
    const digest = createHash("sha256").update(normalized).digest("hex");
    const prior = (
      await client.query("SELECT digest FROM trust_evidence WHERE report_id=$1", [key])
    ).rows[0];
    if (prior) {
      if (prior.digest !== digest) throw new AccessError(409, "attachment_already_saved");
      return { received: true };
    }
    await client.query("INSERT INTO trust_evidence(report_id,bytes,digest) VALUES($1,$2,$3)", [
      key,
      normalized,
      digest,
    ]);
    return { received: true };
  });
}
export async function trustAccess(db: Pool | PoolClient, actor: Actor, id: string) {
  localLifecycle();
  z.uuid().parse(id);
  await requireOperator(db, actor, "moderation", true);
  const row = (
    await db.query(
      "SELECT c.* FROM trust_cases c JOIN operator_trust_scopes s ON s.case_id=c.id AND s.user_id=$2 WHERE c.id=$1",
      [id, actor.userId],
    )
  ).rows[0] as Case | undefined;
  if (!row) throw new AccessError(404, "resource_unavailable");
  await noSelf(db, actor, row.merchant_id);
  return row;
}
export async function claimTrustCase(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof trustClaimInput>,
) {
  localLifecycle();
  z.uuid().parse(id);
  const v = trustClaimInput.parse(input);
  return transaction(pool, async (client) => {
    await requireOperator(client, actor, "moderation", true);
    const first = (await client.query("SELECT merchant_id FROM trust_cases WHERE id=$1", [id]))
      .rows[0];
    if (!first) throw new AccessError(404, "resource_unavailable");
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
    await requireOperator(client, actor, "moderation", true);
    await noSelf(client, actor, first.merchant_id);
    const scope = await client.query(
      "INSERT INTO operator_trust_scopes(user_id,case_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING case_id",
      [actor.userId, id],
    );
    if (scope.rowCount) {
      await client.query("UPDATE trust_cases SET version=version+1,updated_at=now() WHERE id=$1", [
        id,
      ]);
      await audit(client, actor, "trust.case.claimed", id, first.merchant_id, { reason: v.reason });
    }
    return { id };
  });
}
export async function trustQueue(pool: Pool, actor: Actor, page = 0) {
  localLifecycle();
  pageInput.parse(page);
  await requireOperator(pool, actor, "moderation");
  return (
    await pool.query(
      "SELECT c.id,c.state,c.priority,c.created_at,r.category,s.name,EXISTS(SELECT 1 FROM operator_trust_scopes sc WHERE sc.case_id=c.id AND sc.user_id=$1) AS claimed,EXISTS(SELECT 1 FROM trust_appeals a WHERE a.case_id=c.id AND a.resolved_at IS NULL) AS appeal_pending FROM trust_cases c JOIN shops s ON s.id=c.shop_id JOIN trust_reports r ON r.id=c.report_id WHERE c.state NOT IN ('dismissed','reinstated') AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.merchant_id=c.merchant_id AND m.user_id=$1 AND m.status='active') ORDER BY EXISTS(SELECT 1 FROM trust_appeals a WHERE a.case_id=c.id AND a.resolved_at IS NULL) DESC,c.priority DESC,c.created_at,c.id LIMIT 20 OFFSET $2",
      [actor.userId, page * 20],
    )
  ).rows as {
    id: string;
    state: string;
    priority: number;
    created_at: Date | string;
    category: string;
    name: string;
    claimed: boolean;
    appeal_pending: boolean;
  }[];
}
export async function readTrustCase(pool: Pool, actor: Actor, id: string): Promise<TrustView> {
  return transaction(pool, async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const row = await trustAccess(client, actor, id);
    const shop = (await client.query("SELECT name,slug FROM shops WHERE id=$1", [row.shop_id]))
      .rows[0];
    const moderation = (
      await client.query("SELECT state,version FROM shop_moderation WHERE shop_id=$1", [
        row.shop_id,
      ])
    ).rows[0];
    const report = (
      await client.query("SELECT category,message FROM trust_reports WHERE id=$1", [row.report_id])
    ).rows[0];
    const evidence = Boolean(
      (await client.query("SELECT 1 FROM trust_evidence WHERE report_id=$1", [row.report_id]))
        .rowCount,
    );
    const events = (
      await client.query(
        "SELECT id,kind,reason,public_reason,created_at FROM trust_events WHERE case_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20",
        [id],
      )
    ).rows;
    const appealPending = Boolean(
      (
        await client.query("SELECT 1 FROM trust_appeals WHERE case_id=$1 AND resolved_at IS NULL", [
          id,
        ])
      ).rowCount,
    );
    return { case: row, shop, moderation, report, evidence, events, appealPending };
  });
}
export async function readTrustEvidence(pool: Pool, actor: Actor, id: string) {
  return transaction(pool, async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const row = await trustAccess(client, actor, id),
      image = (
        await client.query("SELECT bytes FROM trust_evidence WHERE report_id=$1", [row.report_id])
      ).rows[0];
    if (!image) throw new AccessError(404, "resource_unavailable");
    return image.bytes as Buffer;
  });
}
async function lockedCase(client: PoolClient, actor: Actor, id: string) {
  const first = await trustAccess(client, actor, id);
  await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
  return trustAccess(client, actor, id);
}
async function event(
  client: PoolClient,
  actor: Actor,
  row: Case,
  kind: string,
  reason: string,
  publicReason = "",
) {
  const id = randomUUID();
  await client.query(
    "INSERT INTO trust_events(id,case_id,actor_id,kind,reason,public_reason) VALUES($1,$2,$3,$4,$5,$6)",
    [id, row.id, actor.userId, kind, reason, publicReason],
  );
  return id;
}
export async function noteTrustCase(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof trustNoteInput>,
) {
  const v = trustNoteInput.parse(input);
  return transaction(pool, async (client) => {
    const row = await lockedCase(client, actor, id);
    currentVersion(row.version, v.version);
    if (["dismissed", "reinstated"].includes(row.state)) throw new AccessError(409, "case_closed");
    await client.query(
      "UPDATE trust_cases SET priority=$2,version=version+1,updated_at=now() WHERE id=$1",
      [id, v.priority],
    );
    await event(client, actor, row, "note", v.reason);
    await audit(client, actor, "trust.case.noted", id, row.merchant_id, { priority: v.priority });
    return { version: row.version + 1 };
  });
}
export async function decideTrustCase(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof trustDecisionInput>,
) {
  const v = trustDecisionInput.parse(input);
  return transaction(pool, async (client) => {
    const row = await lockedCase(client, actor, id);
    currentVersion(row.version, v.version);
    const moderation = (
      await client.query("SELECT state,version FROM shop_moderation WHERE shop_id=$1 FOR UPDATE", [
        row.shop_id,
      ])
    ).rows[0] as Moderation;
    currentVersion(moderation.version, v.moderationVersion);
    if (
      ["dismissed", "reinstated"].includes(row.state) ||
      (v.action === "reinstate" && !["reviewing", "suspended"].includes(row.state)) ||
      (v.action === "dismiss" && row.state === "suspended") ||
      (v.action === "review" && row.state === "suspended")
    )
      throw new AccessError(409, "invalid_trust_transition");
    if (["dismiss", "reinstate"].includes(v.action) && row.restricting_actor === actor.userId)
      throw new AccessError(403, "independent_review_required");
    await client.query(
      "INSERT INTO shop_trust_control(shop_id,merchant_id,baseline,computed) VALUES($1,$2,$3,$3) ON CONFLICT DO NOTHING",
      [row.shop_id, row.merchant_id, moderation.state],
    );
    const control = (
      await client.query("SELECT baseline,computed FROM shop_trust_control WHERE shop_id=$1", [
        row.shop_id,
      ])
    ).rows[0];
    if (control.computed !== moderation.state)
      throw new AccessError(409, "moderation_changed_externally");
    const state = {
        review: "reviewing",
        suspend: "suspended",
        dismiss: "dismissed",
        reinstate: "reinstated",
      }[v.action],
      restriction =
        v.action === "review" ? "under_review" : v.action === "suspend" ? "suspended" : "clear";
    await client.query(
      "UPDATE trust_cases SET state=$2,restriction=$3,public_reason=$4,restricting_actor=CASE WHEN $3<>'clear' THEN $5 ELSE restricting_actor END,version=version+1,updated_at=now() WHERE id=$1",
      [id, state, restriction, v.publicReason, actor.userId],
    );
    const restrictions = (
      await client.query(
        "SELECT bool_or(restriction='suspended') AS suspended,bool_or(restriction='under_review') AS reviewing FROM trust_cases WHERE shop_id=$1",
        [row.shop_id],
      )
    ).rows[0];
    const next =
      control.baseline === "suspended" || restrictions.suspended
        ? "suspended"
        : control.baseline === "under_review" || restrictions.reviewing
          ? "under_review"
          : "clear";
    await client.query("UPDATE shop_moderation SET state=$2,version=version+1 WHERE shop_id=$1", [
      row.shop_id,
      next,
    ]);
    await client.query("UPDATE shop_trust_control SET computed=$2 WHERE shop_id=$1", [
      row.shop_id,
      next,
    ]);
    await client.query("UPDATE shops SET version=version+1,updated_at=now() WHERE id=$1", [
      row.shop_id,
    ]);
    await event(client, actor, row, v.action, v.reason, v.publicReason);
    if (["dismiss", "reinstate"].includes(v.action))
      await client.query(
        "UPDATE trust_appeals SET resolved_at=now(),resolved_by=$2 WHERE case_id=$1 AND resolved_at IS NULL",
        [id, actor.userId],
      );
    await audit(client, actor, `trust.case.${v.action}`, id, row.merchant_id, {
      state,
      moderation: next,
      version: row.version + 1,
    });
    await notifyOwners(client, row.merchant_id, `trust-status:${id}:${row.version + 1}`, {
      template: "trust-status",
      caseId: id,
      shopId: row.shop_id,
      state,
    });
    return { version: row.version + 1, moderationVersion: moderation.version + 1 };
  });
}
export async function ownerTrustAccess(db: Pool | PoolClient, actor: Actor, shopId: string) {
  localLifecycle();
  const shop = await requireShop(db, actor, shopId, "sensitive");
  await requireMerchant(db, actor, shop.merchant_id, "membership");
  return shop;
}
export async function ownerTrust(
  pool: Pool,
  actor: Actor,
  shopId: string,
  page = 0,
): Promise<OwnerTrustView> {
  pageInput.parse(page);
  return transaction(pool, async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    await ownerTrustAccess(client, actor, shopId);
    const cases = (
      await client.query(
        "SELECT c.id,c.state,c.version,c.public_reason,c.created_at,EXISTS(SELECT 1 FROM trust_appeals a WHERE a.case_id=c.id AND a.resolved_at IS NULL) AS appeal_pending FROM trust_cases c WHERE c.shop_id=$1 AND c.state<>'open' ORDER BY c.created_at DESC,c.id LIMIT 20 OFFSET $2",
        [shopId, page * 20],
      )
    ).rows;
    const moderation = (
      await client.query("SELECT state,version FROM shop_moderation WHERE shop_id=$1", [shopId])
    ).rows[0];
    return { cases, moderation, page };
  });
}
export async function appealTrustCase(
  pool: Pool,
  actor: Actor,
  shopId: string,
  id: string,
  input: z.infer<typeof appealInput>,
) {
  const v = appealInput.parse(input);
  return transaction(pool, async (client) => {
    const first = await ownerTrustAccess(client, actor, shopId);
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [first.merchant_id]);
    await ownerTrustAccess(client, actor, shopId);
    const row = (
      await client.query("SELECT * FROM trust_cases WHERE id=$1 AND shop_id=$2", [id, shopId])
    ).rows[0] as Case | undefined;
    if (!row) throw new AccessError(404, "resource_unavailable");
    currentVersion(row.version, v.version);
    if (!["reviewing", "suspended"].includes(row.state))
      throw new AccessError(409, "case_not_appealable");
    const appeals = (
      await client.query(
        "SELECT count(*)::int AS n,bool_or(resolved_at IS NULL) AS pending FROM trust_appeals WHERE case_id=$1",
        [id],
      )
    ).rows[0];
    if (appeals.pending || appeals.n >= 5) throw new AccessError(409, "appeal_already_pending");
    const eventId = await event(client, actor, row, "appeal", v.reason);
    await client.query("INSERT INTO trust_appeals(id,case_id) VALUES($1,$2)", [eventId, id]);
    await client.query("UPDATE trust_cases SET version=version+1,updated_at=now() WHERE id=$1", [
      id,
    ]);
    await audit(client, actor, "trust.case.appealed", id, row.merchant_id);
    return { version: row.version + 1 };
  });
}
