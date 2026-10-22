import { test, expect } from "vitest";
import {
  notificationFailureCategory,
  providerResponseCategory,
} from "../../src/server/jobs/notification-diagnostics";

test.each([
  [401, "provider_api_key_rejected"],
  [403, "provider_access_denied"],
  [400, "provider_request_rejected"],
  [429, "provider_rate_limited"],
  [503, "provider_server_error"],
  [201, "provider_response_invalid"],
  [null, "provider_network_or_timeout"],
] as const)("provider HTTP %s has a safe diagnostic", (status, category) => {
  expect(providerResponseCategory(status)).toBe(category);
});
test("pre-provider failures expose only fixed allowlisted categories", () => {
  expect(
    notificationFailureCategory(Object.assign(new Error("private SQL details"), { code: "42501" })),
  ).toBe("database_permission_denied");
  expect(notificationFailureCategory(new Error("email_link_denied"))).toBe("email_origin_mismatch");
  expect(notificationFailureCategory(new Error("delivery_requires_reconciliation"))).toBe(
    "delivery_requires_reconciliation",
  );
  expect(notificationFailureCategory(new Error("https://secret.example/?token=private"))).toBe(
    "notification_handler_failed",
  );
});
