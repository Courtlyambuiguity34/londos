# Phone-only Render migration option — 22 October 2026

The owner has no PC or Render terminal. Added an explicit Docker web startup
option, `LONDOS_MIGRATE_ON_START=true`, so the existing migration runner executes
before account bootstrap and the web server. Unset/false preserves previous
behavior. Workers never migrate. Migration failure stops startup. No HTTP
migration endpoint, database reset, demo seeding or credential defaults were added.

The runner retains its database advisory lock, applied-file checksum verification
and per-migration transactions. Existing `DATABASE_URL` must have migration
permissions. Runtime CA handling is unchanged. Turn the option off after this
reviewed upgrade; it is not permission to apply future releases without review.

## Verification actually performed

- `npm test -- tests/unit/release-start.test.ts`: **6 passed**. Covers default-off,
  false, migration/bootstrap/web order, failed migration, worker exclusion and
  invalid-flag handling. Bootstrap credentials are excluded from the migration
  subprocess and startup settings are excluded from the serving process.
- `npm run test:integration -- tests/integration/startup-migration.test.ts tests/integration/bootstrap.test.ts`:
  the existing **2 bootstrap tests passed**. The new upgrade test initially had
  an invalid fixture missing the required `emailVerified` field. After fixing
  that fixture, its targeted rerun **passed**. A subsequent TypeScript check
  caught the test subprocess environment's missing explicit `NODE_ENV` type;
  corrected it, then reran TypeScript and the upgrade test successfully.
- The real database upgrade test starts from the pre-024 schema, preserves an
  existing user, executes the actual release entry and compiled migrator and
  bootstrap, and reaches a stub web entry. On restart it preserves the migration
  checksum/timestamp, existing data and a single bootstrap receipt. Only guarded,
  disposable local databases were used and removed.
- `npx --no-install tsc --noEmit`: **passed** on the final test source.
- ESLint on changed JavaScript/TypeScript: **passed**.
- Full production `deploy/Dockerfile` build: **passed**, including postbuild and
  runtime image assembly. Local image `londos:phone-migration`, digest
  `sha256:ccbdc559ac8056900af087b5158256c37753337b080e8a4cf667e55448d7b05d`.
- Image without the flag, with no application secrets and `--network none`:
  normal web startup and fixture homepage **HTTP 200**.
- Image with flag true but no database settings, also network-isolated:
  **expected exit 1**, only the sanitized `release.migration` failure event;
  web startup did not occur. Both temporary containers were removed.

No live Aiven migrations, Render environment changes, account creation or email
delivery were performed. No unrelated recovery drills were rerun.

## Changed files

- `scripts/release-entry.mjs`: opt-in pre-bootstrap migration.
- `.env.example`, `deploy/.env.example`: commented flag documentation.
- `docs/HOSTED-ACCOUNTS.md`: phone-only steps and permission/restart requirements.
- `docs/RENDER-SETUP.md`: document the exception to separate migrations; correct
  stale public landlord-link wording to match the existing UI.
- `tests/unit/release-start.test.ts`: startup sequencing and failure checks.
- `tests/integration/startup-migration.test.ts`: actual migration/bootstrap upgrade.
- This evidence file.

Follow [the phone-only instructions](../HOSTED-ACCOUNTS.md#phone-only-render-upgrade-without-shell).
