# Windows native PostgreSQL implementation evidence — 2026-10-11

## Scope

The Windows local installer no longer depends on Docker Desktop or WSL. It installs/reuses native
PostgreSQL 18, creates the local Londos role/database, writes only ignored private configuration,
then runs the existing migrations, fictional seed, and production build. Linux and macOS retain
their existing Docker-backed local database behavior.

The existing hosted path remains available through explicit Aiven Windows shortcuts. It is dormant
by default, requires a non-loopback TLS-enabled PostgreSQL URL, and never performs automatic hosted
migrations or seeding.

Docker was removed from the Londos Windows dependency flow, not uninstalled from the operating
system. Automatically deleting Docker Desktop, containers, images, or volumes could destroy
unrelated user data and is outside this installer.

## Controls reviewed

- PostgreSQL **18.6-5** uses the official EDB URL and a pinned SHA-256 digest.
- The cache is hashed before every execution; a mismatch is removed and never executed.
- The UAC prompt is limited to the verified database installer and Windows service operations.
- Installer options and generated credentials use access-controlled ignored files; the temporary
  options/SQL files are deleted after use.
- Fresh PostgreSQL listens on localhost, and the helper corrects an existing broader listener before
  continuing.
- The default installer rejects a hosted or non-PostgreSQL `.env.local` before downloading or
  installing PostgreSQL.
- The Aiven shortcuts reject loopback, MongoDB, missing configuration, and PostgreSQL URLs without
  `sslmode=require`, `verify-ca`, or `verify-full`.
- PostgreSQL remains authoritative. No MongoDB write path was added.
- `STOP-WINDOWS.bat` leaves the native database service/data intact.

## Executed verification

The final recorded results must be read together with the limitation below:

- JavaScript syntax checks for `scripts/dev-database.mjs` and `scripts/local/launcher.mjs`: passed.
- Focused launcher tests: **10 passed**.
- Prettier check: passed.
- ESLint: passed with zero warnings.
- Next.js type generation and TypeScript: passed.
- Complete Vitest suite: **173 passed across 15 files**.
- Production Next.js build and standalone web/worker packaging: passed.
- Configured-secret artifact scan: passed; **1,790 files** scanned.
- Documentation check: passed; **93 Markdown files and 730 local links** checked.
- `git diff --check`: passed.

No expensive recovery drill or unrelated external-provider test was repeated for this installer-only
change.

## Platform limitation and handoff

This execution environment is Linux and has no Windows PowerShell, UAC, Service Control Manager, or
EDB Windows installer. The Windows-native script was therefore reviewed and contract-tested but not
executed end to end here. Do not represent it as a real-machine pass until the operator completes:

1. double-click `INSTALL-WINDOWS.bat` on the target Windows 10 Pro computer;
2. approve the verified PostgreSQL UAC prompt;
3. confirm migrations/seed/build complete;
4. click `START-WINDOWS.bat`; and
5. confirm `/api/ready` reports web, database, authentication, and worker ready.

Use [Windows native PostgreSQL setup](../WINDOWS-NATIVE-POSTGRESQL.md) for the exact procedure and
private log locations.
