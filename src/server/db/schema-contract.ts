// Readiness must require the deployed code's migration, not just a row count.
// Include the legacy address cleanup and all earlier production rent fixes.
export const requiredMigration = "036_clean_legacy_shop_addresses.sql";
