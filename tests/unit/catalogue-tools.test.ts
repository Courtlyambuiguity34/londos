import { test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { catalogueFilters, catalogueMove } from "../../src/modules/catalogue-tools";
test("catalogue tools accept bounded literal names and known states, never arbitrary fields", () => {
  expect(catalogueFilters.parse({})).toEqual({
    query: "",
    departmentId: null,
    availability: "all",
  });
  expect(
    catalogueFilters.parse({
      query: "  50%_off ",
      departmentId: randomUUID(),
      availability: "archived",
    }).query,
  ).toBe("50%_off");
  for (const value of [
    { query: "a".repeat(81) },
    { query: "bad\u0000" },
    { query: ["one", "two"] },
    { departmentId: "foreign" },
    { availability: "deleted" },
    { sort: "name" },
  ])
    expect(catalogueFilters.safeParse(value).success).toBe(false);
  expect(
    catalogueMove.safeParse({ kind: "product", id: randomUUID(), version: 1, direction: "up" })
      .success,
  ).toBe(true);
  for (const value of [
    { kind: "shop" },
    { version: 0 },
    { direction: "first" },
    { id: "../../other" },
    { force: true },
  ])
    expect(
      catalogueMove.safeParse({
        kind: "department",
        id: randomUUID(),
        version: 1,
        direction: "down",
        ...value,
      }).success,
    ).toBe(false);
});
