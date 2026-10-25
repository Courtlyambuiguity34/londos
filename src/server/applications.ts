import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "./db/pool";
import { categorySlug } from "./discovery";
import {
  sessionState,
  requireMerchant,
  requireOperator,
  requireStepUp,
  type Actor,
} from "./security/authorization";
import { audit } from "./security/audit";
import { AccessError } from "./security/errors";
import {
  applicationAccess,
  applicationLock,
  currentVersion,
  fingerprint,
  notifyOwners,
  reasonInput,
} from "./lifecycle-common";
import { imageVariants } from "./media";

export const applicationDetails = z
  .object({
    businessName: z.string().trim().min(2).max(120),
    category: categorySlug,
    location: z.string().trim().min(2).max(160),
    description: z.string().trim().min(20).max(2000),
    phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  })
  .strict();
export const createApplicationInput = applicationDetails
  .extend({ key: z.uuid(), merchantId: z.uuid().optional() })
  .strict();
export const updateApplicationInput = applicationDetails
  .extend({ version: z.number().int().positive() })
  .strict();
export const submitApplicationInput = z
  .object({ version: z.number().int().positive(), confirm: z.literal(true) })
  .strict();
export const reviewApplicationInput = z
  .object({
    version: z.number().int().positive(),
    decision: z.enum(["needs_information", "approved", "rejected"]),
    reason: reasonInput,
    policyId: z.uuid().optional(),
    confirm: z.literal(true),
  })
  .strict();
