import { describe, expect, it } from "vitest";
import { categories, products, shops } from "@/modules/catalogue/fixtures";
import {
  findCategory,
  findPublicProduct,
  findShop,
  formatUgx,
  MAX_QUERY_LENGTH,
  publicPreviewProducts,
  searchPreviewShops,
} from "@/modules/discovery/preview-directory";

describe("anonymous fixture discovery", () => {
  it("finds shops through matching shoes and preserves their department context", () => {
    const result = searchPreviewShops({ query: "shoes" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.shop.slug).toBe("annette-fashion-house");
    expect(result.results[0]?.href).toBe("/shops/annette-fashion-house/departments/shoes");
    expect(result.results[0]?.matchingProducts).toBe(2);
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(searchPreviewShops({ query: "  SHOES  " }).results).toEqual(
      searchPreviewShops({ query: "shoes" }).results,
    );
  });

  it("finds a product phrase without flattening the directory into product results", () => {
    const result = searchPreviewShops({ query: "wireless headphones" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.shop.name).toBe("Circuit & Co.");
    expect(result.results[0]?.context).toBe("Audio");
  });

  it("finds a shop by name", () => {
    expect(searchPreviewShops({ query: "rooted" }).results[0]?.href).toBe("/shops/rooted-home");
  });

  it("excludes closed and suspended sample shops, including exact name searches", () => {
    expect(searchPreviewShops().results.map((result) => result.shop.slug)).not.toContain(
      "studio-sunday",
    );
    expect(searchPreviewShops({ query: "studio sunday" }).results).toEqual([]);
    expect(searchPreviewShops({ query: "design consultation" }).results).toEqual([]);
  });

  it("keeps category filters in scope", () => {
    expect(
      searchPreviewShops({ category: "electronics" }).results.map((item) => item.shop.slug),
    ).toEqual(["circuit-and-co"]);
    expect(searchPreviewShops({ query: "shoes", category: "home" }).results).toEqual([]);
  });

  it("returns a useful empty result and rejects unknown categories", () => {
    expect(searchPreviewShops({ query: "nonexistent item" }).results).toEqual([]);
    expect(searchPreviewShops({ category: "not-a-category" }).error).toBeTruthy();
  });

  it("rejects oversized searches instead of processing unbounded input", () => {
    const result = searchPreviewShops({ query: "a".repeat(MAX_QUERY_LENGTH + 1) });
    expect(result.results).toEqual([]);
    expect(result.error).toContain("100 characters");
  });

  it("bounds requested limits and returns one entry per shop", () => {
    expect(searchPreviewShops({ limit: 1 }).results).toHaveLength(1);
    expect(searchPreviewShops({ limit: Infinity }).results).toHaveLength(4);
    const results = searchPreviewShops({ limit: 9999 }).results;
    expect(new Set(results.map((item) => item.shop.id)).size).toBe(results.length);
    expect(results.length).toBeLessThanOrEqual(20);
  });
});

describe("public sample catalogue", () => {
  it("can open a shoe while retaining the rest of Annette’s collection", () => {
    const shop = findShop("annette-fashion-house")!;
    const product = findPublicProduct(shop, "everyday-canvas-sneakers");
    expect(product?.departmentSlug).toBe("shoes");
    expect(publicPreviewProducts(shop).some((item) => item.departmentSlug === "dresses")).toBe(
      true,
    );
  });

  it("does not resolve a product under a different shop URL", () => {
    expect(findPublicProduct(findShop("rooted-home")!, "everyday-canvas-sneakers")).toBeUndefined();
  });

  it("returns no restricted-shop catalogue, even for a known product slug", () => {
    const shop = findShop("studio-sunday")!;
    expect(publicPreviewProducts(shop)).toEqual([]);
    expect(findPublicProduct(shop, "daily-care-serum")).toBeUndefined();
  });

  it("all fixture references belong to their shop and department", () => {
    for (const product of products) {
      const shop = shops.find((item) => item.id === product.shopId);
      expect(
        shop?.departments.some((department) => department.slug === product.departmentSlug),
      ).toBe(true);
    }
    expect(new Set(shops.map((shop) => shop.slug)).size).toBe(shops.length);
    expect(new Set(products.map((product) => product.id)).size).toBe(products.length);
  });

  it("formats sample UGX and price-on-enquiry consistently", () => {
    expect(formatUgx(85000)).toBe("UGX 85,000");
    expect(formatUgx(null)).toBe("Price on enquiry");
  });

  it("unknown shops and categories have no accidental fallback", () => {
    expect(findShop("unknown")).toBeUndefined();
    expect(findCategory("unknown")).toBeUndefined();
    expect(categories).toHaveLength(6);
  });
});
