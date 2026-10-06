import { loadLocalEnv } from "./local-env";
import { aiConfiguration, estimateCost } from "../src/server/ai-design/config";
import { GeminiProvider, OpenAIProvider } from "../src/server/ai-design/providers";
import { designIntent, compileIntent, type DesignContext } from "../src/modules/ai-design/contract";
loadLocalEnv();
const config = aiConfiguration(),
  observations = [];
const context: DesignContext = {
  shop: {
    name: "Fictional contract-check shop",
    category: "other",
    tagline: "No real merchant data",
  },
  specification: { schemaVersion: 1, theme: "earth", announcement: "", spaces: [], actions: [] },
  departments: [],
  products: [],
};
for (const kind of ["gemini", "openai"] as const) {
  const settings = config.providers[kind];
  if (!settings) {
    observations.push({
      provider: kind,
      outcome: "unavailable",
      reason: config.status[kind],
      liveRequest: false,
    });
    continue;
  }
  try {
    const provider =
      kind === "gemini"
        ? new GeminiProvider(settings.model, settings.keys)
        : new OpenAIProvider(settings.model, settings.keys);
    const reply = await provider.generate({
      instruction: "Return one theme patch using plum, high confidence and no review.",
      context,
      purpose: "design",
      signal: AbortSignal.timeout(10000),
      credentialIndex: 0,
    });
    const intent = designIntent.parse(JSON.parse(reply.text)),
      candidate = compileIntent(context, intent);
    if (candidate.theme !== "plum") throw Error("contract_failed");
    observations.push({
      provider: kind,
      model: settings.model,
      outcome: "passed",
      liveRequest: true,
      usage: reply.usage,
      estimatedCostMicroUsd:
        reply.usage.inputTokens !== null && reply.usage.outputTokens !== null
          ? estimateCost(settings, reply.usage.inputTokens, reply.usage.outputTokens).toString()
          : null,
    });
  } catch {
    observations.push({
      provider: kind,
      model: settings.model,
      outcome: "failed",
      liveRequest: true,
      error: "live_contract_failed_no_provider_body_logged",
    });
    process.exitCode = 1;
  }
}
if (process.argv.includes("--require-live") && observations.some((o) => o.outcome !== "passed"))
  process.exitCode = 1;
console.log(
  JSON.stringify({
    check: "live-ai-provider-contracts",
    recordedAt: new Date().toISOString(),
    observations,
    limit:
      "Unavailable is not a passing live contract. This bounded fictional theme check does not establish general design quality, price accuracy or provider billing. No credentials, prompts or provider error bodies printed.",
  }),
);
