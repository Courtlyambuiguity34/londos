import { z } from "zod";

export const COMPARISON_LIMIT = 4;
export const COMPARISON_KEY = "londos.comparison.v1";
export const comparisonIds = z
  .array(z.uuid())
  .max(COMPARISON_LIMIT)
  .transform((ids) => [...new Set(ids)]);
export function decodeComparison(raw: string | null): string[] {
  if (!raw || raw.length > 200) return [];
  try {
    return comparisonIds.safeParse(JSON.parse(raw)).data ?? [];
  } catch {
    return [];
  }
}
export function comparisonHref(ids: string[]) {
  const checked = comparisonIds.parse(ids);
  return checked.length
    ? `/compare?${new URLSearchParams({ products: checked.join(",") })}`
    : "/compare";
}
