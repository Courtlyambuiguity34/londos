// UGX has no fractional minor unit in Londos. Keep decimal shillings out of the
// request and never apply the 100x conversion used by two-decimal currencies.
export function wholeUgxAmount(value: string, maximum = 1_000_000_000n) {
  const input = value.trim();
  if (!/^[0-9]{1,20}$/.test(input)) return null;
  const amount = BigInt(input);
  return amount > 0n && amount <= maximum ? amount.toString() : null;
}
