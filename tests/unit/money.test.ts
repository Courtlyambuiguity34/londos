import { test, expect } from "vitest";
import { formatMinorMoney } from "../../src/modules/money";
test.each(["UGX", "USD", "KES"])(
  "display preserves every digit of a 20-digit %s price",
  (currency) => {
    const value = "99999999999999999999";
    expect(formatMinorMoney(value, currency).replace(/\D/g, "")).toBe(value);
  },
);
test("zero, minor-unit cents and ask-for-price remain distinct", () => {
  expect(formatMinorMoney("7", "USD")).toContain("0.07");
  expect(formatMinorMoney("0", "USD")).toContain("0.00");
  expect(formatMinorMoney(null, "UGX")).toBe("Ask for price");
  expect(() => formatMinorMoney("1.5", "UGX")).toThrow();
});
