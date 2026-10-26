import { z } from "zod";

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
export const colorHex: Record<z.infer<typeof colorToken>, string> = {
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
