import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { searchInput } from "../../src/server/discovery";
import { searchHref } from "../../src/modules/discovery/refinements";
import { priceMinor } from "../../src/modules/discovery/price-range";

test("refinements default to existing discovery and reject unsupported filters or collections", () => {
  expect(searchInput.parse({ query: "" })).toMatchObject({
    kind: "all",
    availability: "all",
    limit: 20,
  });
  for (const input of [
    { kind: "admin" },
    { kind: ["product", "service"] },
    { availability: "archived" },
    { availability: "true" },
    { sort: "arbitrary-sql" },
  ])
    expect(searchInput.safeParse({ query: "", ...input }).success).toBe(false);
  expect(
    searchInput.parse({ query: "  milk  ", kind: "service", availability: "available" }),
  ).toMatchObject({ query: "milk", kind: "service", availability: "available" });
});

test("budgets accept exact inclusive amounts, reject invalid ranges and never round large prices", () => {
  expect(priceMinor("999999999999999999.99", "USD")).toBe("99999999999999999999");
  expect(priceMinor("9007199254740993", "UGX")).toBe("9007199254740993");
  expect(priceMinor("0.01", "KES")).toBe("1");
  expect(priceMinor("00.10", "EUR")).toBe("10");
  expect(searchInput.parse({ query: "", minPrice: " 0 ", maxPrice: "0" })).toMatchObject({
    minPrice: "0",
    maxPrice: "0",
    currency: "UGX",
  });
  expect(
    searchInput.safeParse({ query: "", currency: "USD", minPrice: "0.10", maxPrice: "0.1" })
      .success,
  ).toBe(true);
  for (const extra of [
    { currency: "BTC" },
    { minPrice: "-1" },
    { maxPrice: "1e3" },
    { minPrice: "10,000" },
    { minPrice: "1.01" },
    { minPrice: "10", maxPrice: "9" },
    { currency: "USD", maxPrice: "1.001" },
    { currency: "USD", maxPrice: "1000000000000000000" },
    { minPrice: ["1", "2"] },
    { maxPrice: "9".repeat(24) },
    { minPrice: "Infinity" },
  ])
    expect(searchInput.safeParse({ query: "", ...extra }).success, JSON.stringify(extra)).toBe(
      false,
    );
});

test("budget URLs preserve context, omit empty ranges, and drop paging when removing a budget", () => {
  const value = {
    query: "gifts & home",
    category: "home",
    shopId: randomUUID(),
    kind: "product",
    availability: "available",
    currency: "USD",
    minPrice: "0",
    maxPrice: "25.99",
  };
  const url = new URL(searchHref(value), "https://londos.example");
  expect(url.searchParams.get("minPrice")).toBe("0");
  expect(url.searchParams.get("maxPrice")).toBe("25.99");
  expect(url.searchParams.get("currency")).toBe("USD");
  const cleared = new URL(searchHref({ ...value, minPrice: "", maxPrice: "" }), url);
  for (const key of ["currency", "minPrice", "maxPrice", "cursor"])
    expect(cleared.searchParams.has(key)).toBe(false);
  for (const key of ["q", "category", "shop", "kind", "availability"])
    expect(cleared.searchParams.get(key)).toBe(url.searchParams.get(key));
  expect(searchHref({ currency: "USD" })).toBe("/search");
});

test("search URLs preserve query/category/shop/refinements without introducing paths or losing encoding", () => {
  const shopId = randomUUID(),
    value = {
      query: "milk & honey / café",
      category: "food",
      shopId,
      kind: "product",
      availability: "available",
    };
  const url = new URL(searchHref(value), "https://londos.example");
  expect(url.pathname).toBe("/search");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    q: value.query,
    category: "food",
    shop: shopId,
    kind: "product",
    availability: "available",
  });
  expect(url.searchParams.has("cursor")).toBe(false);
  expect(
    new URL(searchHref({ ...value, cursor: "bounded-page" }), url).searchParams.get("cursor"),
  ).toBe("bounded-page");
  const cleared = new URL(
    searchHref({ ...value, kind: "all", availability: "all", category: undefined }),
    url,
  );
  expect(Object.fromEntries(cleared.searchParams)).toEqual({ q: value.query, shop: shopId });
  expect(searchHref({ kind: "all", availability: "all" })).toBe("/search");
});
