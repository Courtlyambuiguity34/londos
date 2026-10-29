import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  comparisonHref,
  comparisonIds,
  decodeComparison,
} from "../../src/modules/discovery/comparison";

test("comparison selections accept only bounded public IDs, deduplicate and preserve order", () => {
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  expect(comparisonIds.parse([ids[1], ids[0], ids[1]])).toEqual([ids[1], ids[0]]);
  expect(decodeComparison(JSON.stringify(ids))).toEqual(ids);
  for (const raw of [
    null,
    "",
    "not json",
    '{"ids":[]}',
    '["https://private.example"]',
    JSON.stringify([...ids, randomUUID()]),
    " ".repeat(201),
  ])
    expect(decodeComparison(raw)).toEqual([]);
  expect(new URL(comparisonHref(ids), "https://londos.example").searchParams.get("products")).toBe(
    ids.join(","),
  );
  expect(comparisonHref([])).toBe("/compare");
  expect(() => comparisonHref(["../../private"])).toThrow();
});
