import { test, expect } from "vitest";
import {
  shopSpecification,
  patchSpecification,
  type ShopSpecification,
} from "../../src/modules/shop-design/specification";
const spec: ShopSpecification = {
  schemaVersion: 1,
  theme: "earth",
  announcement: "Sample shop",
  spaces: [
    {
      id: "shoes",
      type: "department",
      version: 1,
      departmentId: "40000000-0000-4000-8000-000000000001",
      limit: 8,
    },
    { id: "bags", type: "story", version: 1, title: "Our shop", body: "Plain text" },
  ],
  actions: ["whatsapp"],
};
test("specifications reject executable/unknown props, unsupported versions and fake badges", () => {
  for (const extra of [
    { script: "alert(1)" },
    { html: "<script/>" },
    { verified: true },
    { seo: { canonical: "javascript:alert(1)" } },
    { schemaVersion: 2 },
    { theme: "custom-css" },
  ])
    expect(shopSpecification.safeParse({ ...spec, ...extra }).success).toBe(false);
  expect(
    shopSpecification.safeParse({ ...spec, spaces: [{ ...spec.spaces[0], version: 2 }] }).success,
  ).toBe(false);
});
test("unique identifiers, actions and total card/text budgets are enforced", () => {
  expect(
    shopSpecification.safeParse({ ...spec, spaces: [spec.spaces[0], spec.spaces[0]] }).success,
  ).toBe(false);
  expect(shopSpecification.safeParse({ ...spec, actions: ["call", "call"] }).success).toBe(false);
  expect(
    shopSpecification.safeParse({
      ...spec,
      spaces: Array.from({ length: 5 }, (_, i) => ({ ...spec.spaces[0], id: `space-${i}` })),
    }).success,
  ).toBe(false);
  expect(
    shopSpecification.safeParse({
      ...spec,
      spaces: Array.from({ length: 8 }, (_, i) => ({
        id: `story-${i}`,
        type: "story",
        version: 1,
        title: "Story",
        body: "x".repeat(1000),
      })),
    }).success,
  ).toBe(false);
});
test("manual patches create new values without mutating the original or permitting arbitrary operations", () => {
  const next = patchSpecification(spec, { op: "move", spaceId: "bags", before: "shoes" });
  expect(next.spaces.map((s) => s.id)).toEqual(["bags", "shoes"]);
  expect(spec.spaces[0]!.id).toBe("shoes");
  expect(() =>
    patchSpecification(spec, { op: "move", spaceId: "missing", before: "shoes" }),
  ).toThrow();
  expect(patchSpecification(spec, { op: "actions", actions: [] }).actions).toEqual([]);
});
