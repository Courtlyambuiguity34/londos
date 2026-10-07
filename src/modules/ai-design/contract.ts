import { z } from "zod";
import {
  shopSpecification,
  specificationPatch,
  patchSpecification,
  type ShopSpecification,
  departmentReferences,
  productReferences,
} from "../shop-design/specification";

const space = shopSpecification.shape.spaces.element;
const identity = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const safeText = z.string().trim().max(160);

export const designDecision = z
  .object({
    type: z.literal("design_decision"),
    code: z.enum([
      "FEATURED_PRODUCT_DUPLICATION",
      "MISSING_MERCHANT_INFORMATION",
      "AMBIGUOUS_PRIORITY",
      "COMMERCE_DISPLAY_CHOICE",
      "MOBILE_NAVIGATION_CHOICE",
    ]),
    question: z.string().trim().min(4).max(240),
    options: z.array(z.string().trim().min(1).max(120)).min(2).max(5),
    recommended: z.string().trim().min(1).max(120),
    blocking: z.boolean(),
  })
  .strict();

export const aiPatch = z.union([
  specificationPatch,
  z.object({ op: z.literal("announcement"), text: safeText }).strict(),
  z.object({ op: z.literal("add_space"), space }).strict(),
  z.object({ op: z.literal("replace_space"), spaceId: identity, space }).strict(),
  z.object({ op: z.literal("remove_space"), spaceId: identity }).strict(),
]);

