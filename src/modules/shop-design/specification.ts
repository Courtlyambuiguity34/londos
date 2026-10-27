import { z } from "zod";

const identity = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const heading = z.string().trim().min(1).max(100);
export const copyField = z
  .object({
    text: z.string().trim().min(1).max(240),
    provenance: z.enum(["merchant", "ai"]),
  })
  .strict();
export type CopyField = z.infer<typeof copyField>;

import { presentation } from "./presentation";
import { themeIds, themeDefinitions } from "../shop-themes/registry.generated";
export { presentation, colorToken, type ShopPresentation } from "./presentation";

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

const hero = z
  .object({
    id: identity,
    type: z.literal("hero"),
    version: z.literal(1),
    variant: z.enum(["editorial", "split", "product_led"]),
    title: copyField,
    subtitle: copyField.nullable(),
    featuredProductId: z.uuid().nullable(),
    cta: z.enum(["browse", "whatsapp", "enquiry"]),
  })
  .strict();

const featuredProduct = z
  .object({
    id: identity,
    type: z.literal("featured_product"),
    version: z.literal(1),
    variant: z.enum(["spotlight", "split", "compact"]),
    title: copyField,
    departmentId: z.uuid(),
    productId: z.uuid(),
  })
  .strict();

const productSection = z
  .object({
    id: identity,
    type: z.literal("product_section"),
    version: z.literal(1),
    variant: z.enum(["editorial", "grid", "carousel"]),
    title: copyField,
    departmentId: z.uuid().nullable(),
    productIds: z.array(z.uuid()).min(1).max(8),
  })
  .strict();

const departmentEditorial = z
  .object({
    id: identity,
    type: z.literal("department_editorial"),
    version: z.literal(1),
    variant: z.enum(["editorial", "split", "compact"]),
    title: copyField,
    body: copyField,
    departmentId: z.uuid(),
  })
  .strict();

const commerceInfo = z
  .object({
    id: identity,
    type: z.literal("commerce_info"),
    version: z.literal(1),
    variant: z.enum(["summary", "split"]),
  })
  .strict();

export const shopSpecification = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.enum(["earth", "plum", "blue"]),
    presentation: presentation.optional(),
    storefrontTheme: z
      .string()
      .regex(/^[a-z][a-z0-9-]{1,31}$/)
      .optional(),
    branding: z
      .object({ coverAssetId: z.uuid().nullable(), logoAssetId: z.uuid().nullable() })
      .strict()
      .optional(),
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
          hero,
          featuredProduct,
          productSection,
          departmentEditorial,
          commerceInfo,
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
      if (space.type === "featured_product") cards += 1;
      if (space.type === "hero" && space.featuredProductId) cards += 1;
    }
    if (cards > 32)
      context.addIssue({
        code: "custom",
        message: "A shop page supports at most 32 product cards",
      });
  });

export type ShopSpecification = z.infer<typeof shopSpecification>;
export type ShopSpace = ShopSpecification["spaces"][number];

export function brandingReferences(spec: ShopSpecification) {
  return [
    ...new Set(
      [spec.branding?.coverAssetId, spec.branding?.logoAssetId].filter((id): id is string =>
        Boolean(id),
      ),
    ),
  ];
}

export function departmentReferences(spec: ShopSpecification) {
  return spec.spaces.flatMap((s) =>
    "departmentId" in s && s.departmentId ? [s.departmentId] : [],
  );
}
export function productReferences(spec: ShopSpecification) {
  return spec.spaces.flatMap((s) => {
    if ("productIds" in s) return s.productIds;
    if (s.type === "featured_product") return [s.productId];
    if (s.type === "hero" && s.featuredProductId) return [s.featuredProductId];
    return [];
  });
}
export function spaceProducts<
  T extends { id: string; department_id: string; kind: string; availability: string },
>(space: ShopSpace, products: T[]): T[] {
  if (space.type === "featured_product")
    return products.filter((p) => p.id === space.productId).slice(0, 1);
  if (space.type === "hero" && space.featuredProductId)
    return products.filter((p) => p.id === space.featuredProductId).slice(0, 1);
  if ("productIds" in space)
    return space.productIds.flatMap((id) => products.filter((p) => p.id === id));
  if ("departmentId" in space && space.departmentId)
    return products
      .filter(
        (p) =>
          p.department_id === space.departmentId &&
          (space.type !== "collection" ||
            ((space.kind === "all" || p.kind === space.kind) &&
              (space.availability === "all" || p.availability === "available"))),
      )
      .slice(0, "limit" in space ? space.limit : 8);
  return [];
}

export const specificationPatch = z.discriminatedUnion("op", [
  z.object({ op: z.literal("move"), spaceId: identity, before: identity }).strict(),
  z.object({ op: z.literal("theme"), theme: z.enum(["earth", "plum", "blue"]) }).strict(),
  z.object({ op: z.literal("presentation"), presentation }).strict(),
  z.object({ op: z.literal("storefront_theme"), id: z.enum(themeIds) }).strict(),
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
  if (patch.op === "theme") {
    next.theme = patch.theme;
    delete next.storefrontTheme;
    delete next.presentation;
  } else if (patch.op === "presentation") next.presentation = patch.presentation;
  else if (patch.op === "storefront_theme") {
    const theme = themeDefinitions.find((theme) => theme.id === patch.id)!;
    next.storefrontTheme = theme.id;
    next.presentation = presentation.parse(theme.presentation);
  } else if (patch.op === "actions") next.actions = patch.actions;
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
