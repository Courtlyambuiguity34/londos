// Preserve all minor-unit digits: converting a large price to Number rounds it.
export function formatMinorMoney(value: string | null, currency: string) {
  if (value === null) return "Ask for price";
  if (
    !/^(0|[1-9][0-9]{0,19})$/.test(value) ||
    !["UGX", "USD", "KES", "EUR", "GBP"].includes(currency)
  )
    throw new Error("Invalid money");
  const decimals = currency === "UGX" ? 0 : 2,
    scale = decimals ? 100n : 1n,
    amount = BigInt(value);
  const parts = new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).formatToParts(amount / scale);
  return parts
    .map((part) =>
      part.type === "fraction" ? (amount % scale).toString().padStart(2, "0") : part.value,
    )
    .join("");
}
