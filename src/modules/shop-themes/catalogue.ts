import { z } from "zod";
import { presentation, colorHex } from "../shop-design/presentation";
import { themeDefinitions } from "./registry.generated";
import { type ShopSpecification } from "../shop-design/specification";

export const themeDefinition = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
    name: z.string().min(2).max(40),
    tagline: z.string().min(2).max(80),
    description: z.string().min(10).max(240),
    category: z.enum(["fashion", "home", "food", "electronics", "services", "beauty", "other"]),
    layout: z
      .object({
        hero: z.enum(["split", "cover", "editorial", "catalogue", "mosaic", "poster"]),
        cards: z.enum(["clean", "framed", "soft", "bold"]),
        departments: z.enum(["tiles", "round"]),
        radius: z.enum(["soft", "sharp"]),
      })
      .strict(),
    presentation,
  })
  .strict();
export const shopThemes = themeDefinitions.map((definition) => themeDefinition.parse(definition));
export type ShopTheme = z.infer<typeof themeDefinition>;
export function findShopTheme(id?: string) {
  return shopThemes.find((theme) => theme.id === id);
}
export function themeStyle(theme: ShopTheme) {
  return {
    "--theme-primary": colorHex[theme.presentation.palette.primary],
    "--theme-background": colorHex[theme.presentation.palette.background],
    "--theme-secondary": colorHex[theme.presentation.palette.secondary],
    "--theme-text": colorHex[theme.presentation.palette.text],
  };
}
export function applyShopTheme(spec: ShopSpecification, id: string) {
  const theme = findShopTheme(id);
  if (!theme) throw Error("Theme is unavailable.");
  return {
    ...spec,
    storefrontTheme: theme.id,
    presentation: structuredClone(theme.presentation),
  };
}
