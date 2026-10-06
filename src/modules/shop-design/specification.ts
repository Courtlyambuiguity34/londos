import { z } from "zod";

const identity = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const heading = z.string().trim().min(1).max(100);
const narrative = <T extends "entrance" | "story" | "offer" | "service_desk">(type: T) =>
  z
    .object({
      id: identity,
      type: z.literal(type),
      version: z.literal(1),
      title: heading,
      body: z.string().trim().min(1).max(1000),
    })
    .strict();
const curated = <T extends "products" | "display" | "gallery">(type: T, limit: number) =>
  z
    .object({
      id: identity,
      type: z.literal(type),
      version: z.literal(1),
      title: heading,
      productIds: z.array(z.uuid()).min(1).max(limit),
    })
    .strict();
export const shopSpecification = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.enum(["earth", "plum", "blue"]),
    announcement: z.string().trim().max(160),
    spaces: z
      .array(
        z.discriminatedUnion("type", [
          narrative("entrance"),
          curated("display", 8),
          curated("gallery", 4),
          narrative("offer"),
          narrative("service_desk"),
          z
            .object({
              id: identity,
              type: z.literal("collection"),
              version: z.literal(1),
              title: heading,
              departmentId: z.uuid(),
              limit: z.number().int().min(1).max(8),
              kind: z.enum(["all", "product", "service"]),
              availability: z.enum(["all", "available"]),
            })
            .strict(),
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
      if ("limit" in space) cards += space.limit;
      if ("productIds" in space) {
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
export type ShopSpace = ShopSpecification["spaces"][number];
export function departmentReferences(spec: ShopSpecification) {
  return spec.spaces.flatMap((s) => ("departmentId" in s ? [s.departmentId] : []));
}
export function productReferences(spec: ShopSpecification) {
  return spec.spaces.flatMap((s) => ("productIds" in s ? s.productIds : []));
}
export function spaceProducts<
  T extends { id: string; department_id: string; kind: string; availability: string },
>(space: ShopSpace, products: T[]): T[] {
  if ("productIds" in space)
    return space.productIds.flatMap((id) => products.filter((p) => p.id === id));
  if ("departmentId" in space)
    return products
      .filter(
        (p) =>
          p.department_id === space.departmentId &&
          (space.type !== "collection" ||
            ((space.kind === "all" || p.kind === space.kind) &&
              (space.availability === "all" || p.availability === "available"))),
      )
      .slice(0, space.limit);
  return [];
}
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
