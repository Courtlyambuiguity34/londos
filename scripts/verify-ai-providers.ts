import { loadLocalEnv } from "./local-env";
import { aiConfiguration, estimateCost } from "../src/server/ai-design/config";
import { GeminiProvider, OpenAIProvider, ProviderFailure } from "../src/server/ai-design/providers";
import { designIntent, compileIntent, type DesignContext } from "../src/modules/ai-design/contract";
import { shopThemes } from "../src/modules/shop-themes/catalogue";
import { randomUUID } from "node:crypto";
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
const selected = process.argv.find((argument) => argument.startsWith("--provider="))?.slice(11);
const studio = process.argv.includes("--studio");
if (studio) {
  const department = randomUUID();
  context.departments = [{ id: department, name: "Everyday collection", version: 1 }];
  context.products = ["Canvas carry", "Travel pouch"].map((name) => ({
    id: randomUUID(),
    name,
    departmentId: department,
    version: 1,
  }));
  context.supported = {
    themes: shopThemes.map(({ id, name, category }) => ({ id, name, category })),
    premiseStyles: ["minimalist", "editorial"],
    sectionTypes: ["product_section"],
    colorTokens: ["cream", "charcoal", "forest"],
    typography: ["modern", "editorial"],
  };
}
if (selected && !["gemini", "openai"].includes(selected))
  throw new Error("Provider must be gemini or openai");
for (const kind of ["gemini", "openai"] as const) {
  if (selected && selected !== kind) continue;
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
      instruction: studio
        ? "Use the Mosaic storefront theme and add one grid product_section titled Everyday collection using both supplied products. High confidence; no review. Do not change any catalogue facts."
        : "Return one theme patch using plum, high confidence and no review.",
      context,
      purpose: "design",
      signal: AbortSignal.timeout(10000),
      credentialIndex: 0,
    });
    const intent = designIntent.parse(JSON.parse(reply.text)),
      candidate = compileIntent(context, intent);
    if (
      studio
        ? candidate.storefrontTheme !== "mosaic" ||
          !candidate.spaces.some(
            (space) => space.type === "product_section" && space.productIds.length === 2,
          )
        : candidate.theme !== "plum"
    )
      throw Error("contract_failed");
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
  } catch (error) {
    observations.push({
      provider: kind,
      model: settings.model,
      outcome: "failed",
      liveRequest: true,
      error: "live_contract_failed_no_provider_body_logged",
      reason: error instanceof ProviderFailure ? error.code : "invalid_contract",
    });
    process.exitCode = 1;
  }
}
if (process.argv.includes("--require-live") && observations.some((o) => o.outcome !== "passed"))
  process.exitCode = 1;
console.log(
  JSON.stringify({
    check: "live-ai-provider-contracts",
    scenario: studio ? "fictional-storefront" : "fictional-theme",
    recordedAt: new Date().toISOString(),
    selectedProviders: selected ? [selected] : ["gemini", "openai"],
    observations,
    limit:
      "Unavailable is not a passing live contract. This bounded fictional theme check does not establish general design quality, price accuracy or provider billing. No credentials, prompts or provider error bodies printed.",
  }),
);
