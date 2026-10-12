# Windows external PostgreSQL uninstall follow-up — 2026-10-12

## Requested behavior

The Windows local installer now removes a conflicting registered EDB PostgreSQL 18 installation
outside the current Londos checkout before installing Londos' contained PostgreSQL copy. This
supersedes the earlier coexistence recommendation in the historical
[`WINDOWS-CONTAINED-POSTGRESQL-2026-10-12.md`](./WINDOWS-CONTAINED-POSTGRESQL-2026-10-12.md)
evidence; that original record remains unchanged.

The cleanup is deliberately bounded:

- only registry products whose display name begins with `PostgreSQL 18` are considered;
- the publisher must identify EnterpriseDB/EDB/PostgreSQL when publisher metadata exists;
- the executable must be the registered installation's `uninstall-postgresql.exe`;
- an installation inside the active Londos folder is excluded;
- the official uninstaller is run unattended through Windows UAC and its exit code is checked;
- Londos does not recursively remove the prior data directory or touch another PostgreSQL major
  version, Docker, WSL, containers, images, or volumes;
- ambiguous or unsuccessful cleanup stops before the new database is installed.

The new contained binaries, data, downloads, npm cache, dependencies, and build output remain below
the Londos checkout. With `INSTALL-WINDOWS-ON-D.bat`, that checkout is `D:\Londos`. The old external
data directory should be retained or backed up until the D-drive application's `/api/ready` check
passes. An operator can explicitly preserve external PostgreSQL 18 for one run with
`LONDOS_PRESERVE_EXTERNAL_POSTGRES=true`.

## Verification performed

- `npm test -- tests/unit/local-launcher.test.ts`: **10 passed**.
- `npm test`: **173 tests passed across 15 files**.
- `npm run check:docs`: **95 Markdown files and 733 local links resolved**.
- `npm run lint`: passed with zero warnings.
- Prettier for the changed TypeScript test and `git diff --check`: passed.
- Microsoft PowerShell 7.5 parsed `scripts/local/native-postgres.ps1` without syntax errors.

The Linux verification environment cannot execute Windows registry discovery, UAC, the EDB
uninstaller, service removal, or D-drive installation. Those operations therefore remain a real
Windows 10 Pro platform check and are not reported as passed here. No database, credential, private
environment file, or uninstall log was committed.
