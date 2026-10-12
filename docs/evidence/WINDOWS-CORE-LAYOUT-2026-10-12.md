# Windows core installation layout — 2026-10-12

## Outcome

The Windows local installer now creates a visible, ignored `core` directory inside the Londos
checkout. For the D-drive launcher, installer-managed external requirements are retained at:

- `D:\Londos\core\runtime\node-v24.19.0-win-<architecture>`;
- `D:\Londos\core\runtime\postgresql-18`;
- `D:\Londos\core\runtime\downloads`;
- `D:\Londos\core\runtime\npm-cache`;
- `D:\Londos\core\data\postgresql-18`.

The exact locked JavaScript packages remain at `D:\Londos\node_modules`, and production build
outputs remain at `D:\Londos\.next` and `D:\Londos\dist`. Those are framework-required paths, but
they remain inside the same Londos folder. Private generated credentials, launcher state, and logs
remain in ignored `.env.local` and `.local` paths rather than being mixed with distributable
runtimes.

The D-drive clean copier excludes generated `core` content. A fresh D installation downloads and
verifies its own requirements instead of copying a possibly partial runtime from C. A registered
PostgreSQL 18 installation in the former `.local\runtime` layout is treated as non-core and is
removed through its registered uninstaller before the new core-contained service is installed. Old
database data is not recursively deleted.

The launcher no longer passes its source directory through CMD. PowerShell derives the checkout from
the location of `install-on-d.ps1`, removing the trailing-backslash/quote parsing boundary entirely.
An optional explicit source remains normalized for manual use. Spaces and parentheses in an
extracted folder name remain supported.

When moving from the old `.local` layout, the installer checks the legacy cached EDB executable
against the pinned SHA-256 digest, copies it to `core`, and verifies the copy before execution. It
downloads again only when no valid cache is available. Existing PostgreSQL software outside `core`
still needs one uninstall/install cycle because moving a registered Windows service and database
binaries by copying files would be unsafe.

## Verification performed

- `npm test`: **173 tests passed across 15 files**.
- `npm run lint`: passed with zero warnings.
- `npm run check:docs`: **96 Markdown files and 734 local links resolved**.
- Prettier for the changed TypeScript test and `git diff --check`: passed.
- Microsoft PowerShell 7.5 parsed `native-postgres.ps1`, `run-with-node.ps1`, and
  `install-on-d.ps1` without syntax errors.

The Linux verification environment cannot execute Windows registry discovery, UAC, the EDB
installer/uninstaller, Windows service creation, or a real D-drive installation. Those operations
remain a Windows 10 Pro platform check and are not reported as passed here. No runtime, database,
credential, `.env.local`, or generated `core` content is committed.
