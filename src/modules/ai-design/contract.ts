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
export const aiPatch = z.union([
  specificationPatch,
  z.object({ op: z.literal("announcement"), text: safeText }).strict(),
  z.object({ op: z.literal("add_space"), space }).strict(),
  z.object({ op: z.literal("replace_space"), spaceId: identity, space }).strict(),
  z.object({ op: z.literal("remove_space"), spaceId: identity }).strict(),
]);
export const designIntent = z
  .object({
    patches: z.array(aiPatch).min(1).max(8),
    confidence: z.enum(["high", "low"]),
    review: z.enum(["not_needed", "recommended"]),
  })
  .strict();
export type DesignIntent = z.infer<typeof designIntent>;
export type DesignContext = {
  shop: { name: string; category: string; tagline: string };
  specification: ShopSpecification;
  departments: { id: string; name: string; version: number }[];
  products: { id: string; name: string; version: number }[];
};
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
export function compileIntent(context: DesignContext, input: unknown): ShopSpecification {
  const intent = designIntent.parse(input);
  let next = shopSpecification.parse(context.specification);
  for (const patch of intent.patches) {
    if (["move", "theme", "actions"].includes(patch.op))
      next = patchSpecification(next, specificationPatch.parse(patch));
    else if (patch.op === "announcement") next = { ...next, announcement: patch.text };
    else if (patch.op === "add_space") next = { ...next, spaces: [...next.spaces, patch.space] };
    else if (patch.op === "replace_space") {
      if (!next.spaces.some((s) => s.id === patch.spaceId) || patch.space.id !== patch.spaceId)
        throw Error("invalid_space");
      next = {
        ...next,
        spaces: next.spaces.map((s) => (s.id === patch.spaceId ? patch.space : s)),
      };
    } else if (patch.op === "remove_space") {
      if (!next.spaces.some((s) => s.id === patch.spaceId)) throw Error("invalid_space");
      next = { ...next, spaces: next.spaces.filter((s) => s.id !== patch.spaceId) };
    }
    next = shopSpecification.parse(next);
  }
  const departments = new Set(context.departments.map((d) => d.id)),
    products = new Set(context.products.map((p) => p.id));
  if (
    departmentReferences(next).some((id) => !departments.has(id)) ||
    productReferences(next).some((id) => !products.has(id))
  )
    throw Error("unavailable_reference");
  const texts = [
    next.announcement,
    ...next.spaces.flatMap((s) =>
      "body" in s ? [s.title, s.body] : "title" in s ? [s.title] : [],
    ),
  ];
  if (
    texts.some((t) => /<\/?(?:script|iframe|style)|javascript:|on(?:error|load)\s*=|```/i.test(t))
  )
    throw Error("unsafe_generated_text");
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
    return { patches: [{ op: "actions", actions }], confidence: "high", review: "not_needed" };
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
    const a = find(move[1]!),
      b = find(move[2]!);
    if (a.length === 1 && b.length === 1 && a[0]!.id !== b[0]!.id)
      return {
        patches: [{ op: "move", spaceId: a[0]!.id, before: b[0]!.id }],
        confidence: "high",
        review: "not_needed",
      };
  }
  return null;
}
export function changeSummary(intent: DesignIntent): string[] {
  return intent.patches.map((p) =>
    p.op === "theme"
      ? `Use ${p.theme} theme`
      : p.op === "actions"
        ? `Show ${p.actions.join(", ") || "no contact actions"}`
        : p.op === "move"
          ? `Move ${p.spaceId} before ${p.before}`
          : p.op === "announcement"
            ? "Change the shop announcement"
            : p.op === "add_space"
              ? `Add ${p.space.type} section`
              : p.op === "remove_space"
                ? `Remove ${p.spaceId}`
                : `Replace ${p.spaceId}`,
  );
}
