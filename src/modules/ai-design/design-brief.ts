import type { DesignContext, DesignIntent } from "./contract";
import { shopSpecification, type ShopSpace } from "../shop-design/specification";

// These authored recipes use current, authorised catalogue references only.
// They never fetch a URL, invent stock/claims or change contact/payment facts.
export function designBriefIntent(
  context: DesignContext,
  instruction: string,
): DesignIntent | null {
  const text = instruction.trim();
  const namedDirection = /\b(?:make|create|design|build|give|refresh|redesign|use)\b/i.test(text);
  const direction = namedDirection
    ? /\b(nature|natural|organic|agricultur\w*|farm\w*|fresh|modern|minimal\w*|bold|luxur\w*|premium|editorial|warm|dark|playful)\b/i
        .exec(text)?.[1]
        ?.toLowerCase()
    : undefined;
  const result = (patches: DesignIntent["patches"]): DesignIntent => ({
    patches,
    decisions: [],
    confidence: "high",
    review: "not_needed",
  });
  if (direction) {
    const theme = /nature|natural|organic|agricultur|farm|fresh/.test(direction)
      ? "botanica"
      : /dark|luxur|premium/.test(direction)
        ? "nocturne"
        : /minimal/.test(direction)
          ? "folio"
          : direction === "bold"
            ? "pulse"
            : direction === "warm"
              ? "harvest"
              : direction === "editorial"
                ? "atelier"
                : "mosaic";
    const patches: DesignIntent["patches"] = [{ op: "storefront_theme", id: theme }],
      spaces = [...context.specification.spaces];
    const uniqueId = (base: string) => {
      let id = base,
        suffix = 1;
      while (spaces.some((space) => space.id === id)) id = `${base}-${suffix++}`;
      return id;
    };
    const append = (space: ShopSpace) => {
      if (spaces.length >= 8) return;
      // Respect the existing page/card budget before proposing an addition.
      const parsed = shopSpecification.safeParse({
        ...context.specification,
        spaces: [...spaces, space],
      });
      if (!parsed.success) return;
      spaces.push(space);
      patches.push({ op: "add_space", space });
    };
    if (!spaces.some((space) => space.type === "hero" || space.type === "entrance")) {
      const hero: ShopSpace = {
        id: uniqueId("welcome"),
        type: "hero",
        version: 1,
        variant: "split",
        title: { text: context.shop.name.slice(0, 100), provenance: "merchant" },
        subtitle: context.shop.tagline
          ? { text: context.shop.tagline.slice(0, 240), provenance: "merchant" }
          : null,
        featuredProductId: null,
        cta: "browse",
      };
      const first = spaces[0]?.id;
      append(hero);
      if (first && spaces.some((space) => space.id === hero.id))
        patches.push({ op: "move", spaceId: hero.id, before: first });
    }
    if (
      context.products.length &&
      !spaces.some((space) => "productIds" in space || "departmentId" in space)
    )
      append({
        id: uniqueId("collection"),
        type: "product_section",
        version: 1,
        variant: "grid",
        title: { text: "Explore the collection", provenance: "ai" },
        departmentId: null,
        productIds: context.products.slice(0, 6).map((item) => item.id),
      });
    if (!spaces.some((space) => ["commerce_info", "contact", "service_desk"].includes(space.type)))
      append({
        id: uniqueId("shop-information"),
        type: "commerce_info",
        version: 1,
        variant: "summary",
      });
    return result(patches);
  }
  const announcement = /^(?:set|change) (?:the )?announcement to [“"](.{1,160})[”"]\.?$/i.exec(
    text,
  );
  if (announcement) return result([{ op: "announcement", text: announcement[1]! }]);
  if (/\b(?:https?:\/\/|www\.)\S+/i.test(text))
    return {
      patches: [],
      confidence: "high",
      review: "not_needed",
      decisions: [
        {
          type: "design_decision",
          code: "MISSING_MERCHANT_INFORMATION",
          blocking: true,
          question:
            "I cannot open reference websites. Which direction should I use? Describe its colours, layout or text in a new request.",
          options: [
            "Create a nature-inspired storefront",
            "Create a modern storefront",
            "Create a premium dark storefront",
          ],
          recommended: "Create a nature-inspired storefront",
        },
      ],
    };
  return null;
}
