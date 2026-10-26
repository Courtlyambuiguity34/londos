import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { brandingReferences, shopSpecification } from "../../src/modules/shop-design/specification";
import { compileIntent } from "../../src/modules/ai-design/contract";
const original = {
  schemaVersion: 1,
  theme: "earth",
  announcement: "",
  spaces: [],
  actions: [],
} as const;
test("existing saved designs retain their exact shape when branding is absent", () => {
  expect(shopSpecification.parse(original)).toEqual(original);
  expect(brandingReferences(shopSpecification.parse(original))).toEqual([]);
});
test("design assistant changes preserve merchant-selected branding without mutating the saved input", () => {
  const id = randomUUID();
  const spec = shopSpecification.parse({
    ...original,
    branding: { coverAssetId: id, logoAssetId: null },
  });
  const next = compileIntent(
    {
      shop: { name: "Fictional shop", category: "food", tagline: "" },
      specification: spec,
      departments: [],
      products: [],
    },
    { patches: [{ op: "theme", theme: "plum" }], confidence: "high", review: "not_needed" },
  );
  expect(next.theme).toBe("plum");
  expect(next.branding).toEqual(spec.branding);
  expect(spec.theme).toBe("earth");
});
test("shop branding accepts only explicit asset identifiers, deduplicates references and permits clearing", () => {
  const id = randomUUID();
  const spec = shopSpecification.parse({
    ...original,
    branding: { coverAssetId: id, logoAssetId: id },
  });
  expect(brandingReferences(spec)).toEqual([id]);
  expect(
    shopSpecification.safeParse({
      ...original,
      branding: { coverAssetId: null, logoAssetId: null },
    }).success,
  ).toBe(true);
  for (const value of [
    "https://example.invalid/image.png",
    "javascript:alert(1)",
    "../../private",
    123,
  ]) {
    expect(
      shopSpecification.safeParse({
        ...original,
        branding: { coverAssetId: value, logoAssetId: null },
      }).success,
    ).toBe(false);
  }
  expect(
    shopSpecification.safeParse({
      ...original,
      branding: { coverAssetId: id, logoAssetId: null, source: "private" },
    }).success,
  ).toBe(false);
});