export async function createApplication(
  pool: Pool,
  actor: Actor,
  input: z.infer<typeof createApplicationInput>,
) {
  const value = createApplicationInput.parse(input),
    hash = fingerprint(value);
  return transaction(pool, async (client) => {
    await requireStepUp(client, actor);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `application:${actor.userId}`,
    ]);
    await requireStepUp(client, actor);
    const previous = (
      await client.query(
        "SELECT id,merchant_id,request_fingerprint FROM applications WHERE applicant_id=$1 AND request_key=$2",
        [actor.userId, value.key],
      )
    ).rows[0];
    if (previous) {
      await applicationAccess(client, actor, previous.id, "owner");
      if (previous.request_fingerprint !== hash) throw new AccessError(409, "idempotency_conflict");
      return { id: previous.id as string };
    }
    if (
      (
        await client.query(
          "SELECT count(*)::int AS count FROM applications WHERE applicant_id=$1 AND state<>'rejected'",
          [actor.userId],
        )
      ).rows[0].count >= 20
    )
      throw new AccessError(409, "application_limit");
    const merchantId = value.merchantId ?? randomUUID();
    if (value.merchantId) {
      await requireMerchant(client, actor, merchantId, "membership");
      await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [merchantId]);
      await requireMerchant(client, actor, merchantId, "membership");
    } else {
      await client.query("INSERT INTO merchants(id,name) VALUES($1,$2)", [
        merchantId,
        value.businessName,
      ]);
      await client.query(
        "INSERT INTO memberships(merchant_id,user_id,role) VALUES($1,$2,'owner')",
        [merchantId, actor.userId],
      );
    }
    const id = randomUUID();
    await client.query(
      "INSERT INTO applications(id,merchant_id,applicant_id,state,business_name,category,location,description,phone,request_key,request_fingerprint) VALUES($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10)",
      [
        id,
        merchantId,
        actor.userId,
        value.businessName,
        value.category,
        value.location,
        value.description,
        value.phone,
        value.key,
        hash,
      ],
    );
    await audit(client, actor, "application.created", id, merchantId);
    return { id };
  });
}
export async function listApplications(pool: Pool, actor: Actor, offset = 0) {
  // Listing is scoped to active owner memberships and does not mutate application state.
  await sessionState(pool, actor);
  z.number().int().min(0).max(10000).parse(offset);
  return (
    await pool.query(
      "SELECT a.id,a.business_name,a.state,a.version,a.provisioned_shop_id FROM applications a JOIN memberships m ON m.merchant_id=a.merchant_id WHERE m.user_id=$1 AND m.role='owner' AND m.status='active' ORDER BY a.created_at DESC,a.id LIMIT 20 OFFSET $2",
      [actor.userId, offset],
    )
  ).rows as {
    id: string;
    business_name: string;
    state: string;
    version: number;
    provisioned_shop_id: string | null;
  }[];
}
export async function readApplication(
  pool: Pool,
  actor: Actor,
  id: string,
  mode: "owner" | "review" | "finance" = "owner",
) {
  return transaction(pool, async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const application = await applicationAccess(client, actor, id, mode);
    const evidence = (
      await client.query(
        "SELECT slot,digest,octet_length(bytes)::int AS bytes FROM application_evidence WHERE application_id=$1 ORDER BY slot",
        [id],
      )
    ).rows as { slot: number; digest: string; bytes: number }[];
    const history = (
      await client.query(
        "SELECT action,details,created_at FROM audit_events WHERE resource_id=$1 AND merchant_id=$2 AND action LIKE 'application.%' ORDER BY created_at DESC,id DESC LIMIT 20",
        [id, application.merchant_id],
      )
    ).rows as { action: string; details: Record<string, unknown>; created_at: Date }[];
    return { application, evidence, history };
  });
}
export async function updateApplication(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof updateApplicationInput>,
) {
  const value = updateApplicationInput.parse(input);
  return transaction(pool, async (client) => {
    const row = await applicationLock(client, actor, id, "owner");
    currentVersion(row.version, value.version);
    if (!["draft", "needs_information"].includes(row.state))
      throw new AccessError(409, "application_not_editable");
    await client.query(
      "UPDATE applications SET business_name=$2,category=$3,location=$4,description=$5,phone=$6,version=version+1,updated_at=now() WHERE id=$1",
      [id, value.businessName, value.category, value.location, value.description, value.phone],
    );
    await audit(client, actor, "application.edited", id, row.merchant_id, {
      version: row.version + 1,
    });
    return { version: row.version + 1 };
  });
}
export async function submitApplication(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof submitApplicationInput>,
) {
  const value = submitApplicationInput.parse(input);
  return transaction(pool, async (client) => {
    const row = await applicationLock(client, actor, id, "owner");
    currentVersion(row.version, value.version);
    if (!["draft", "needs_information"].includes(row.state))
      throw new AccessError(409, "application_not_editable");
    applicationDetails.parse({
      businessName: row.business_name,
      category: row.category,
      location: row.location,
      description: row.description,
      phone: row.phone,
    });
    const evidence = (
      await client.query(
        "SELECT slot,digest FROM application_evidence WHERE application_id=$1 ORDER BY slot",
        [id],
      )
    ).rows;
    if (!evidence.length) throw new AccessError(422, "verification_evidence_required");
    await client.query(
      "INSERT INTO application_submissions(application_id,version,snapshot) VALUES($1,$2,$3)",
      [
        id,
        row.version + 1,
        JSON.stringify({
          businessName: row.business_name,
          category: row.category,
          location: row.location,
          description: row.description,
          phone: row.phone,
          evidence,
        }),
      ],
    );
    await client.query(
      "UPDATE applications SET state='submitted',version=version+1,submitted_at=now(),updated_at=now() WHERE id=$1",
      [id],
    );
    await audit(client, actor, "application.submitted", id, row.merchant_id, {
      version: row.version + 1,
    });
    await notifyOwners(client, row.merchant_id, `application:${id}:${row.version + 1}`, {
      template: "application-status",
      applicationId: id,
      state: "submitted",
    });
    return { version: row.version + 1 };
  });
}
export async function evidenceAuthority(pool: Pool, actor: Actor, id: string) {
  const row = await applicationAccess(pool, actor, id, "owner");
  if (!["draft", "needs_information"].includes(row.state))
    throw new AccessError(409, "application_not_editable");
}
export async function saveEvidence(
  pool: Pool,
  actor: Actor,
  id: string,
  slot: number,
  version: number,
  bytes: Buffer,
  contentType: string,
) {
  z.number().int().min(1).max(2).parse(slot);
  z.number().int().positive().parse(version);
  await evidenceAuthority(pool, actor, id);
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
    const row = await applicationLock(client, actor, id, "owner");
    currentVersion(row.version, version);
    if (!["draft", "needs_information"].includes(row.state))
      throw new AccessError(409, "application_not_editable");
    await client.query(
      "INSERT INTO application_evidence(application_id,merchant_id,slot,bytes,digest,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(application_id,slot) DO UPDATE SET bytes=excluded.bytes,digest=excluded.digest,created_by=excluded.created_by,updated_at=now()",
      [id, row.merchant_id, slot, normalized, fingerprint(normalized), actor.userId],
    );
    await client.query("UPDATE applications SET version=version+1,updated_at=now() WHERE id=$1", [
      id,
    ]);
    await audit(client, actor, "application.evidence.saved", id, row.merchant_id, {
      slot,
      version: row.version + 1,
    });
    return { version: row.version + 1 };
  });
}
export async function readEvidence(
  pool: Pool,
  actor: Actor,
  id: string,
  slot: number,
  mode: "owner" | "review",
) {
  z.number().int().min(1).max(2).parse(slot);
  await applicationAccess(pool, actor, id, mode);
  await requireStepUp(pool, actor);
  const row = (
    await pool.query("SELECT bytes FROM application_evidence WHERE application_id=$1 AND slot=$2", [
      id,
      slot,
    ])
  ).rows[0];
  if (!row) throw new AccessError(404, "resource_unavailable");
  return row.bytes as Buffer;
}
export async function applicationQueue(
  pool: Pool,
  actor: Actor,
  permission: "review" | "finance",
  offset = 0,
) {
  await requireOperator(pool, actor, permission);
  z.number().int().min(0).max(10000).parse(offset);
  return (
    await pool.query(
      `SELECT a.id,a.business_name,a.state,a.version,EXISTS(SELECT 1 FROM operator_application_scopes s WHERE s.application_id=a.id AND s.user_id=$1 AND s.permission=$2) AS claimed,EXISTS(SELECT 1 FROM applications b WHERE b.id<>a.id AND b.state<>'rejected' AND lower(b.business_name)=lower(a.business_name)) AS possible_duplicate FROM applications a WHERE a.state=ANY($3::text[]) ORDER BY a.submitted_at,a.id LIMIT 20 OFFSET $4`,
      [
        actor.userId,
        permission,
        permission === "review"
          ? ["submitted", "reviewing", "needs_information", "approved", "rejected"]
          : ["approved"],
        offset,
      ],
    )
  ).rows as {
    id: string;
    business_name: string;
    state: string;
    version: number;
    claimed: boolean;
    possible_duplicate: boolean;
  }[];
}
export async function claimApplication(
  pool: Pool,
  actor: Actor,
  id: string,
  permission: "review" | "finance",
) {
  z.uuid().parse(id);
  z.enum(["review", "finance"]).parse(permission);
  return transaction(pool, async (client) => {
    await requireOperator(client, actor, permission, true);
    const row = (
      await client.query("SELECT merchant_id FROM applications WHERE id=$1 AND state<>'draft'", [
        id,
      ])
    ).rows[0];
    if (!row) throw new AccessError(404, "resource_unavailable");
    await client.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [row.merchant_id]);
    await requireOperator(client, actor, permission, true);
    if (
      (
        await client.query(
          "SELECT 1 FROM memberships WHERE merchant_id=$1 AND user_id=$2 AND status='active'",
          [row.merchant_id, actor.userId],
        )
      ).rowCount
    )
      throw new AccessError(403, "conflict_of_interest");
    const state = (await client.query("SELECT state FROM applications WHERE id=$1", [id])).rows[0]
      .state;
    if (permission === "finance" && state !== "approved")
      throw new AccessError(409, "application_not_approved");
    const inserted = await client.query(
      "INSERT INTO operator_application_scopes(user_id,application_id,permission) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING user_id",
      [actor.userId, id, permission],
    );
    if (permission === "review" && state === "submitted")
      await client.query(
        "UPDATE applications SET state='reviewing',version=version+1,updated_at=now() WHERE id=$1",
        [id],
      );
    if (inserted.rowCount)
      await audit(client, actor, "application.claimed", id, row.merchant_id, { permission });
    return { id };
  });
}
export async function reviewApplication(
  pool: Pool,
  actor: Actor,
  id: string,
  input: z.infer<typeof reviewApplicationInput>,
  now = new Date(),
) {
  const value = reviewApplicationInput.parse(input);
  return transaction(pool, async (client) => {
    const row = await applicationLock(client, actor, id, "review");
    await requireOperator(client, actor, "review", true);
    currentVersion(row.version, value.version);
    if (row.state !== "reviewing") throw new AccessError(409, "application_not_reviewing");
    if (value.decision === "approved") {
      if (
        !(await client.query("SELECT 1 FROM application_evidence WHERE application_id=$1", [id]))
          .rowCount
      )
        throw new AccessError(422, "verification_evidence_required");
      if (value.policyId) {
        const { issueInvoice } = await import("./rent");
        await issueInvoice(client, actor, row, value.policyId, "initial", null, now);
      }
    }
    await client.query(
      "UPDATE applications SET state=$2,review_reason=$3,policy_id=$4,version=version+1,updated_at=now() WHERE id=$1",
      [id, value.decision, value.reason, value.decision === "approved" ? value.policyId : null],
    );
    await audit(client, actor, `application.${value.decision}`, id, row.merchant_id, {
      reason: value.reason,
      version: row.version + 1,
    });
    await notifyOwners(client, row.merchant_id, `application:${id}:${row.version + 1}`, {
      template: "application-status",
      applicationId: id,
      state: value.decision,
    });
    return { version: row.version + 1 };
  });
}
