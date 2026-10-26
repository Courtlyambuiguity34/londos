import { z } from "zod";

export const SAVED_SHOPS_LIMIT = 40;
export const SAVED_SHOPS_KEY = "londos.saved-shops.v1";
export const savedShopIds = z
  .array(z.uuid())
  .max(SAVED_SHOPS_LIMIT)
  .transform((ids) => [...new Set(ids)]);
export const savedShopsInput = z.object({ ids: savedShopIds }).strict();

export function decodeSavedShops(raw: string | null): string[] {
  if (!raw || raw.length > 1800) return [];
  try {
    return savedShopIds.safeParse(JSON.parse(raw)).data ?? [];
  } catch {
    return [];
  }
}
