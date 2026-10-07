import { z } from "zod";
import { designIntent } from "../../modules/ai-design/contract";

// Keep the provider grammar shallow. Londos reconstructs the canonical intent and
// then runs the strict LSS, reference, provenance and protected-fact validators.
const nullableCopyProvenance = z.enum(["merchant", "ai"]).nullable();
const patch = z
  .object({
    op: z.enum([
      "theme",
      "presentation",
      "actions",
      "move",
      "announcement",
      "add_space",
      "replace_space",
      "remove_space",
    ]),
    theme: z.enum(["earth", "plum", "blue"]).nullable(),
    actions: z
      .array(z.enum(["call", "whatsapp", "enquiry"]))
      .max(3)
      .nullable(),
    spaceId: z.string().max(40).nullable(),
    before: z.string().max(40).nullable(),
    text: z.string().max(240).nullable(),
    spaceType: z
      .enum([
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
        "hero",
        "featured_product",
        "product_section",
        "department_editorial",
        "commerce_info",
      ])
      .nullable(),
    title: z.string().max(240).nullable(),
    titleProvenance: nullableCopyProvenance.optional().default(null),
    subtitle: z.string().max(240).nullable().optional().default(null),
    subtitleProvenance: nullableCopyProvenance.optional().default(null),
    body: z.string().max(1000).nullable(),
    bodyProvenance: nullableCopyProvenance.optional().default(null),
    departmentId: z.string().max(36).nullable(),
    productId: z.string().max(36).nullable().optional().default(null),
    featuredProductId: z.string().max(36).nullable().optional().default(null),
    productIds: z.array(z.string().max(36)).max(8).nullable(),
    limit: z.number().int().min(1).max(8).nullable(),
    kind: z.enum(["all", "product", "service"]).nullable(),
    availability: z.enum(["all", "available"]).nullable(),
    variant: z
      .enum([
        "editorial",
        "split",
        "product_led",
        "spotlight",
        "compact",
        "grid",
        "carousel",
        "summary",
      ])
      .nullable()
      .optional()
      .default(null),
    cta: z.enum(["browse", "whatsapp", "enquiry"]).nullable().optional().default(null),
    premiseStyle: z
      .enum([
        "luxury",
        "streetwear",
        "electronics",
        "food",
        "service",
        "minimalist",
        "editorial",
        "catalogue",
      ])
      .nullable()
      .optional()
      .default(null),
    primary: z.string().max(20).nullable().optional().default(null),
    secondary: z.string().max(20).nullable().optional().default(null),
    background: z.string().max(20).nullable().optional().default(null),
    surface: z.string().max(20).nullable().optional().default(null),
    textColor: z.string().max(20).nullable().optional().default(null),
    accent: z.string().max(20).nullable().optional().default(null),
    typography: z
      .enum(["editorial", "modern", "classic", "technical", "friendly"])
      .nullable()
      .optional()
      .default(null),
    density: z.enum(["airy", "balanced", "compact"]).nullable().optional().default(null),
    contentWidth: z.enum(["narrow", "standard", "wide"]).nullable().optional().default(null),
    desktopNavigation: z
      .enum(["minimal", "department_bar", "editorial"])
      .nullable()
      .optional()
      .default(null),
    mobileNavigation: z
      .enum(["compact", "bottom", "department_bar"])
      .nullable()
      .optional()
      .default(null),
    mobileColumns: z
      .union([z.literal(1), z.literal(2)])
      .nullable()
      .optional()
      .default(null),
    desktopColumns: z
      .union([z.literal(2), z.literal(3), z.literal(4)])
      .nullable()
      .optional()
      .default(null),
  })
  .strict();

const decision = z
  .object({
    type: z.literal("design_decision"),
    code: z.enum([
      "FEATURED_PRODUCT_DUPLICATION",
      "MISSING_MERCHANT_INFORMATION",
      "AMBIGUOUS_PRIORITY",
      "COMMERCE_DISPLAY_CHOICE",
      "MOBILE_NAVIGATION_CHOICE",
    ]),
    question: z.string().max(240),
    options: z.array(z.string().max(120)).min(2).max(5),
    recommended: z.string().max(120),
    blocking: z.boolean(),
  })
  .strict();

export const providerIntent = z
  .object({
    patches: z.array(patch).max(8),
    decisions: z.array(decision).max(4).optional().default([]),
    confidence: z.enum(["high", "low"]),
    review: z.enum(["not_needed", "recommended"]),
  })
  .strict();

function transportGrammar(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(transportGrammar);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              "$schema",
              "format",
              "pattern",
              "minimum",
              "maximum",
              "minLength",
              "maxLength",
              "minItems",
              "maxItems",
            ].includes(key),
        )
        .map(([key, item]) => [key, transportGrammar(item)]),
    );
  return value;
}

export const providerSchema = transportGrammar(z.toJSONSchema(providerIntent, { io: "input" }));
export const providerGuide =
  "Return only the closed wire contract. Every patch contains every patch field; use null for unused fields. " +
  "Use existing catalogue UUIDs only. New rich copy must set provenance=ai unless the exact text is already a merchant fact in context. " +
  "Never rewrite prices, product facts, WhatsApp, phone, website, payment, delivery, pickup or fulfilment facts. " +
  "If genuinely missing information blocks a sound design, return no patches and one blocking design_decision. " +
  "presentation selects only listed premise/palette/typography/density/navigation/column tokens. " +
  "hero supports editorial/split/product_led; featured_product supports spotlight/split/compact; " +
  "product_section supports editorial/grid/carousel; department_editorial supports editorial/split/compact; " +
  "commerce_info supports summary/split. Product sections scoped to a department may contain only products from that department. " +
  "Section version1 is supplied by Londos. Keep at most8 sections,32 cards and3 actions. No HTML, CSS, scripts, URLs, tools or publication.";

