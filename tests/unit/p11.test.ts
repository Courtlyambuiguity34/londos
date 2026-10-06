import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  shopSpecification,
  spaceProducts,
  type ShopSpecification,
} from "../../src/modules/shop-design/specification";
import { compileIntent, type DesignContext } from "../../src/modules/ai-design/contract";
import {
  encodeCatalogueCursor,
  decodeCatalogueCursor,
} from "../../src/server/catalogue-pagination";
const department = randomUUID(),
  product = randomUUID(),
  shop = randomUUID();
const base: ShopSpecification = {
  schemaVersion: 1,
  theme: "earth",
  announcement: "",
  spaces: [],
  actions: [],
};
const context: DesignContext = {
  shop: { name: "Fictional", tagline: "", category: "other" },
  specification: base,
  departments: [{ id: department, name: "Shoes", version: 1 }],
  products: [{ id: product, name: "Shoes", version: 1 }],
};
test.each(["entrance", "story", "offer", "service_desk"] as const)(
  "%s remains plain, bounded text with no arbitrary properties",
  (type) => {
    const space = {
      id: "narrative",
      type,
      version: 1,
      title: "Plain text",
      body: "Merchant terms",
    };
    expect(shopSpecification.parse({ ...base, spaces: [space] }).spaces).toHaveLength(1);
    for (const change of [
      { body: "x".repeat(1001) },
      { href: "https://example.com" },
      { html: "<p/>" },
      { verified: true },
      { version: 2 },
    ])
      expect(
        shopSpecification.safeParse({ ...base, spaces: [{ ...space, ...change }] }).success,
      ).toBe(false);
    expect(() =>
      compileIntent(context, {
        patches: [{ op: "add_space", space: { ...space, body: "<script>alert(1)</script>" } }],
        confidence: "high",
        review: "not_needed",
      }),
    ).toThrow("unsafe_generated_text");
  },
);
test.each(["display", "products", "gallery"] as const)(
  "%s enforces unique, bounded, owned product references",
  (type) => {
    const space = { id: "curated", type, version: 1, title: "Selected", productIds: [product] };
    const compile = (s: unknown) =>
      compileIntent(context, {
        patches: [{ op: "add_space", space: s }],
        confidence: "high",
        review: "not_needed",
      });
    expect(compile(space).spaces).toHaveLength(1);
    expect(() => compile({ ...space, productIds: [randomUUID()] })).toThrow(
      "unavailable_reference",
    );
    expect(() => compile({ ...space, productIds: [product, product] })).toThrow();
    expect(() =>
      compile({
        ...space,
        productIds: Array.from({ length: type === "gallery" ? 5 : 9 }, () => randomUUID()),
      }),
    ).toThrow();
  },
);
test("collection filters are closed and counted against the shared page budget", () => {
  const space = {
    id: "collection",
    type: "collection" as const,
    version: 1 as const,
    title: "Available services",
    departmentId: department,
    limit: 2,
    kind: "service" as const,
    availability: "available" as const,
  };
  const items = [
    { id: randomUUID(), department_id: department, kind: "product", availability: "available" },
    { id: product, department_id: department, kind: "service", availability: "available" },
    { id: randomUUID(), department_id: department, kind: "service", availability: "out_of_stock" },
  ];
  expect(spaceProducts(space, items).map((p) => p.id)).toEqual([product]);
  expect(
    shopSpecification.safeParse({ ...base, spaces: [{ ...space, sql: "select *" }] }).success,
  ).toBe(false);
  expect(
    shopSpecification.safeParse({
      ...base,
      spaces: Array.from({ length: 5 }, (_, i) => ({ ...space, id: `c-${i}`, limit: 8 })),
    }).success,
  ).toBe(false);
});
test("catalogue cursors bind department, shop, generation, schema and bounded sort tuple", () => {
  const value = encodeCatalogueCursor(shop, department, "9007199254740993", {
    position: 10,
    id: product,
  });
  expect(decodeCatalogueCursor(value, shop, department, "9007199254740993").id).toBe(product);
  expect(() => decodeCatalogueCursor(value, shop, department, "9007199254740994")).toThrow(
    "catalogue_changed",
  );
  for (const v of [
    "x".repeat(401),
    "../page",
    value + "=",
    Buffer.from("{}").toString("base64url"),
  ])
    expect(() => decodeCatalogueCursor(v, shop, department, "1")).toThrow();
  expect(() => decodeCatalogueCursor(value, randomUUID(), department, "9007199254740993")).toThrow(
    "invalid_catalogue_cursor",
  );
  expect(() => decodeCatalogueCursor(value, shop, randomUUID(), "9007199254740993")).toThrow(
    "invalid_catalogue_cursor",
  );
});
