import { z } from "zod";
export type ProviderKind = "gemini" | "openai";
export type ProviderSettings = {
  model: string;
  keys: string[];
  inputRate: bigint;
  outputRate: bigint;
};
export type AIConfiguration = {
  remote: boolean;
  providers: Partial<Record<ProviderKind, ProviderSettings>>;
  status: Record<ProviderKind, string>;
  fallback: boolean;
  authFailover: boolean;
  dailyCostMicroUsd: bigint;
};
export const aiLimits = {
  instructionCharacters: 2000,
  contextBytes: 32000,
  responseBytes: 65536,
  inputTokensReservedPerAttempt: 65536,
  outputTokensPerAttempt: 4096,
  wireIntentBytes: 24000,
  maxAttempts: 3,
  providerTimeoutMs: 8000,
  requestTimeoutMs: 30000,
  requestLeaseSeconds: 40,
  proposalMinutes: 15,
  dailyRequests: 20,
  dailyReservedTokens: 1000000,
  shopConcurrency: 1,
  globalConcurrency: 3,
} as const;
const integer = z.string().regex(/^(0|[1-9][0-9]{0,9})$/);
export function aiConfiguration(
  env: Record<string, string | undefined> = process.env,
): AIConfiguration {
  const providers: AIConfiguration["providers"] = {},
    status: AIConfiguration["status"] = { gemini: "remote_disabled", openai: "remote_disabled" };
  const remote = env.LONDOS_AI_REMOTE === "true";
  for (const kind of ["gemini", "openai"] as const) {
    if (!remote) continue;
    const prefix = `LONDOS_AI_${kind.toUpperCase()}`;
    const slot = Number(env.LONDOS_AI_GEMINI_SLOT ?? 1);
    const pool =
      kind === "gemini"
        ? Array.from({ length: 5 }, (_, i) => env[`GEMINI_API_KEY_${i + 1}`])
        : [env.LONDOS_OPENAI_API_KEY ?? env.OPENAI_API_KEY];
    const chosen = kind === "gemini" ? pool[slot - 1] : pool[0];
    const model = env[`${prefix}_MODEL`];
    const inputRate = env[`${prefix}_INPUT_MICROUSD_PER_MILLION`],
      outputRate = env[`${prefix}_OUTPUT_MICROUSD_PER_MILLION`];
    if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
      status[kind] = "invalid_configuration";
      continue;
    }
    if (!chosen || chosen.length > 512 || /[\r\n]/.test(chosen)) {
      status[kind] = "credentials_unavailable";
      continue;
    }
    if (
      !model ||
      !(
        kind === "gemini"
          ? /^gemini-[a-z0-9.-]{1,64}$/
          : /^(?:gpt-[a-z0-9.-]{1,64}|o[1-9](?:-[a-z0-9.-]{1,64})?)$/
      ).test(model)
    ) {
      status[kind] = "model_unconfigured";
      continue;
    }
    if (!integer.safeParse(inputRate).success || !integer.safeParse(outputRate).success) {
      status[kind] = "price_estimate_unconfigured";
      continue;
    }
    if (
      (env.HTTPS_PROXY || env.HTTP_PROXY) &&
      env.NODE_USE_ENV_PROXY !== "1" &&
      !process.execArgv.includes("--use-env-proxy")
    ) {
      status[kind] = "proxy_initialization_required";
      continue;
    }
    const keys = [chosen];
    if (kind === "gemini" && env.LONDOS_AI_AUTH_FAILOVER === "true") {
      const spare = pool.find((k) => k && k !== chosen && k.length <= 512 && !/[\r\n]/.test(k));
      if (spare) keys.push(spare);
    }
    providers[kind] = {
      model,
      keys,
      inputRate: BigInt(inputRate!),
      outputRate: BigInt(outputRate!),
    };
    status[kind] = "configured_unverified";
  }
  const budget = env.LONDOS_AI_DAILY_COST_MICROUSD ?? "1000000";
  if (!integer.safeParse(budget).success || BigInt(budget) <= 0n) {
    delete providers.gemini;
    delete providers.openai;
    status.gemini = status.openai = "invalid_configuration";
  }
  return {
    remote,
    providers,
    status,
    fallback: env.LONDOS_AI_ALLOW_OPENAI_FALLBACK === "true",
    authFailover: env.LONDOS_AI_AUTH_FAILOVER === "true",
    dailyCostMicroUsd: integer.safeParse(budget).success ? BigInt(budget) : 0n,
  };
}
export function estimateCost(settings: ProviderSettings, input: number, output: number): bigint {
  return (
    (BigInt(input) * settings.inputRate + BigInt(output) * settings.outputRate + 999999n) / 1000000n
  );
}
export function reservation(config: AIConfiguration) {
  const maximum = Object.values(config.providers).reduce((n, s) => {
    const cost = estimateCost(
      s,
      aiLimits.inputTokensReservedPerAttempt,
      aiLimits.outputTokensPerAttempt,
    );
    return cost > n ? cost : n;
  }, 0n);
  return {
    tokens:
      (aiLimits.inputTokensReservedPerAttempt + aiLimits.outputTokensPerAttempt) *
      aiLimits.maxAttempts,
    cost: maximum * BigInt(aiLimits.maxAttempts),
  };
}
export function assertNoConfiguredSecrets(text: string, config: AIConfiguration) {
  const values = [
    process.env.AUTH_SECRET,
    process.env.DATABASE_URL,
    process.env.OPENAI_API_KEY,
    process.env.LONDOS_OPENAI_API_KEY,
    ...Array.from({ length: 5 }, (_, i) => process.env[`GEMINI_API_KEY_${i + 1}`]),
    ...Object.values(config.providers).flatMap((s) => s.keys),
  ];
  if (process.env.DATABASE_URL) values.push(new URL(process.env.DATABASE_URL).password);
  if (values.some((v) => v && v.length >= 12 && text.includes(v)))
    throw new Error("secret_boundary");
}
