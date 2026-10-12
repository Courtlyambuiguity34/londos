# Windows contained PostgreSQL correction — 2026-10-12

## Reported failure

The Windows installer completed the verified EDB PostgreSQL installation, then `psql` rejected the
generated bootstrap at `\gexec` with `syntax error at or near "TO"`.

## Root cause and correction

`CREATE DATABASE` accepts `OWNER user`, while `ALTER DATABASE` accepts `OWNER TO user`. The bootstrap
incorrectly generated `CREATE DATABASE … OWNER TO …`. It now generates
`CREATE DATABASE … OWNER …`; the later `ALTER DATABASE … OWNER TO …` remains valid. Role and database
creation remain safe to repeat.

The Windows default is also changed from `C:\Program Files\PostgreSQL\18` to repository-contained
paths:

- `.local\runtime\postgresql-18` for binaries;
- `.local\data\postgresql-18` for database data;
- `.local\runtime\downloads` for verified downloads;
- `.local\runtime\npm-cache` for npm's retained cache.

Node remains under `.local\runtime`, JavaScript dependencies remain in `node_modules`, and build
outputs remain in the checkout. Therefore a checkout at `D:\Londos` retains these application
requirements and data on D. Windows service registration/UAC and transient operating-system files
remain Windows-managed.

The installer does not automatically uninstall the earlier C-drive database. A fresh contained
instance chooses the first available loopback port from 54329 through 54339, allowing the corrected
D-drive installation to be verified before a separately reviewed removal of an unused older copy.
`INSTALL-WINDOWS-ON-D.bat` supplies a guarded one-click relocation: it copies only clean source to an
empty `D:\Londos`, excludes the failed copy's private/generated state, and never merges into an
existing target.

## Verification boundary

Executed from the updated branch on 2026-10-12:

- `npm test -- tests/unit/local-launcher.test.ts`: **10 passed**.
- The exact corrected bootstrap was executed twice against disposable PostgreSQL 18. The first run
  created the role/database; the second made no duplicate database and returned no error.
- Application login returned `londos_development:londos`; the database count was exactly **1**.
- `npm run check:docs`: **94 Markdown files and 731 local links resolved**.
- Prettier check for the changed TypeScript test and `git diff --check`: passed.
- Microsoft PowerShell 7.5 parsed `native-postgres.ps1`, `run-with-node.ps1`, and
  `install-on-d.ps1` with no syntax errors.

The disposable PostgreSQL container was stopped and removed after the check. The EDB UAC installer,
contained Windows service creation, and actual D-drive filesystem path still require a real Windows
run. No production database, credential, `.env.local`, or user data is included in this evidence
file.
