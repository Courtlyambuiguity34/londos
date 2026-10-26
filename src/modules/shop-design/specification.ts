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

export const colorToken = z.enum([
  "cream",
  "burgundy",
  "gold",
  "charcoal",
  "white",
  "black",
  "stone",
  "sand",
  "terracotta",
  "sage",
  "forest",
  "navy",
  "sky",
  "plum",
]);
const colorHex: Record<z.infer<typeof colorToken>, string> = {
  cream: "#f7f0e3",
  burgundy: "#6f1735",
  gold: "#b38a3e",
  charcoal: "#292827",
  white: "#ffffff",
  black: "#151515",
  stone: "#d8d2c8",
  sand: "#e5d2b4",
  terracotta: "#a9563f",
  sage: "#8a9a7b",
  forest: "#304b3b",
  navy: "#243a5a",
  sky: "#9fc6dc",
  plum: "#603950",
};
function luminance(hex: string) {
  const values = [1, 3, 5].map((offset) => {
    const raw = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!;
}
function contrast(a: string, b: string) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
export const presentation = z
  .object({
    premiseStyle: z.enum([
      "luxury",
      "streetwear",
      "electronics",
      "food",
      "service",
      "minimalist",
      "editorial",
      "catalogue",
    ]),
    palette: z
      .object({
        primary: colorToken,
        secondary: colorToken,
        background: colorToken,
        surface: colorToken,
        text: colorToken,
        accent: colorToken,
      })
      .strict(),
    typography: z.enum(["editorial", "modern", "classic", "technical", "friendly"]),
    density: z.enum(["airy", "balanced", "compact"]),
    contentWidth: z.enum(["narrow", "standard", "wide"]),
    navigation: z
      .object({
        desktop: z.enum(["minimal", "department_bar", "editorial"]),
        mobile: z.enum(["compact", "bottom", "department_bar"]),
      })
      .strict(),
    productColumns: z
      .object({
        mobile: z.union([z.literal(1), z.literal(2)]),
        desktop: z.union([z.literal(2), z.literal(3), z.literal(4)]),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const pairs: [string, string, number, string][] = [
      [colorHex[value.palette.text], colorHex[value.palette.background], 4.5, "text/background"],
      [colorHex[value.palette.text], colorHex[value.palette.surface], 4.5, "text/surface"],
      [
        colorHex[value.palette.primary],
        colorHex[value.palette.background],
        3,
        "primary/background",
      ],
    ];
    for (const [foreground, background, minimum, label] of pairs)
      if (contrast(foreground, background) < minimum)
        context.addIssue({
          code: "custom",
          message: `Presentation contrast is too low for ${label}`,
        });
  });
export type ShopPresentation = z.infer<typeof presentation>;

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
  else if (patch.op === "presentation") next.presentation = patch.presentation;
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
