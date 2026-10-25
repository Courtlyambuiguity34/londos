const instructions: Record<string, string> = {
  ai_context_limit:
    "This saved layout is too large for an assistant request. Simplify its sections or continue with the manual editor; you do not need to delete your products.",
  invalid_input:
    "Check the design request. Describe a change using 2–2,000 characters, then try again. No draft was changed.",
  invalid_json: "The request could not be read. Reload the page and try again.",
  request_too_large: "This design request is too large. Shorten the instruction and try again.",
  fresh_authentication_required:
    "For your security, sign in again or verify your authenticator in Account security, then return to this design.",
  mfa_required:
    "Complete your authenticator check in Account security before changing this design.",
  authentication_required: "Sign in again to continue editing your shop.",
  stale_version:
    "Your saved design changed in another session. Reload the design, review it and request the change again.",
  retry_payload_changed:
    "This request changed during a retry. Reload the assistant and submit a fresh proposal.",
  ai_context_changed:
    "The design or catalogue changed after this proposal was prepared. Reload and request a fresh proposal.",
  ai_proposal_expired:
    "This proposal expired. Request a fresh proposal against your current design.",
  ai_proposal_unavailable:
    "This proposal is no longer available. Reload the assistant to see its current status.",
  ai_proposal_changed: "This proposal changed. Reload and review it before applying.",
  ai_review_acknowledgment_required:
    "Review the proposal warning and confirm your acknowledgement before applying it.",
  ai_design_decision_required:
    "This proposal needs your answer to a design question. Include the answer in a new request before applying.",
  ai_concurrency_limit:
    "Another design request is running. Wait for it to finish or cancel it before requesting another.",
  ai_daily_budget:
    "This shop reached its daily assistant allowance. Try after the daily reset; manual design remains available.",
  shop_not_eligible:
    "This shop cannot be published yet. Check its rent coverage and management status in the shop overview.",
  design_reference_integrity:
    "A design item no longer matches its department. Review the sections and save an updated draft.",
};

export function designRequestFeedback(status: number, body: unknown): string {
  const code = body && typeof body === "object" && "error" in body ? body.error : null;
  if (typeof code === "string" && Object.hasOwn(instructions, code)) return instructions[code]!;
  if (status === 401) return instructions.authentication_required!;
  if (status === 403) return instructions.fresh_authentication_required!;
  if (status === 404)
    return "This shop, proposal or design item is unavailable to your account. Return to your shops and check your access.";
  if (status === 409)
    return "The design or shop status changed. Reload and review the current state before trying again.";
  if (status === 429)
    return "The assistant is temporarily at its request limit. Try later; manual design remains available.";
  if (status >= 500)
    return "The design service is temporarily unavailable. Your change was not confirmed. Reload to check the saved design before retrying.";
  return "This design request could not be completed. Check the fields or continue with manual design.";
}

// Only server-owned codes and a bounded random reference reach the UI. Never
// reflect raw exceptions, SQL details or provider responses into customer copy.
export async function designResponseError(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  const reference = response.headers.get("x-request-id");
  return new Error(
    designRequestFeedback(response.status, body) +
      (reference &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(reference)
        ? ` Support reference: ${reference}`
        : ""),
  );
}
