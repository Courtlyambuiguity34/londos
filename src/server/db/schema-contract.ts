// Readiness must require the deployed code's migration, not just a row count.
// Require all production rent fixes, not only the older account migration.
export const requiredMigration = "035_production_rent_reversals.sql";
