import { z } from "zod";
import { designIntent } from "../../modules/ai-design/contract";

// Provider decoders reject the combinatorial nested LSS union. Use one shallow,
// closed wire shape, then reconstruct and validate the original canonical union.
const patch = z
  .object({
    op: z.enum([
      "theme",
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
    text: z.string().max(160).nullable(),
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
      ])
      .nullable(),
    title: z.string().max(100).nullable(),
    body: z.string().max(1000).nullable(),
    departmentId: z.string().max(36).nullable(),
    productIds: z.array(z.string().max(36)).max(8).nullable(),
    limit: z.number().int().min(1).max(8).nullable(),
    kind: z.enum(["all", "product", "service"]).nullable(),
    availability: z.enum(["all", "available"]).nullable(),
  })
  .strict();
export const providerIntent = z
  .object({
    patches: z.array(patch).min(1).max(8),
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
// Cardinality/string-range decoder constraints make Gemini's grammar too large.
// They remain mandatory in providerIntent, canonical LSS and transport byte/token
// limits; only the provider-side grammar drops these validation annotations.
export const providerSchema = transportGrammar(z.toJSONSchema(providerIntent, { io: "input" }));
export const providerGuide =
  "Wire contract: each patch contains EVERY schema field; use null for fields not used by that operation. " +
  "theme uses theme; actions uses actions; move uses spaceId and before; announcement uses text; remove_space uses spaceId. " +
  "add_space/replace_space use spaceId as the section id, spaceType, and only fields for that type. " +
  "entrance/story/offer/service_desk use title/body; display/products/gallery use title/productIds (gallery at most4, others8); " +
  "department uses departmentId/limit; collection uses title/departmentId/limit/kind/availability; contact uses no other fields. " +
  "Section version1 is supplied by the server. IDs are existing owned UUIDs for catalogue references; section ids use lowercase letters/digits/hyphens and start with a letter. " +
  "At most8 sections,32 cards,7000 bytes and3 unique actions per resulting shop; keep the change small.";

export function decodeProviderIntent(text: string): string {
  const wire = providerIntent.parse(JSON.parse(text));
  const patches = wire.patches.map((p) => {
    let allowed: string[], result: Record<string, unknown>;
    if (p.op === "theme") {
      allowed = ["theme"];
      result = { op: p.op, theme: p.theme };
    } else if (p.op === "actions") {
      allowed = ["actions"];
      result = { op: p.op, actions: p.actions };
    } else if (p.op === "move") {
      allowed = ["spaceId", "before"];
      result = { op: p.op, spaceId: p.spaceId, before: p.before };
    } else if (p.op === "announcement") {
      allowed = ["text"];
      result = { op: p.op, text: p.text };
    } else if (p.op === "remove_space") {
      allowed = ["spaceId"];
      result = { op: p.op, spaceId: p.spaceId };
    } else {
      const fields =
        p.spaceType === "contact"
          ? []
          : p.spaceType === "department"
            ? ["departmentId", "limit"]
            : p.spaceType === "collection"
              ? ["title", "departmentId", "limit", "kind", "availability"]
              : ["display", "products", "gallery"].includes(p.spaceType ?? "")
                ? ["title", "productIds"]
                : ["title", "body"];
      allowed = ["spaceId", "spaceType", ...fields];
      const space = {
        id: p.spaceId,
        type: p.spaceType,
        version: 1,
        ...Object.fromEntries(fields.map((key) => [key, p[key as keyof typeof p]])),
      };
      result = { op: p.op, ...(p.op === "replace_space" ? { spaceId: p.spaceId } : {}), space };
    }
    if (
      Object.entries(p).some(
        ([key, value]) => key !== "op" && !allowed.includes(key) && value !== null,
      )
    )
      throw new Error("Unexpected provider patch field");
    return result;
  });
  return JSON.stringify(
    designIntent.parse({ patches, confidence: wire.confidence, review: wire.review }),
  );
}
