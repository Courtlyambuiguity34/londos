import { z } from "zod";

export const listingKind = z.enum(["all", "product", "service"]);
export const listingAvailability = z.enum(["all", "available"]);
export type SearchLinkInput = {
  query?: string | undefined;
  category?: string | undefined;
  shopId?: string | undefined;
  kind?: string | undefined;
  availability?: string | undefined;
  currency?: string | undefined;
  minPrice?: string | undefined;
  maxPrice?: string | undefined;
  cursor?: string | undefined;
};

// URL construction only; untrusted inputs are validated by the server reader.
// Reset links omit the cursor, so a changed scope never reuses another page.
export function searchHref(value: SearchLinkInput) {
  const params = new URLSearchParams();
  if (value.query) params.set("q", value.query);
  if (value.category) params.set("category", value.category);
  if (value.shopId) params.set("shop", value.shopId);
  if (value.kind && value.kind !== "all") params.set("kind", value.kind);
  if (value.availability && value.availability !== "all")
    params.set("availability", value.availability);
  if (value.minPrice || value.maxPrice) {
    params.set("currency", value.currency || "UGX");
    if (value.minPrice) params.set("minPrice", value.minPrice);
    if (value.maxPrice) params.set("maxPrice", value.maxPrice);
  }
  if (value.cursor) params.set("cursor", value.cursor);
  return `/search${params.size ? `?${params}` : ""}`;
}
