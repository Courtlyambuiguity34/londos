// Readiness must require the deployed code's migration, not just a row count.
// Migration 020 proves both independently developed 019 migrations were applied.
export const requiredMigration = "020_combined_feature_contract.sql";
