import { test, expect } from "vitest";
import { authenticationFeedback } from "../../src/modules/auth/feedback";

test("verification is distinguished from invalid credentials and service failures", () => {
  expect(authenticationFeedback(403, { code: "EMAIL_NOT_VERIFIED" }).verificationRequired).toBe(
    true,
  );
  expect(authenticationFeedback(401, { code: "INVALID_EMAIL_OR_PASSWORD" }).message).toContain(
    "Recover your account",
  );
  expect(authenticationFeedback(503, { code: "EMAIL_NOT_VERIFIED" }).verificationRequired).toBe(
    false,
  );
  expect(authenticationFeedback(429, {}).message).toContain("wait a minute");
});
test("arbitrary response content is never reflected in error text", () => {
  for (const body of [
    null,
    "private-token",
    { code: "private-token", message: "postgres://secret" },
    { error: "postgres://secret" },
  ]) {
    const result = JSON.stringify(authenticationFeedback(500, body));
    expect(result).not.toContain("private-token");
    expect(result).not.toContain("postgres://secret");
  }
});