export const designIntent = z
  .object({
    patches: z.array(aiPatch).max(8),
    decisions: z.array(designDecision).max(4).default([]),
    confidence: z.enum(["high", "low"]),
    review: z.enum(["not_needed", "recommended"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.patches.length && !value.decisions.length)
      ctx.addIssue({ code: "custom", message: "Intent must contain a patch or design decision" });
    if (value.decisions.some((d) => d.blocking) && value.patches.length)
      ctx.addIssue({
        code: "custom",
        message: "Blocking design decisions must be resolved before layout changes",
      });
  });

export type DesignIntent = z.infer<typeof designIntent>;
export type DesignContext = {
  shop: { name: string; category: string; tagline: string };
  specification: ShopSpecification;
  departments: { id: string; name: string; version: number }[];
  products: {
    id: string;
    name: string;
    version: number;
    departmentId?: string;
    departmentName?: string;
    kind?: "product" | "service";
    priceMinor?: string | null;
    currency?: string;
    availability?: string;
  }[];
  protectedFacts?: {
    contact: {
      phone: string;
      whatsapp: string;
      website: string;
      fulfilment: string;
      paymentInstructions: string;
      deliveryInstructions: string;
      enquiriesEnabled: boolean;
    } | null;
  };
  supported?: {
    premiseStyles: string[];
    sectionTypes: string[];
    colorTokens: string[];
    typography: string[];
  };
};

export class DesignIntegrityError extends Error {
  constructor(
    readonly code:
      | "unavailable_reference"
      | "reference_integrity"
      | "unsafe_generated_text"
      | "unsupported_claim"
      | "protected_fact_mutation",
    readonly detail: Record<string, string> = {},
  ) {
    super(code);
  }
}

export const assistantRequest = z
  .object({
    key: z.uuid(),
    version: z.number().int().min(0),
    instruction: z.string().trim().min(2).max(2000),
    externalConsent: z.boolean(),
    qualityReview: z.boolean(),
  })
  .strict();

export const assistantCommand = z
  .object({
    action: z.enum(["apply", "reject", "cancel"]),
    version: z.number().int().positive(),
    confirm: z.literal(true),
    acceptReviewWarning: z.boolean(),
  })
  .strict();

const unsafe = /<\/?(?:script|iframe|style)|javascript:|on(?:error|load)\s*=|\x60\x60\x60/i;
const strongUnsupportedClaim =
  /\b(?:best|number\s*one|#1|guaranteed|guarantee|authentic|official|award[- ]winning|free delivery|same[- ]day delivery|lowest price|cheapest|100% original)\b/i;

function richCopy(spec: ShopSpecification) {
  return spec.spaces.flatMap((section) => {
    if (section.type === "hero")
      return [section.title, ...(section.subtitle ? [section.subtitle] : [])];
    if (section.type === "featured_product") return [section.title];
    if (section.type === "product_section") return [section.title];
    if (section.type === "department_editorial") return [section.title, section.body];
    return [];
  });
}

export function compileIntent(context: DesignContext, input: unknown): ShopSpecification {
  const intent = designIntent.parse(input);
  let next = shopSpecification.parse(context.specification);
  for (const patch of intent.patches) {
    if (["move", "theme", "actions", "presentation"].includes(patch.op))
      next = patchSpecification(next, specificationPatch.parse(patch));
    else if (patch.op === "announcement") next = { ...next, announcement: patch.text };
    else if (patch.op === "add_space") next = { ...next, spaces: [...next.spaces, patch.space] };
    else if (patch.op === "replace_space") {
      if (!next.spaces.some((s) => s.id === patch.spaceId) || patch.space.id !== patch.spaceId)
        throw new DesignIntegrityError("unavailable_reference", { spaceId: patch.spaceId });
      next = {
        ...next,
        spaces: next.spaces.map((s) => (s.id === patch.spaceId ? patch.space : s)),
      };
    } else if (patch.op === "remove_space") {
      if (!next.spaces.some((s) => s.id === patch.spaceId))
        throw new DesignIntegrityError("unavailable_reference", { spaceId: patch.spaceId });
      next = { ...next, spaces: next.spaces.filter((s) => s.id !== patch.spaceId) };
    }
    next = shopSpecification.parse(next);
  }

  const departments = new Set(context.departments.map((d) => d.id));
  const products = new Map(context.products.map((p) => [p.id, p]));
  const foreignDepartment = departmentReferences(next).find((id) => !departments.has(id));
  const foreignProduct = productReferences(next).find((id) => !products.has(id));
  if (foreignDepartment)
    throw new DesignIntegrityError("unavailable_reference", { departmentId: foreignDepartment });
  if (foreignProduct)
    throw new DesignIntegrityError("unavailable_reference", { productId: foreignProduct });

  for (const section of next.spaces) {
    if (section.type === "featured_product") {
      const product = products.get(section.productId)!;
      if (product.departmentId !== section.departmentId)
        throw new DesignIntegrityError("reference_integrity", {
          productId: section.productId,
          expectedDepartmentId: section.departmentId,
          actualDepartmentId: product.departmentId ?? "unknown",
        });
    }
    if (section.type === "product_section" && section.departmentId) {
      for (const productId of section.productIds) {
        const product = products.get(productId)!;
        if (product.departmentId !== section.departmentId)
          throw new DesignIntegrityError("reference_integrity", {
            productId,
            expectedDepartmentId: section.departmentId,
            actualDepartmentId: product.departmentId ?? "unknown",
          });
      }
    }
  }

  const texts = [
    next.announcement,
    ...next.spaces.flatMap((s) => {
      const values: string[] = [];
      if ("title" in s && typeof s.title === "string") values.push(s.title);
      if ("body" in s && typeof s.body === "string") values.push(s.body);
      return values;
    }),
    ...richCopy(next).map((field) => field.text),
  ];
  if (texts.some((t) => unsafe.test(t))) throw new DesignIntegrityError("unsafe_generated_text");

  for (const field of richCopy(next)) {
    if (field.provenance === "ai" && strongUnsupportedClaim.test(field.text))
      throw new DesignIntegrityError("unsupported_claim", { text: field.text.slice(0, 80) });
  }
  return next;
}

export function deterministicIntent(
  context: DesignContext,
  instruction: string,
): DesignIntent | null {
  const text = instruction.trim().replace(/[.!]$/, "").toLowerCase();
  const theme =
    /^(?:use|switch to|make (?:the|my) shop) (earth|plum|blue)(?: (?:theme|boutique|studio))?$/.exec(
      text,
    );
  if (theme)
    return {
      patches: [{ op: "theme", theme: theme[1] as ShopSpecification["theme"] }],
      decisions: [],
      confidence: "high",
      review: "not_needed",
    };
  const action =
    /^(show|hide|remove|keep) (?:the )?(call|whatsapp|enquiry|enquiries)(?: (?:button|visible|action))?$/.exec(
      text,
    );
  if (action) {
    const name =
      action[2] === "enquiries" ? "enquiry" : (action[2] as "call" | "whatsapp" | "enquiry");
    const actions = context.specification.actions.filter((a) => a !== name);
    if (["show", "keep"].includes(action[1]!)) actions.push(name);
    return {
      patches: [{ op: "actions", actions }],
      decisions: [],
      confidence: "high",
      review: "not_needed",
    };
  }
  const move = /^move (.+?) (?:above|before) (.+)$/.exec(text);
  if (move) {
    const find = (name: string) =>
      context.specification.spaces.filter(
        (s) =>
          s.type === "department" &&
          context.departments.find((d) => d.id === s.departmentId)?.name.toLowerCase() ===
            name.trim(),
      );
    const a = find(move[1]!);
    const b = find(move[2]!);
    if (a.length === 1 && b.length === 1 && a[0]!.id !== b[0]!.id)
      return {
        patches: [{ op: "move", spaceId: a[0]!.id, before: b[0]!.id }],
        decisions: [],
        confidence: "high",
        review: "not_needed",
      };
  }
  return null;
}

export function changeSummary(intent: DesignIntent): string[] {
  return [
    ...intent.patches.map((p) =>
      p.op === "theme"
        ? "Use " + p.theme + " theme"
        : p.op === "presentation"
          ? "Use " +
            p.presentation.premiseStyle +
            " premises with " +
            p.presentation.density +
            " density"
          : p.op === "actions"
            ? "Show " + (p.actions.join(", ") || "no contact actions")
            : p.op === "move"
              ? "Move " + p.spaceId + " before " + p.before
              : p.op === "announcement"
                ? "Change the shop announcement"
                : p.op === "add_space"
                  ? "Add " + p.space.type + " section"
                  : p.op === "remove_space"
                    ? "Remove " + p.spaceId
                    : "Replace " + p.spaceId,
    ),
    ...intent.decisions.map((decision) => "Decision: " + decision.question),
  ];
}
