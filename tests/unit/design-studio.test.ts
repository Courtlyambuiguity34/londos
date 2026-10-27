import { test, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  compileIntent,
  changeSummary,
  deterministicIntent,
  type DesignContext,
} from "../../src/modules/ai-design/contract";
import { LondosDesignOrchestrator } from "../../src/server/ai-design/orchestrator";
import { ProviderFailure, type AIProvider } from "../../src/server/ai-design/providers";
import { type AIConfiguration } from "../../src/server/ai-design/config";
import { providerSchema, decodeProviderIntent } from "../../src/server/ai-design/provider-contract";
import { readableForeground } from "../../src/modules/shop-themes/colors";

const department = randomUUID(),
  product = randomUUID();
const context: DesignContext = {
  shop: {
    name: "Fictional seed suppliers",
    category: "food",
    tagline: "Seeds and tools for your garden",
  },
  specification: {
    schemaVersion: 1,
    theme: "earth",
    announcement: "",
    spaces: [],
    actions: ["whatsapp"],
  },
  departments: [{ id: department, name: "Garden", version: 1 }],
  products: [{ id: product, name: "Garden tool", version: 1, departmentId: department }],
};
test("a local agricultural brief builds a coherent bounded design from current merchant facts", () => {
  const before = structuredClone(context);
  const intent = deterministicIntent(context, "Create a nature-inspired storefront");
  const candidate = compileIntent(context, intent);
  expect(changeSummary(intent!, candidate)).toEqual([
    "Use Botanica storefront theme",
    "Add main feature",
    "Add product collection",
    "Add shop information",
  ]);
  expect(candidate.storefrontTheme).toBe("botanica");
  expect(candidate.spaces.map((space) => space.type)).toEqual([
    "hero",
    "product_section",
    "commerce_info",
  ]);
  expect(candidate.spaces[0]).toMatchObject({
    title: { text: context.shop.name, provenance: "merchant" },
    subtitle: { text: context.shop.tagline, provenance: "merchant" },
  });
  expect(candidate.spaces[1]).toMatchObject({ productIds: [product] });
  expect(candidate.actions).toEqual(["whatsapp"]);
  expect(context).toEqual(before);
});
test("design recipes preserve existing merchant copy and a full eight-section page", () => {
  const current = {
    ...context,
    specification: {
      ...context.specification,
      spaces: Array.from({ length: 8 }, (_, index) => ({
        id: `story-${index}`,
        type: "story" as const,
        version: 1 as const,
        title: `Merchant story ${index}`,
        body: "Original merchant writing.",
      })),
    },
  };
  const candidate = compileIntent(
    current,
    deterministicIntent(current, "Create a modern storefront"),
  );
  expect(candidate.spaces).toEqual(current.specification.spaces);
  expect(candidate.storefrontTheme).toBe("mosaic");
});
test("a URL-only brief asks for usable direction without pretending to browse or changing a draft", () => {
  const intent = deterministicIntent(
    context,
    "I want something that brings out www.example.invalid which is my website",
  );
  expect(intent?.decisions[0]).toMatchObject({
    blocking: true,
    code: "MISSING_MERCHANT_INFORMATION",
  });
  expect(intent?.decisions[0]?.question).toContain("cannot open");
  expect(compileIntent(context, intent)).toEqual(context.specification);
});
test("quoted announcements are plain merchant edits and preserve catalogue references", () => {
  const next = compileIntent(
    context,
    deterministicIntent(context, 'Set announcement to "New collection is here"'),
  );
  expect(next.announcement).toBe("New collection is here");
  expect(next.spaces).toEqual(context.specification.spaces);
});
test("provider schemas are closed and require every nullable field without unsupported defaults", () => {
  const inspect = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(inspect);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    expect(Object.hasOwn(node, "default")).toBe(false);
    if (node.type === "object") {
      expect(node.additionalProperties).toBe(false);
      expect(node.required).toEqual(Object.keys(node.properties as object));
    }
    Object.values(node).forEach(inspect);
  };
  inspect(providerSchema);
});
test("remote providers can select an installed theme while unrelated patch fields remain rejected", () => {
  const schema = providerSchema as {
    properties: { patches: { items: { properties: Record<string, unknown> } } };
  };
  const patch = {
    ...Object.fromEntries(
      Object.keys(schema.properties.patches.items.properties).map((key) => [key, null]),
    ),
    op: "storefront_theme",
    themeId: "nocturne",
  };
  const wire = { patches: [patch], decisions: [], confidence: "high", review: "not_needed" };
  const intent = JSON.parse(decodeProviderIntent(JSON.stringify(wire)));
  expect(compileIntent(context, intent).storefrontTheme).toBe("nocturne");
  expect(() =>
    decodeProviderIntent(
      JSON.stringify({ ...wire, patches: [{ ...patch, text: "Unexpected text" }] }),
    ),
  ).toThrow();
});
test.each(["authentication", "unavailable", "timeout", "rate_limited"] as const)(
  "an optional review %s retains the validated design and requires acknowledgement",
  async (code) => {
    const settings = { model: "fixture", keys: ["FICTIONAL_KEY"], inputRate: 1n, outputRate: 1n };
    const config: AIConfiguration = {
      remote: true,
      providers: { gemini: settings, openai: settings },
      status: { gemini: "configured_unverified", openai: "configured_unverified" },
      fallback: false,
      authFailover: false,
      dailyCostMicroUsd: 1000000n,
    };
    const gemini: AIProvider = {
      kind: "gemini",
      verification: "fixture",
      model: "fixture",
      generate: vi.fn(async () => ({
        text: JSON.stringify({
          patches: [{ op: "theme", theme: "plum" }],
          decisions: [],
          confidence: "high",
          review: "not_needed",
        }),
        usage: { inputTokens: 10, outputTokens: 10 },
      })),
    };
    const openai: AIProvider = {
      ...gemini,
      kind: "openai",
      generate: vi.fn(async () => {
        throw new ProviderFailure(code);
      }),
    };
    const attempts: string[] = [];
    const result = await new LondosDesignOrchestrator(config, { gemini, openai }).propose(
      context,
      "Please improve the presentation",
      true,
      true,
      new AbortController().signal,
      {
        beforeAttempt: async () => {},
        afterAttempt: async (result) => {
          attempts.push(result.outcome);
        },
        validate: async () => {},
      },
    );
    expect(result.candidate.theme).toBe("plum");
    expect(result.reviewWarning).toBe(true);
    expect(result.reviewStatus).toBe(`review_${code}`);
    expect(attempts).toEqual(["valid", code]);
    expect(openai.generate).toHaveBeenCalledTimes(1);
  },
);
test("dark and pale secondary panels choose legible foregrounds", () => {
  expect(readableForeground("plum")).toBe("#ffffff");
  expect(readableForeground("sand")).toBe("#151515");
});

