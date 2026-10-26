import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  decodeSavedShops,
  savedShopIds,
  savedShopsInput,
} from "../../src/modules/discovery/saved-contract";
import { searchInput } from "../../src/server/discovery";

test("browser storage rejects corruption, oversized data and non-identifiers instead of persisting content", () => {
  for (const raw of [
    null,
    "not-json",
    "{}",
    '["javascript:alert(1)"]',
    '["/landlord"]',
    "[]".repeat(1000),
  ])
    expect(decodeSavedShops(raw)).toEqual([]);
  const id = randomUUID();
  expect(decodeSavedShops(JSON.stringify([id, id]))).toEqual([id]);
  expect(decodeSavedShops(JSON.stringify([id, { name: "private content" }]))).toEqual([]);
});

test("saved public lookup has a strict 40-ID bound, deduplicates, and rejects authority/URL fields", () => {
  const ids = Array.from({ length: 40 }, () => randomUUID());
  expect(savedShopsInput.parse({ ids })).toEqual({ ids });
  expect(savedShopIds.safeParse([...ids, randomUUID()]).success).toBe(false);
  expect(savedShopsInput.safeParse({ ids, includePrivate: true }).success).toBe(false);
  expect(savedShopsInput.safeParse({ ids: ["https://example.com"] }).success).toBe(false);
  expect(searchInput.parse({ query: "", shopIds: [] }).shopIds).toEqual([]);
  expect(searchInput.safeParse({ query: "", shopIds: ids, limit: 41 }).success).toBe(false);
});
