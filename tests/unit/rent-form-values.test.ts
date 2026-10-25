import { expect, test } from "vitest";
import { wholeUgxAmount } from "../../src/modules/rent-form-values";
import { formatMinorMoney } from "../../src/modules/money";

test("UGX form values keep the same shillings from entry to ledger presentation", () => {
  for (const amount of ["1", "5000", "1000000000"]) {
    expect(wholeUgxAmount(amount)).toBe(amount);
    expect(formatMinorMoney(wholeUgxAmount(amount), "UGX")).toContain(
      new Intl.NumberFormat("en-UG").format(BigInt(amount)),
    );
  }
  expect(wholeUgxAmount(" 005000 ")).toBe("5000");
});
test.each(["", "0", "-1", "1.01", "1e3", "NaN", "5,000", "1000000001"])(
  "ambiguous or out-of-range UGX entry %s is not submitted",
  (input) => expect(wholeUgxAmount(input)).toBeNull(),
);
test("the policy form respects its narrower published maximum", () => {
  expect(wholeUgxAmount("10000000", 10_000_000n)).toBe("10000000");
  expect(wholeUgxAmount("10000001", 10_000_000n)).toBeNull();
});
