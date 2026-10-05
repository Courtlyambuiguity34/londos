import { z } from "zod";

const identity = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const heading = z.string().trim().min(1).max(100);
export const shopSpecification = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.enum(["earth", "plum", "blue"]),
    announcement: z.string().trim().max(160),
    spaces: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({
              id: identity,
              type: z.literal("department"),
              version: z.literal(1),
              departmentId: z.uuid(),
              limit: z.number().int().min(1).max(8),
            })
            .strict(),
          z
            .object({
              id: identity,
              type: z.literal("products"),
              version: z.literal(1),
              title: heading,
              productIds: z.array(z.uuid()).min(1).max(8),
            })
            .strict(),
          z
            .object({
              id: identity,
              type: z.literal("story"),
              version: z.literal(1),
              title: heading,
              body: z.string().trim().min(1).max(1000),
            })
            .strict(),
          z.object({ id: identity, type: z.literal("contact"), version: z.literal(1) }).strict(),
        ]),
      )
      .max(8),
    actions: z.array(z.enum(["call", "whatsapp", "enquiry"])).max(3),
  })
  .strict()
  .superRefine((spec, context) => {
    if (new TextEncoder().encode(JSON.stringify(spec)).length > 7000)
      context.addIssue({ code: "custom", message: "Specification exceeds the page budget" });
    if (new Set(spec.spaces.map((space) => space.id)).size !== spec.spaces.length)
      context.addIssue({ code: "custom", message: "Space identifiers must be unique" });
    if (new Set(spec.actions).size !== spec.actions.length)
      context.addIssue({ code: "custom", message: "Actions must be unique" });
    let cards = 0;
    for (const space of spec.spaces) {
      if (space.type === "department") cards += space.limit;
      if (space.type === "products") {
        cards += space.productIds.length;
        if (new Set(space.productIds).size !== space.productIds.length)
          context.addIssue({ code: "custom", message: "Product references must be unique" });
      }
    }
    if (cards > 32)
      context.addIssue({
        code: "custom",
        message: "A shop page supports at most 32 product cards",
      });
  });
export type ShopSpecification = z.infer<typeof shopSpecification>;
export const specificationPatch = z.discriminatedUnion("op", [
  z.object({ op: z.literal("move"), spaceId: identity, before: identity }).strict(),
  z.object({ op: z.literal("theme"), theme: z.enum(["earth", "plum", "blue"]) }).strict(),
  z
    .object({
      op: z.literal("actions"),
      actions: z.array(z.enum(["call", "whatsapp", "enquiry"])).max(3),
    })
    .strict(),
]);
export function patchSpecification(
  spec: ShopSpecification,
  input: z.infer<typeof specificationPatch>,
) {
  const patch = specificationPatch.parse(input),
    next = structuredClone(shopSpecification.parse(spec));
  if (patch.op === "theme") next.theme = patch.theme;
  else if (patch.op === "actions") next.actions = patch.actions;
  else {
    const moving = next.spaces.find((space) => space.id === patch.spaceId);
    if (
      !moving ||
      patch.spaceId === patch.before ||
      !next.spaces.some((space) => space.id === patch.before)
    )
      throw new Error("invalid_move");
    next.spaces = next.spaces.filter((space) => space.id !== patch.spaceId);
    next.spaces.splice(
      next.spaces.findIndex((space) => space.id === patch.before),
      0,
      moving,
    );
  }
  return shopSpecification.parse(next);
}