function copy(text: string | null, provenance: "merchant" | "ai" | null) {
  return text === null ? null : { text, provenance };
}

function presentationPatch(p: z.infer<typeof patch>) {
  return {
    op: "presentation",
    presentation: {
      premiseStyle: p.premiseStyle,
      palette: {
        primary: p.primary,
        secondary: p.secondary,
        background: p.background,
        surface: p.surface,
        text: p.textColor,
        accent: p.accent,
      },
      typography: p.typography,
      density: p.density,
      contentWidth: p.contentWidth,
      navigation: {
        desktop: p.desktopNavigation,
        mobile: p.mobileNavigation,
      },
      productColumns: {
        mobile: p.mobileColumns,
        desktop: p.desktopColumns,
      },
    },
  };
}

function richSpace(p: z.infer<typeof patch>) {
  const base = { id: p.spaceId, type: p.spaceType, version: 1 };
  if (p.spaceType === "hero")
    return {
      ...base,
      variant: p.variant,
      title: copy(p.title, p.titleProvenance),
      subtitle: copy(p.subtitle, p.subtitleProvenance),
      featuredProductId: p.featuredProductId,
      cta: p.cta,
    };
  if (p.spaceType === "featured_product")
    return {
      ...base,
      variant: p.variant,
      title: copy(p.title, p.titleProvenance),
      departmentId: p.departmentId,
      productId: p.productId,
    };
  if (p.spaceType === "product_section")
    return {
      ...base,
      variant: p.variant,
      title: copy(p.title, p.titleProvenance),
      departmentId: p.departmentId,
      productIds: p.productIds,
    };
  if (p.spaceType === "department_editorial")
    return {
      ...base,
      variant: p.variant,
      title: copy(p.title, p.titleProvenance),
      body: copy(p.body, p.bodyProvenance),
      departmentId: p.departmentId,
    };
  if (p.spaceType === "commerce_info") return { ...base, variant: p.variant };
  if (p.spaceType === "contact") return base;
  if (p.spaceType === "department")
    return { ...base, departmentId: p.departmentId, limit: p.limit };
  if (p.spaceType === "collection")
    return {
      ...base,
      title: p.title,
      departmentId: p.departmentId,
      limit: p.limit,
      kind: p.kind,
      availability: p.availability,
    };
  if (["display", "products", "gallery"].includes(p.spaceType ?? ""))
    return { ...base, title: p.title, productIds: p.productIds };
  return { ...base, title: p.title, body: p.body };
}

export function decodeProviderIntent(text: string): string {
  const wire = providerIntent.parse(JSON.parse(text));
  const spaceFields = new Set([
    "op",
    "spaceId",
    "spaceType",
    "title",
    "titleProvenance",
    "subtitle",
    "subtitleProvenance",
    "body",
    "bodyProvenance",
    "departmentId",
    "productId",
    "featuredProductId",
    "productIds",
    "limit",
    "kind",
    "availability",
    "variant",
    "cta",
  ]);
  const presentationFields = new Set([
    "op",
    "premiseStyle",
    "primary",
    "secondary",
    "background",
    "surface",
    "textColor",
    "accent",
    "typography",
    "density",
    "contentWidth",
    "desktopNavigation",
    "mobileNavigation",
    "mobileColumns",
    "desktopColumns",
  ]);
  const allowed = (op: z.infer<typeof patch>["op"]) =>
    op === "theme"
      ? new Set(["op", "theme"])
      : op === "presentation"
        ? presentationFields
        : op === "actions"
          ? new Set(["op", "actions"])
          : op === "move"
            ? new Set(["op", "spaceId", "before"])
            : op === "announcement"
              ? new Set(["op", "text"])
              : op === "remove_space"
                ? new Set(["op", "spaceId"])
                : spaceFields;
  for (const item of wire.patches)
    for (const [field, value] of Object.entries(item))
      if (!allowed(item.op).has(field) && value !== null && value !== undefined)
        throw new Error("provider_patch_field_not_allowed");
  const patches = wire.patches.map((p) => {
    if (p.op === "theme") return { op: p.op, theme: p.theme };
    if (p.op === "presentation") return presentationPatch(p);
    if (p.op === "actions") return { op: p.op, actions: p.actions };
    if (p.op === "move") return { op: p.op, spaceId: p.spaceId, before: p.before };
    if (p.op === "announcement") return { op: p.op, text: p.text };
    if (p.op === "remove_space") return { op: p.op, spaceId: p.spaceId };
    const space = richSpace(p);
    return {
      op: p.op,
      ...(p.op === "replace_space" ? { spaceId: p.spaceId } : {}),
      space,
    };
  });
  return JSON.stringify(
    designIntent.parse({
      patches,
      decisions: wire.decisions,
      confidence: wire.confidence,
      review: wire.review,
    }),
  );
}
