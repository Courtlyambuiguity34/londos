import { failureCategory } from "../diagnostics";
// Fixed labels only. Never return raw exception messages or provider response bodies.
export function notificationFailureCategory(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  switch (message) {
    case "fictional_email_denied":
      return "reserved_test_recipient";
    case "email_link_denied":
    case "email_origin_invalid":
      return "email_origin_mismatch";
    case "delivery_payload_changed":
      return "delivery_payload_changed";
    case "delivery_requires_reconciliation":
      return "delivery_requires_reconciliation";
    case "delivery_not_owned":
      return "delivery_lease_not_owned";
    default: {
      const category = failureCategory(error);
      return category === "service_unavailable" ? "notification_handler_failed" : category;
    }
  }
}

export function providerResponseCategory(status: number | null) {
  switch (status) {
    case null:
      return "provider_network_or_timeout";
    case 201:
      return "provider_response_invalid"; // replaced only after message ID validation
    case 400:
      return "provider_request_rejected";
    case 401:
      return "provider_api_key_rejected";
    case 403:
      return "provider_access_denied";
    case 429:
      return "provider_rate_limited";
    default:
      return status >= 500 ? "provider_server_error" : "provider_unexpected_response";
  }
}