test("new provider section anchors are normalised and their moves follow the allocated anchor", () => {
  const schema = providerSchema as {
    properties: { patches: { items: { properties: Record<string, unknown> } } };
  };
  const empty = Object.fromEntries(
    Object.keys(schema.properties.patches.items.properties).map((key) => [key, null]),
  );
  const current = {
    ...context,
    specification: {
      ...context.specification,
      spaces: [
        {
          id: "original",
          type: "story" as const,
          version: 1 as const,
          title: "Merchant story",
          body: "Original merchant text",
        },
      ],
    },
  };
  const wire = {
    patches: [
      {
        ...empty,
        op: "add_space",
        spaceId: "123_Garden_Hero",
        spaceType: "hero",
        variant: "split",
        title: "Garden collection",
        titleProvenance: "ai",
        cta: "browse",
      },
      { ...empty, op: "move", spaceId: "123_Garden_Hero", before: "original" },
    ],
    decisions: [],
    confidence: "high",
    review: "not_needed",
  };
  const intent = JSON.parse(decodeProviderIntent(JSON.stringify(wire), current));
  expect(compileIntent(current, intent).spaces.map((space) => space.id)).toEqual([
    "section-123-garden-hero",
    "original",
  ]);
  expect(() =>
    decodeProviderIntent(
      JSON.stringify({ ...wire, patches: [{ ...wire.patches[0], spaceId: "original" }] }),
      current,
    ),
  ).toThrow("duplicate_new_section_id");
  expect(() =>
    compileIntent(
      current,
      JSON.parse(
        decodeProviderIntent(
          JSON.stringify({
            ...wire,
            patches: [{ ...empty, op: "move", spaceId: "123_Existing", before: "original" }],
          }),
          current,
        ),
      ),
    ),
  ).toThrow();
});

test("a classic theme command replaces conflicting named styling without changing shop content", () => {
  const named = compileIntent(context, deterministicIntent(context, "Use Mosaic theme"));
  const current = { ...context, specification: named };
  const blue = compileIntent(current, deterministicIntent(current, "Use blue theme"));
  expect(blue.theme).toBe("blue");
  expect(blue.storefrontTheme).toBeUndefined();
  expect(blue.presentation).toBeUndefined();
  expect(blue.spaces).toEqual(named.spaces);
  expect(blue.branding).toEqual(named.branding);
});
