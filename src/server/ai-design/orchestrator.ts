import { setTimeout } from "node:timers/promises";
import {
  designIntent,
  deterministicIntent,
  compileIntent,
  type DesignContext,
  type DesignIntent,
} from "../../modules/ai-design/contract";
import {
  aiLimits,
  assertNoConfiguredSecrets,
  type AIConfiguration,
  type ProviderKind,
} from "./config";
import { ProviderFailure, type AIProvider, type ProviderUsage } from "./providers";

export type AttemptResult = {
  provider: ProviderKind;
  model: string;
  verification: AIProvider["verification"];
  purpose: "design" | "repair" | "review";
  outcome: string;
  latencyMs: number;
  usage: ProviderUsage;
  retryAt: Date | null;
};
export type OrchestrationHooks = {
  beforeAttempt: (provider: ProviderKind, purpose: AttemptResult["purpose"]) => Promise<void>;
  afterAttempt: (result: AttemptResult) => Promise<void>;
  validate: (spec: ReturnType<typeof compileIntent>) => Promise<void>;
};
export class LondosDesignOrchestrator {
  constructor(
    private readonly config: AIConfiguration,
    private readonly providers: Partial<Record<ProviderKind, AIProvider>>,
  ) {}
  async propose(
    context: DesignContext,
    instruction: string,
    consent: boolean,
    quality: boolean,
    signal: AbortSignal,
    hooks: OrchestrationHooks,
  ) {
    if (Buffer.byteLength(JSON.stringify(context)) > aiLimits.contextBytes)
      throw new ProviderFailure("invalid_response");
    assertNoConfiguredSecrets(JSON.stringify({ context, instruction }), this.config);
    const deterministic = deterministicIntent(context, instruction);
    if (deterministic) {
      const candidate = compileIntent(context, deterministic);
      await hooks.validate(candidate);
      return {
        intent: deterministic,
        candidate,
        path: "deterministic",
        reviewWarning: false,
        reviewStatus: "not_needed",
      };
    }
    if (!consent) throw new Error("external_consent_required");
    const primary: ProviderKind = this.providers.gemini
      ? "gemini"
      : this.config.fallback && this.providers.openai
        ? "openai"
        : "gemini";
    if (!this.config.remote || !this.providers[primary]) throw new ProviderFailure("unavailable");
    let calls = 0;
    const call = async (
      kind: ProviderKind,
      purpose: AttemptResult["purpose"],
      credentialIndex = 0,
      proposal?: DesignIntent,
    ): Promise<DesignIntent> => {
      signal.throwIfAborted();
      if (++calls > aiLimits.maxAttempts) throw new ProviderFailure("invalid_response");
      const provider = this.providers[kind];
      if (!provider) throw new ProviderFailure("unavailable");
      await hooks.beforeAttempt(kind, purpose);
      const started = performance.now();
      let usage: ProviderUsage = { inputTokens: null, outputTokens: null },
        outcome = "invalid_response",
        retryAt: Date | null = null;
      try {
        const reply = await provider.generate({
          context,
          instruction,
          purpose,
          proposal,
          signal,
          credentialIndex,
        });
        signal.throwIfAborted();
        usage = {
          inputTokens:
            reply.usage.inputTokens !== null &&
            Number.isSafeInteger(reply.usage.inputTokens) &&
            reply.usage.inputTokens >= 0 &&
            reply.usage.inputTokens <= aiLimits.inputTokensReservedPerAttempt
              ? reply.usage.inputTokens
              : null,
          outputTokens:
            reply.usage.outputTokens !== null &&
            Number.isSafeInteger(reply.usage.outputTokens) &&
            reply.usage.outputTokens >= 0 &&
            reply.usage.outputTokens <= aiLimits.outputTokensPerAttempt
              ? reply.usage.outputTokens
              : null,
        };
        if (
          reply.usage.inputTokens !== usage.inputTokens ||
          reply.usage.outputTokens !== usage.outputTokens
        )
          throw new ProviderFailure("invalid_response");
        if (Buffer.byteLength(reply.text) > 8192) throw new ProviderFailure("invalid_response");
        assertNoConfiguredSecrets(reply.text, this.config);
        const intent = designIntent.parse(JSON.parse(reply.text)),
          candidate = compileIntent(context, intent);
        await hooks.validate(candidate);
        outcome = "valid";
        return intent;
      } catch (error) {
        if (error instanceof ProviderFailure) {
          outcome = error.code;
          retryAt = error.retryAt;
          throw error;
        }
        if (signal.aborted) {
          outcome = "cancelled";
          throw new ProviderFailure("cancelled");
        }
        throw new ProviderFailure("invalid_response");
      } finally {
        await hooks.afterAttempt({
          provider: kind,
          model: provider.model,
          verification: provider.verification,
          purpose,
          outcome,
          latencyMs: Math.round(performance.now() - started),
          usage,
          retryAt,
        });
      }
    };
    let repaired = false;
    let intent: DesignIntent,
      path = primary;
    try {
      intent = await call(primary, "design");
    } catch (error) {
      if (
        !(error instanceof ProviderFailure) ||
        signal.aborted ||
        error.code === "rate_limited" ||
        error.code === "cancelled"
      )
        throw error;
      if (
        error.code === "authentication" &&
        primary === "gemini" &&
        this.config.authFailover &&
        (this.config.providers.gemini?.keys.length ?? 0) > 1
      )
        intent = await call(primary, "design", 1);
      else if (error.code === "invalid_response") {
        repaired = true;
        intent = await call(primary, "repair");
      } else if (this.config.fallback && primary === "gemini" && this.providers.openai) {
        path = "openai";
        intent = await call("openai", "design");
      } else if (error.code === "unavailable" || error.code === "timeout") {
        await setTimeout(300, undefined, { signal });
        intent = await call(primary, "design");
      } else throw error;
    }
    let reviewWarning = intent.confidence === "low",
      reviewStatus = "not_needed";
    if (quality || repaired || reviewWarning || intent.review === "recommended") {
      if (path === "openai") {
        reviewWarning = true;
        reviewStatus = "initial_fallback_requires_review";
      } else if (this.providers.openai && calls < aiLimits.maxAttempts) {
        try {
          const prior = JSON.stringify(intent.patches),
            reviewed = await call("openai", "review", 0, intent);
          reviewWarning =
            reviewed.confidence === "low" || prior !== JSON.stringify(reviewed.patches);
          reviewStatus = reviewWarning ? "review_changed_or_low_confidence" : "reviewed";
          intent = reviewed;
        } catch (error) {
          // A transport/configuration failure is not an invalid design. Retain
          // the already validated candidate, with an explicit review warning.
          // Invalid reviewer content, lost authority and cancellation still fail.
          if (
            !(error instanceof ProviderFailure) ||
            signal.aborted ||
            !["authentication", "unavailable", "timeout", "rate_limited"].includes(error.code)
          )
            throw error;
          reviewWarning = true;
          reviewStatus = `review_${error.code}`;
        }
      } else {
        reviewWarning = true;
        reviewStatus = "review_unavailable";
      }
    }
    return { intent, candidate: compileIntent(context, intent), path, reviewWarning, reviewStatus };
  }
}
