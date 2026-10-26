import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { searchInput } from "../../src/server/discovery";
import { searchHref } from "../../src/modules/discovery/refinements";

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
