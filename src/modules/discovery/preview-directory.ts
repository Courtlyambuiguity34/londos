import {publicShopHref,sortByContinuity} from "./shop-continuity";
import { categories, products, shops } from "../catalogue/fixtures";
import type { PreviewProduct, PreviewShop } from "../catalogue/types";

// This interface will be backed by PostgreSQL in the later stage. These helpers
// only search a tiny read-only fixture set; they are not tenant authorization.
export const PREVIEW_RESULT_LIMIT = 20;
export const MAX_QUERY_LENGTH = 100;

export interface ShopResult {
  readonly shop: PreviewShop;
  readonly href: string;
  readonly context: string | null;
  readonly matchingProducts: number;
}

export interface PreviewSearch {
  readonly query: string;
  readonly results: readonly ShopResult[];
  readonly error: string | null;
}

export function findShop(slug: string): PreviewShop | undefined {
  return shops.find((shop) => shop.slug === slug);
}

export function findCategory(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function publicPreviewProducts(shop: PreviewShop): readonly PreviewProduct[] {
  return shop.previewState === "open" ? products.filter((p) => p.shopId === shop.id) : [];
}

export function findPublicProduct(shop: PreviewShop, slug: string) {
  return publicPreviewProducts(shop).find((product) => product.slug === slug);
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-UG").trim();
}

export function searchPreviewShops(
  options: {
    query?: string;
    category?: string;
    limit?: number;
  } = {},
): PreviewSearch {
  const query = (options.query ?? "").trim();
  if (query.length > MAX_QUERY_LENGTH) {
    return {
      query,
      results: [],
      error: `Please keep your search to ${MAX_QUERY_LENGTH} characters.`,
    };
  }
  if (options.category && !findCategory(options.category)) {
    return { query, results: [], error: "That category is not available." };
  }
  const requestedLimit = options.limit ?? PREVIEW_RESULT_LIMIT;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(PREVIEW_RESULT_LIMIT, Math.max(1, Math.floor(requestedLimit)))
    : PREVIEW_RESULT_LIMIT;
  const terms = normalize(query).split(/\s+/u).filter(Boolean);
  const matches = (text: string) => terms.every((term) => normalize(text).includes(term));
  const results: ShopResult[] = [];
  for (const shop of shops) {
    if (shop.previewState !== "open" || (options.category && shop.category !== options.category))
      continue;
    const catalogue = publicPreviewProducts(shop);
    const matching = terms.length
      ? catalogue.filter((p) => matches(`${p.name} ${p.tags.join(" ")}`))
      : [];
    const department = terms.length ? shop.departments.find((d) => matches(d.name)) : undefined;
    const shopMatches = matches(`${shop.name} ${shop.tagline} ${shop.category}`);
    if (terms.length && !matching.length && !department && !shopMatches) continue;
    const contextDepartment =
      department ?? shop.departments.find((d) => d.slug === matching[0]?.departmentSlug);
    results.push({
      shop,
      href: publicShopHref({shopSlug:shop.slug,departmentSlug:contextDepartment?.slug ?? null}),
      context: contextDepartment?.name ?? null,
      matchingProducts: matching.length,
    });
    if (results.length === limit) break;
  }
  return { query, results:sortByContinuity(results), error: null };
}

export function formatUgx(amount: number | null): string {
  if (amount === null) return "Price on enquiry";
  return `UGX ${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(amount)}`;
}
