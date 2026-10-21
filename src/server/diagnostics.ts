// Classify operational failures without recording messages, SQL, URLs, inputs or secrets.
export function failureCategory(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const categories: Record<string, string> = {
    EMAIL_CONFIGURATION_INVALID: "email_configuration_invalid",
    "42P01": "database_schema_missing",
    "42703": "database_schema_outdated",
    "42501": "database_permission_denied",
    "28P01": "database_authentication_failed",
    "53300": "database_connection_limit",
    "57014": "database_query_timeout",
    ECONNREFUSED: "database_unreachable",
    ENOTFOUND: "database_dns_failure",
    ETIMEDOUT: "database_connection_timeout",
    CERT_HAS_EXPIRED: "database_tls_failure",
    SELF_SIGNED_CERT_IN_CHAIN: "database_tls_failure",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "database_tls_failure",
  };
  return typeof code === "string"
    ? (categories[code] ?? "service_unavailable")
    : "service_unavailable";
}
