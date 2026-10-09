import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "../db/pool";
import { requireShop, requireStepUp, type Actor } from "../security/authorization";
import { AccessError } from "../security/errors";
import { audit } from "../security/audit";
import { withinDeadline } from "../jobs/deadline";
import { assemble } from "../public-shop";
import { fingerprint, currentVersion } from "../lifecycle-common";
import { catalogueGeneration } from "../catalogue-pagination";
import { readDesign, validateReferences, state, insertRevision } from "../shop-design";
import {
  shopSpecification,
  departmentReferences,
  productReferences,
  type ShopSpecification,
} from "../../modules/shop-design/specification";
import {
  assistantRequest,
  assistantCommand,
  deterministicIntent,
  changeSummary,
  compileIntent,
  type DesignContext,
  type DesignIntent,
} from "../../modules/ai-design/contract";
import {
  aiConfiguration,
  aiLimits,
  reservation,
  estimateCost,
  type AIConfiguration,
  type ProviderKind,
} from "./config";
import { GeminiProvider, OpenAIProvider, ProviderFailure, type AIProvider } from "./providers";
import { LondosDesignOrchestrator, type AttemptResult } from "./orchestrator";

type RequestRow = {
  id: string;
  shop_id: string;
  merchant_id: string;
  actor_id: string;
  fingerprint: string;
  base_version: number;
  context_digest: string;
  lease_token: string;
  lease_until: Date;
  status: string;
  version: number;
  candidate: ShopSpecification | null;
  patches: DesignIntent["patches"] | null;
  decisions: DesignIntent["decisions"];
  path: string | null;
  review_warning: boolean;
  review_status: string;
  failure_code: string | null;
  expires_at: Date;
  command_action: string | null;
  command_version: number | null;
  command_warning: boolean | null;
  result_version: number | null;
  result_revision: number | null;
};
const controllers = new Map<string, AbortController>();
async function access(db: Pool | PoolClient, actor: Actor, id: string) {
  z.uuid().parse(id);
  const shop = await requireShop(db, actor, id, "design");
  await requireStepUp(db, actor);
  return shop;
}
async function lock(db: PoolClient, actor: Actor, id: string) {
  const shop = await access(db, actor, id);
  await db.query("SET LOCAL statement_timeout='2000ms'");
  await db.query("SELECT id FROM merchants WHERE id=$1 FOR UPDATE", [shop.merchant_id]);
  await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [actor.userId]);
  return access(db, actor, id);
}
async function context(db: PoolClient, actor: Actor, id: string) {
  const shop = await access(db, actor, id),
    design = await readDesign(db, actor, id),
    specification = shopSpecification.parse(design.specification);
  const referencedDepartments = departmentReferences(specification),
    referencedProducts = productReferences(specification);
  const departments = (
    await db.query(
      "SELECT id,name,version FROM departments WHERE shop_id=$1 AND merchant_id=$2 AND archived=false AND (id IN(SELECT id FROM departments WHERE shop_id=$1 AND archived=false ORDER BY position,id LIMIT 30) OR id=ANY($3::uuid[])) ORDER BY position,id",
      [id, shop.merchant_id, referencedDepartments],
    )
  ).rows as DesignContext["departments"];
  const products = (
    await db.query(
      'SELECT p.id,p.name,p.version,p.department_id AS "departmentId",d.name AS "departmentName",p.kind,p.price_minor::text AS "priceMinor",p.currency,p.availability FROM products p JOIN departments d ON d.id=p.department_id AND d.shop_id=p.shop_id AND d.merchant_id=p.merchant_id WHERE p.shop_id=$1 AND p.merchant_id=$2 AND p.availability<>\'archived\' AND d.archived=false AND (p.id IN(SELECT chosen.id FROM products chosen JOIN departments current_department ON current_department.id=chosen.department_id AND current_department.shop_id=chosen.shop_id AND current_department.merchant_id=chosen.merchant_id AND current_department.archived=false WHERE chosen.shop_id=$1 AND chosen.availability<>\'archived\' ORDER BY chosen.position,chosen.id LIMIT 32) OR p.id=ANY($3::uuid[])) ORDER BY p.position,p.id',
      [id, shop.merchant_id, referencedProducts],
    )
  ).rows as DesignContext["products"];
  await validateReferences(db, id, specification);
  const data: DesignContext = {
    shop: { name: shop.name, category: shop.category, tagline: shop.tagline },
    specification,
    departments,
    products,
    supported: {
      premiseStyles: [
        "luxury",
        "streetwear",
        "electronics",
        "food",
        "service",
        "minimalist",
        "editorial",
        "catalogue",
      ],
      sectionTypes: [
        "hero",
        "featured_product",
        "product_section",
        "department_editorial",
        "commerce_info",
        "entrance",
        "display",
        "gallery",
        "offer",
        "service_desk",
        "collection",
        "department",
        "products",
        "story",
        "contact",
      ],
      colorTokens: [
        "cream",
        "burgundy",
        "gold",
        "charcoal",
        "white",
        "black",
        "stone",
        "sand",
        "terracotta",
        "sage",
        "forest",
        "navy",
        "sky",
        "plum",
      ],
      typography: ["editorial", "modern", "classic", "technical", "friendly"],
    },
  };
  if (Buffer.byteLength(JSON.stringify(data)) > aiLimits.contextBytes)
    throw new AccessError(422, "ai_context_limit");
  return {
    data,
    version: design.version,
    digest: fingerprint({
      version: design.version,
      catalogueGeneration: await catalogueGeneration(db, id),
      data,
    }),
    merchantId: shop.merchant_id,
  };
}
function present(row: RequestRow) {
  const expired =
    (row.status === "running" && row.lease_until.getTime() <= Date.now()) ||
    (row.status === "proposed" && row.expires_at.getTime() <= Date.now());
  return {
    id: row.id,
    status: expired ? "expired" : row.status,
    version: row.version,
    baseVersion: row.base_version,
    path: row.path,
    reviewWarning: row.review_warning,
    reviewStatus: row.review_status,
    failureCode: row.failure_code,
    expiresAt: row.expires_at.toISOString(),
    candidate: expired ? null : row.candidate,
    decisions: expired ? [] : row.decisions,
    changes:
      !expired && row.patches
        ? changeSummary({
            patches: row.patches,
            decisions: row.decisions,
            confidence: "high",
            review: "not_needed",
          })
        : [],
    result: row.result_revision
      ? { version: row.result_version, revision: row.result_revision }
      : null,
  };
}
async function requestRow(db: Pool | PoolClient, actor: Actor, shopId: string, id: string) {
  z.uuid().parse(id);
  const row = (
    await db.query("SELECT * FROM ai_design_requests WHERE id=$1 AND shop_id=$2 AND actor_id=$3", [
      id,
      shopId,
      actor.userId,
    ])
  ).rows[0] as RequestRow | undefined;
  if (!row) throw new AccessError(404, "resource_unavailable");
  return row;
}
export async function assistantStatus(pool: Pool, actor: Actor, shopId: string) {
  return transaction(pool, async (db) => {
    await lock(db, actor, shopId);
    const config = aiConfiguration();
    const design = await readDesign(db, actor, shopId);
    const recent = (
      await db.query(
        "SELECT * FROM ai_design_requests WHERE shop_id=$1 AND actor_id=$2 ORDER BY created_at DESC,id LIMIT 10",
        [shopId, actor.userId],
      )
    ).rows as RequestRow[];
    const usage = (
      await db.query(
        "SELECT provider,verification,count(*)::text AS attempts,coalesce(sum(input_tokens),0)::text AS reported_input_tokens,coalesce(sum(output_tokens),0)::text AS reported_output_tokens,count(*) FILTER(WHERE input_tokens IS NULL OR output_tokens IS NULL)::text AS unmeasured_attempts,sum(estimated_cost_microusd)::text AS estimated_cost_microusd FROM ai_provider_attempts WHERE shop_id=$1 AND created_at>=((clock_timestamp() AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'UTC') GROUP BY provider,verification ORDER BY provider,verification",
        [shopId],
      )
    ).rows;
    await access(db, actor, shopId);
    return {
      baseVersion: design.version,
      capabilities: config.status,
      remoteEnabled: config.remote,
      limits: { ...aiLimits, dailyCostMicroUsd: config.dailyCostMicroUsd.toString() },
      recent: recent.map(present),
      usage,
      usageLimit:
        "Provider-reported tokens and configured USD estimates are not independently reconciled bills or merchant charges; missing usage is unmeasured.",
    };
  });
}
export async function readAssistantRequest(pool: Pool, actor: Actor, shopId: string, id: string) {
  return transaction(pool, async (db) => {
    await lock(db, actor, shopId);
    const row = await requestRow(db, actor, shopId, id);
    await access(db, actor, shopId);
    return present(row);
  });
}
export type AssistantDependencies = {
  config?: AIConfiguration;
  providers?: Partial<Record<ProviderKind, AIProvider>>;
  signal?: AbortSignal;
};
export async function proposeDesign(
  pool: Pool,
  actor: Actor,
  shopId: string,
  input: z.infer<typeof assistantRequest>,
  dependencies: AssistantDependencies = {},
) {
  const v = assistantRequest.parse(input),
    config = dependencies.config ?? aiConfiguration(),
    id = randomUUID(),
    lease = randomUUID(),
    hash = fingerprint({ shopId, ...v });
  const admitted = await transaction(pool, async (db) => {
    await lock(db, actor, shopId);
    const prior = (
      await db.query("SELECT * FROM ai_design_requests WHERE actor_id=$1 AND request_key=$2", [
        actor.userId,
        v.key,
      ])
    ).rows[0] as RequestRow | undefined;
    if (prior) {
      if (prior.fingerprint !== hash) throw new AccessError(409, "retry_payload_changed");
      await access(db, actor, shopId);
      return { prior };
    }
    const snapshot = await context(db, actor, shopId);
    currentVersion(snapshot.version, v.version);
    const deterministic = deterministicIntent(snapshot.data, v.instruction),
      reserved =
        !deterministic && v.externalConsent && config.remote
          ? reservation(config)
          : { tokens: 0, cost: 0n };
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('londos.ai.admission',0))");
    const running = (
      await db.query(
        "SELECT count(*)::int AS global,count(*) FILTER(WHERE shop_id=$1)::int AS shop FROM ai_design_requests WHERE status='running' AND lease_until>clock_timestamp()",
        [shopId],
      )
    ).rows[0];
    if (running.global >= aiLimits.globalConcurrency || running.shop >= aiLimits.shopConcurrency)
      throw new AccessError(429, "ai_concurrency_limit");
    const budget = await db.query(
      "INSERT INTO ai_daily_budgets(shop_id,day,requests,reserved_tokens,reserved_cost_microusd) VALUES($1,(clock_timestamp() AT TIME ZONE 'UTC')::date,1,$2,$3) ON CONFLICT(shop_id,day) DO UPDATE SET requests=ai_daily_budgets.requests+1,reserved_tokens=ai_daily_budgets.reserved_tokens+excluded.reserved_tokens,reserved_cost_microusd=ai_daily_budgets.reserved_cost_microusd+excluded.reserved_cost_microusd WHERE ai_daily_budgets.requests<$4 AND ai_daily_budgets.reserved_tokens+excluded.reserved_tokens<=$5 AND ai_daily_budgets.reserved_cost_microusd+excluded.reserved_cost_microusd<=$6 RETURNING requests",
      [
        shopId,
        reserved.tokens,
        reserved.cost.toString(),
        aiLimits.dailyRequests,
        aiLimits.dailyReservedTokens,
        config.dailyCostMicroUsd.toString(),
      ],
    );
    if (
      !budget.rowCount ||
      reserved.tokens > aiLimits.dailyReservedTokens ||
      reserved.cost > config.dailyCostMicroUsd
    )
      throw new AccessError(429, "ai_daily_budget");
    await db.query(
      "INSERT INTO ai_design_requests(id,merchant_id,shop_id,actor_id,request_key,fingerprint,base_version,context_digest,lease_token,lease_until,status,expires_at,reserved_tokens,reserved_cost_microusd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp()+$10*interval '1 second','running',clock_timestamp()+$11*interval '1 minute',$12,$13)",
      [
        id,
        snapshot.merchantId,
        shopId,
        actor.userId,
        v.key,
        hash,
        v.version,
        snapshot.digest,
        lease,
        aiLimits.requestLeaseSeconds,
        aiLimits.proposalMinutes,
        reserved.tokens,
        reserved.cost.toString(),
      ],
    );
    await access(db, actor, shopId);
    return { snapshot };
  });
  if ("prior" in admitted && admitted.prior) return present(admitted.prior);
  if (!("snapshot" in admitted) || !admitted.snapshot) throw new Error("admission_failed");
  const snapshot = admitted.snapshot,
    controller = new AbortController();
  controllers.set(id, controller);
  const signal = AbortSignal.any([
    controller.signal,
    dependencies.signal ?? new AbortController().signal,
    AbortSignal.timeout(aiLimits.requestTimeoutMs),
  ]);
  const providers: Partial<Record<ProviderKind, AIProvider>> = dependencies.providers ?? {};
  if (!dependencies.providers) {
    if (config.providers.gemini)
      providers.gemini = new GeminiProvider(
        config.providers.gemini.model,
        config.providers.gemini.keys,
      );
    if (config.providers.openai)
      providers.openai = new OpenAIProvider(
        config.providers.openai.model,
        config.providers.openai.keys,
      );
  }
  const stillCurrent = async () =>
    transaction(pool, async (db) => {
      await lock(db, actor, shopId);
      const row = await requestRow(db, actor, shopId, id);
      if (
        row.status !== "running" ||
        row.lease_token !== lease ||
        row.lease_until.getTime() <= Date.now() ||
        signal.aborted
      )
        throw new ProviderFailure("cancelled");
      const now = await context(db, actor, shopId);
      if (now.digest !== snapshot.digest) throw new AccessError(409, "ai_context_changed");
    });
  let attempts = 0;
  try {
    const result = await withinDeadline(
      () =>
        new LondosDesignOrchestrator(config, providers).propose(
          snapshot.data,
          v.instruction,
          v.externalConsent,
          v.qualityReview,
          signal,
          {
            beforeAttempt: async (provider) => {
              await stillCurrent();
              if (++attempts > aiLimits.maxAttempts) throw new ProviderFailure("invalid_response");
              if (
                (
                  await pool.query(
                    "SELECT 1 FROM ai_provider_cooldowns WHERE provider=$1 AND not_before>clock_timestamp()",
                    [provider],
                  )
                ).rowCount
              )
                throw new ProviderFailure("rate_limited");
            },
            afterAttempt: async (r: AttemptResult) => {
              const settings = config.providers[r.provider],
                estimated =
                  settings && r.usage.inputTokens !== null && r.usage.outputTokens !== null
                    ? estimateCost(settings, r.usage.inputTokens, r.usage.outputTokens).toString()
                    : null;
              await transaction(pool, async (db) => {
                await db.query(
                  "INSERT INTO ai_provider_attempts(id,request_id,merchant_id,shop_id,provider,model,verification,purpose,outcome,latency_ms,input_tokens,output_tokens,estimated_cost_microusd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
                  [
                    randomUUID(),
                    id,
                    snapshot.merchantId,
                    shopId,
                    r.provider,
                    r.model,
                    r.verification,
                    r.purpose,
                    r.outcome,
                    r.latencyMs,
                    r.usage.inputTokens,
                    r.usage.outputTokens,
                    estimated,
                  ],
                );
                if (r.retryAt)
                  await db.query(
                    "INSERT INTO ai_provider_cooldowns(provider,not_before) VALUES($1,$2) ON CONFLICT(provider) DO UPDATE SET not_before=greatest(ai_provider_cooldowns.not_before,excluded.not_before)",
                    [r.provider, r.retryAt],
                  );
              });
            },
            validate: async (candidate) => {
              await stillCurrent();
              await transaction(pool, async (db) => {
                await validateReferences(db, shopId, candidate);
              });
            },
          },
        ),
      signal,
    );
    signal.throwIfAborted();
    return await transaction(pool, async (db) => {
      await lock(db, actor, shopId);
      const row = await requestRow(db, actor, shopId, id);
      if (row.status !== "running" || row.lease_until.getTime() <= Date.now() || signal.aborted)
        throw new ProviderFailure("cancelled");
      if ((await context(db, actor, shopId)).digest !== snapshot.digest)
        throw new AccessError(409, "ai_context_changed");
      await validateReferences(db, shopId, result.candidate);
      const updated = (
        await db.query(
          "UPDATE ai_design_requests SET status='proposed',version=version+1,candidate=$2,patches=$3,decisions=$4,path=$5,review_warning=$6,review_status=$7 WHERE id=$1 RETURNING *",
          [
            id,
            JSON.stringify(result.candidate),
            JSON.stringify(result.intent.patches),
            JSON.stringify(result.intent.decisions),
            result.path,
            result.reviewWarning,
            result.reviewStatus,
          ],
        )
      ).rows[0] as RequestRow;
      await audit(db, actor, "ai.design.proposed", id, snapshot.merchantId, {
        path: result.path,
        baseVersion: v.version,
      });
      await access(db, actor, shopId);
      return present(updated);
    });
  } catch (error) {
    const code =
      error instanceof AccessError
        ? error.code
        : error instanceof ProviderFailure
          ? `provider_${error.code}`
          : signal.aborted
            ? "provider_cancelled"
            : error instanceof Error && error.message === "external_consent_required"
              ? "external_consent_required"
              : "ai_request_failed";
    const status =
      error instanceof AccessError
        ? "conflict"
        : code === "provider_rate_limited"
          ? "rate_limited"
          : code === "provider_cancelled"
            ? "cancelled"
            : ["provider_unavailable", "external_consent_required"].includes(code)
              ? "unavailable"
              : "failed";
    await pool.query(
      "UPDATE ai_design_requests SET status=$2,version=version+1,failure_code=$3 WHERE id=$1 AND status='running' AND lease_token=$4",
      [id, status, code, lease],
    );
    if (error instanceof AccessError) throw error;
    return readAssistantRequest(pool, actor, shopId, id);
  } finally {
    controllers.delete(id);
  }
}
export async function assistantDecision(
  pool: Pool,
  actor: Actor,
  shopId: string,
  id: string,
  input: z.infer<typeof assistantCommand>,
) {
  const v = assistantCommand.parse(input);
  const result = await transaction(pool, async (db) => {
    const shop = await lock(db, actor, shopId),
      row = await requestRow(db, actor, shopId, id);
    if (row.command_action === v.action && row.command_version === v.version) {
      if (row.command_warning !== v.acceptReviewWarning)
        throw new AccessError(409, "retry_payload_changed");
      await access(db, actor, shopId);
      return present(row);
    }
    currentVersion(row.version, v.version);
    if (row.expires_at.getTime() <= Date.now()) throw new AccessError(409, "ai_proposal_expired");
    if (v.action === "apply") {
      if (row.status !== "proposed" || !row.candidate || !row.patches)
        throw new AccessError(409, "ai_proposal_unavailable");
      if (row.decisions.some((decision) => decision.blocking))
        throw new AccessError(422, "ai_design_decision_required");
      if (row.review_warning && !v.acceptReviewWarning)
        throw new AccessError(422, "ai_review_acknowledgment_required");
      const current = await context(db, actor, shopId);
      if (current.digest !== row.context_digest) throw new AccessError(409, "ai_context_changed");
      const next = compileIntent(current.data, {
        patches: row.patches,
        decisions: row.decisions,
        confidence: "high",
        review: "not_needed",
      });
      if (JSON.stringify(next) !== JSON.stringify(shopSpecification.parse(row.candidate)))
        throw new AccessError(409, "ai_proposal_changed");
      const design = await state(db, shopId, shop.merchant_id);
      currentVersion(design.version, row.base_version);
      const saved = await insertRevision(
        db,
        actor,
        shopId,
        shop.merchant_id,
        design,
        next,
        "Merchant confirmed assistant proposal",
      );
      const updated = (
        await db.query(
          "UPDATE ai_design_requests SET status='applied',version=version+1,candidate=NULL,patches=NULL,command_action=$2,command_version=$3,result_version=$4,result_revision=$5,command_warning=$6 WHERE id=$1 RETURNING *",
          [id, v.action, v.version, saved.version, saved.revision, v.acceptReviewWarning],
        )
      ).rows[0] as RequestRow;
      await audit(db, actor, "ai.design.applied", id, shop.merchant_id, {
        revision: saved.revision,
      });
      await access(db, actor, shopId);
      return present(updated);
    }
    if (!["running", "proposed"].includes(row.status))
      throw new AccessError(409, "ai_proposal_unavailable");
    const updated = (
      await db.query(
        "UPDATE ai_design_requests SET status=$2,version=version+1,candidate=NULL,patches=NULL,command_action=$3,command_version=$4,command_warning=$5 WHERE id=$1 RETURNING *",
        [
          id,
          v.action === "cancel" ? "cancelled" : "rejected",
          v.action,
          v.version,
          v.acceptReviewWarning,
        ],
      )
    ).rows[0] as RequestRow;
    await audit(db, actor, `ai.design.${updated.status}`, id, shop.merchant_id, {});
    await access(db, actor, shopId);
    return present(updated);
  });
  if (v.action === "cancel") controllers.get(id)?.abort();
  return result;
}
export async function cleanupAssistantRequests(db: PoolClient) {
  await db.query(
    "UPDATE ai_design_requests SET status='expired',version=version+1,candidate=NULL,patches=NULL WHERE id IN(SELECT id FROM ai_design_requests WHERE (status='proposed' AND expires_at<=clock_timestamp()) OR (status='running' AND lease_until<=clock_timestamp()) ORDER BY expires_at,id LIMIT 1000 FOR UPDATE SKIP LOCKED)",
  );
}

export async function readAssistantPreview(pool: Pool, actor: Actor, shopId: string, id: string) {
  return transaction(pool, async (db) => {
    const shop = await lock(db, actor, shopId),
      row = await requestRow(db, actor, shopId, id);
    if (
      row.status !== "proposed" ||
      !row.candidate ||
      !row.patches ||
      row.expires_at.getTime() <= Date.now()
    )
      throw new AccessError(404, "resource_unavailable");
    const current = await context(db, actor, shopId);
    if (current.digest !== row.context_digest) throw new AccessError(409, "ai_context_changed");
    const spec = compileIntent(current.data, {
      patches: row.patches,
      decisions: row.decisions,
      confidence: "high",
      review: "not_needed",
    });
    if (JSON.stringify(spec) !== JSON.stringify(shopSpecification.parse(row.candidate)))
      throw new AccessError(409, "ai_proposal_changed");
    await validateReferences(db, shopId, spec);
    const view = await assemble(db, { ...shop, design: spec, revision: 0 }, true);
    await access(db, actor, shopId);
    return view;
  });
}
