import { test, expect } from "vitest";
import { catalogueAddress, priceToMinor, editablePrice } from "../../src/modules/merchant-editor";

test("human prices preserve exact amounts across editing without floating point rounding", () => {
  for (const [input, currency, minor] of [
    ["5000", "UGX", "5000"],
    ["19.95", "USD", "1995"],
    ["0.01", "KES", "1"],
    ["999999999999999999.99", "EUR", "99999999999999999999"],
    ["001.20", "GBP", "120"],
  ]) {
    expect(priceToMinor(input!, currency!)).toBe(minor);
    expect(priceToMinor(editablePrice(minor!, currency!), currency!)).toBe(minor);
  }
  expect(priceToMinor("", "UGX")).toBeNull();
  for (const input of ["1.5", "-1", "NaN", "1,000", "1e6", "999999999999999999999"])
    expect(() => priceToMinor(input, "UGX")).toThrow();
});
test("catalogue addresses from names stay readable, bounded and contain no invented IDs", () => {
  expect(catalogueAddress("Fresh Crops & Seeds")).toBe("fresh-crops-seeds");
  expect(catalogueAddress("Café Supplies")).toBe("cafe-supplies");
  expect(catalogueAddress("rice ".repeat(50))).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  expect(catalogueAddress("rice ".repeat(50)).length).toBeLessThanOrEqual(80);
});
