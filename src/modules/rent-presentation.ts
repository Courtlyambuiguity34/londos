export const claimLabels: Record<string, string> = {
  pending: "Claim submitted — awaiting verification",
  verified: "Claim accepted — verified by an operator",
  rejected: "Claim rejected — see the review reason",
};
export const tenancyLabels: Record<string, string> = {
  pending: "Awaiting activation",
  active: "Active coverage",
  due: "Renewal due",
  grace: "In the grace period — renew before the deadline",
  closed: "Closed for rent — review your invoice and renewal options",
};
export function rentGraceDeadline(end: Date | string | null, days: number | null): Date | null {
  if (end === null || days === null || !Number.isInteger(days) || days < 0) return null;
  const time = new Date(end).getTime() + days * 86400000;
  return Number.isFinite(time) ? new Date(time) : null;
}
export function invoiceStatus(amount: string, credited: string, claims: { state: string }[]) {
  if (BigInt(credited) >= BigInt(amount)) return "Fully credited — see the coverage dates below";
  if (claims.some((claim) => claim.state === "pending"))
    return "Claim submitted — balance still awaits verification";
  return BigInt(credited) > 0n ? "Partly credited — a balance remains" : "Awaiting verified credit";
}
