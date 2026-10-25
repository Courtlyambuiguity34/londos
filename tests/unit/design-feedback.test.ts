import { test, expect } from "vitest";
import { designRequestFeedback, designResponseError } from "../../src/modules/design-feedback";

test.each([
  [422, "ai_context_limit", "too large"],
  [422, "invalid_input", "2–2,000"],
  [403, "fresh_authentication_required", "sign in again"],
  [409, "stale_version", "another session"],
  [409, "ai_context_changed", "catalogue changed"],
  [409, "ai_proposal_expired", "expired"],
  [422, "ai_review_acknowledgment_required", "acknowledgement"],
  [429, "ai_concurrency_limit", "Another design request"],
  [429, "ai_daily_budget", "daily assistant allowance"],
  [409, "shop_not_eligible", "rent coverage"],
] as const)(
  "designer HTTP %s/%s gives an actionable safe instruction",
  (status, error, expected) => {
    expect(designRequestFeedback(status, { error })).toContain(expected);
  },
);

test("designer failures retain a support reference but never reflect provider/SQL/credential detail", async () => {
  const reference = "11111111-1111-4111-8111-111111111111";
  const error = await designResponseError(
    Response.json(
      {
        error: "PRIVATE-credential-value",
        message: "PRIVATE-provider-error",
        sql: "PRIVATE-SQL",
      },
      { status: 503, headers: { "x-request-id": reference } },
    ),
  );
  expect(error.message).toContain("temporarily unavailable");
  expect(error.message).toContain(reference);
  expect(error.message).not.toContain("PRIVATE");
  const malformed = await designResponseError(
    new Response("PRIVATE-raw-response", {
      status: 404,
      headers: { "x-request-id": "PRIVATE-malformed" },
    }),
  );
  expect(malformed.message).toContain("unavailable to your account");
  expect(malformed.message).not.toContain("PRIVATE");
  expect(designRequestFeedback(422, { error: "constructor" })).toContain("could not be completed");
});
