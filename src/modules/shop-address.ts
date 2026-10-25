import { z } from "zod";

// Business names may contain digits; generated identifier tails are not vanity addresses.
const identifierTail =
  /(?:^|-)(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{32})$/i;
export const shopAddressInput = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .refine((value) => /[a-z]/.test(value) && !identifierTail.test(value));

export function legacyShopAddress(slug: string, shopId: string): string | null {
  const suffix = `-${shopId.toLowerCase()}`;
  if (!slug.endsWith(suffix)) return null;
  const candidate = slug.slice(0, -suffix.length);
  return shopAddressInput.safeParse(candidate).success ? candidate : null;
}
