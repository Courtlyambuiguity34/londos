// Readiness must require the deployed code's migration, not just a row count.
// Migration 024 adds permanent account receipts, consent and hosted privacy policy.
export const requiredMigration = "024_hosted_accounts_and_privacy.sql";
