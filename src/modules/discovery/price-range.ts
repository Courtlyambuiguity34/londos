import { z } from "zod";
import { formatMinorMoney } from "../money";

export const priceRangeFields = {
  currency: z.enum(["UGX", "USD", "KES", "EUR", "GBP"]).default("UGX"),
  minPrice: z.string().trim().max(23).default(""),
  maxPrice: z.string().trim().max(23).default(""),
};
type PriceRange = { currency: string; minPrice: string; maxPrice: string };

// Human-entered amounts become exact minor units, never floating point numbers.
export function priceMinor(amount: string, currency: string): string | null {
  if (!amount) return null;
  const pattern = currency === "UGX" ? /^\d{1,20}$/ : /^\d{1,20}(?:\.\d{1,2})?$/;
  if (!pattern.test(amount)) throw new Error("Invalid price amount");
  const [whole, fraction = ""] = amount.split(".");
  const minor =
    BigInt(whole!) * (currency === "UGX" ? 1n : 100n) +
    (currency === "UGX" ? 0n : BigInt(fraction.padEnd(2, "0")));
  if (minor > 99999999999999999999n) throw new Error("Price amount is too large");
  return minor.toString();
}

export function validatePriceRange(value: PriceRange, ctx: z.RefinementCtx) {
  const bounds: (string | null)[] = [];
  for (const field of ["minPrice", "maxPrice"] as const) {
    try {
      bounds.push(priceMinor(value[field], value.currency));
    } catch {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message:
          value.currency === "UGX"
            ? "Enter a whole UGX amount without commas, up to 20 digits."
            : "Enter a price without commas, with up to two decimal places and 20 minor-unit digits.",
      });
    }
  }
  if (
    bounds.length === 2 &&
    bounds[0] !== null &&
    bounds[1] !== null &&
    BigInt(bounds[0]!) > BigInt(bounds[1]!)
  )
    ctx.addIssue({
      code: "custom",
      path: ["maxPrice"],
      message: "The maximum price must be at least the minimum price.",
    });
}

export function priceRangeLabel(value: PriceRange) {
  const min = priceMinor(value.minPrice, value.currency),
    max = priceMinor(value.maxPrice, value.currency);
  if (min !== null && max !== null)
    return `${formatMinorMoney(min, value.currency)} – ${formatMinorMoney(max, value.currency)}`;
  if (min !== null) return `From ${formatMinorMoney(min, value.currency)}`;
  if (max !== null) return `Up to ${formatMinorMoney(max, value.currency)}`;
  return "Any price";
}
