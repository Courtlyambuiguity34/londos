# Windows native PostgreSQL setup

Native PostgreSQL is the default local database path for Londos on Windows. Docker Desktop and WSL
are not required. The alternative Aiven path exists only behind explicit shortcuts and is dormant
until an operator supplies a hosted PostgreSQL URL.

## Default one-click installation

1. For the requested D-drive layout, double-click **`INSTALL-WINDOWS-ON-D.bat`**. When the current
   checkout is on C, it creates a clean `D:\Londos`, excluding `.local`, `.env.local`, dependencies
   and build output from the failed copy, then runs `D:\Londos\INSTALL-WINDOWS.bat`. It refuses to
   merge into or overwrite a non-empty `D:\Londos`. If the checkout is already anywhere on D, it
   installs in that existing folder without copying it.
2. Londos detects a registered external EDB PostgreSQL 18 outside the current Londos folder and runs
   its official uninstaller with Administrator permission. It does not delete the old data folder.
   Other PostgreSQL major versions are not targeted. Back up any database you need before starting.
3. If the contained PostgreSQL 18 is absent, Londos downloads EDB PostgreSQL **18.6-5**, verifies the
   pinned SHA-256 digest, and asks Windows for Administrator permission to install it.
4. Londos configures the service to listen only on localhost, creates the non-superuser `londos`
   application role and `londos_development` database, and verifies that identity.
5. The installer obtains the pinned private Node.js runtime and locked npm packages.
6. Londos safely merges the generated loopback settings into `.env.local`, then runs migrations,
   fictional development seed data, and the production build.

For a checkout at `D:\Londos`, the contained installation uses these locations:

- PostgreSQL binaries: `D:\Londos\.local\runtime\postgresql-18`
- PostgreSQL data: `D:\Londos\.local\data\postgresql-18`
- verified Node and PostgreSQL downloads: `D:\Londos\.local\runtime\downloads`
- Node runtime and npm cache: `D:\Londos\.local\runtime\node-...` and
  `D:\Londos\.local\runtime\npm-cache`
- locked packages and builds: `D:\Londos\node_modules`, `D:\Londos\.next`, and
  `D:\Londos\dist`

The generated PostgreSQL application password and installation credential are stored in
`.local\native-postgres.env`. The application settings are stored in `.env.local`. Both locations
are ignored by Git and restricted to the signed-in Windows account and local Administrators. Never
copy either file into a commit, screenshot, chat, email, or support ticket.

After the first D-drive copy, use the launchers inside `D:\Londos`; do not keep running the old
C-drive launchers. If `D:\Londos` already contains a checkout, run that checkout's own
`INSTALL-WINDOWS.bat` instead of overwriting it.

The official distribution and command-line parameters were checked on **11 October 2026**:

- [EDB PostgreSQL installers](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)
- [EDB command-line installation](https://www.enterprisedb.com/docs/supported-open-source/postgresql/installing/windows/installing_postgresql_on_windows/installing_postgresql_using_command_line/)
- [EDB installer parameters](https://www.enterprisedb.com/docs/supported-open-source/postgresql/installing/windows/installing_postgresql_on_windows/installing_postgresql_using_command_line/command_line_parameters/)

The installer cache is `.local\runtime\downloads`. PostgreSQL itself and its data now remain below
the same ignored `.local` tree; the normal installer does not reuse a machine-wide PostgreSQL from
`Program Files`. Londos recomputes its SHA-256 digest before
execution, reuses a valid download, deletes an invalid one, and never falls back to an unverified
package. The temporary EDB option file is access-restricted and deleted after the installer exits.
Installation logs contain version/checksum status and exit code, not credentials.

## Existing or earlier PostgreSQL 18

The default installer reuses only PostgreSQL found inside the current Londos folder. An external
installation is not silently selected, because that would move binaries/data outside the folder.
An advanced operator may deliberately set `LONDOS_ALLOW_EXTERNAL_POSTGRES=true` and
`LONDOS_POSTGRES_BIN`, but this is not the normal local mode.

If a failed older Londos attempt installed EDB PostgreSQL 18 under `C:\Program Files`, the local
installer now invokes that registered product's official uninstaller before installing the contained
copy. This removes the external software and service, but Londos itself does not delete the old data
directory. Keep or back up that data until `D:\Londos` reports `/api/ready` successfully. The action
and exit code are written to `.local\logs\postgresql-uninstall.log`; no credentials are logged.

Only the exact registered PostgreSQL 18 product is selected. Other major versions and unregistered
folders are left alone. If Windows cannot verify the product's official `uninstall-postgresql.exe`,
installation stops and directs the operator to Windows Apps rather than executing an ambiguous
command. To deliberately preserve an externally managed PostgreSQL 18 installation for one run:

```bat
set LONDOS_PRESERVE_EXTERNAL_POSTGRES=true
INSTALL-WINDOWS.bat
```

To request a particular free contained port, set `LONDOS_POSTGRES_PORT` before running the batch:

```bat
set LONDOS_POSTGRES_PORT=54330
INSTALL-WINDOWS.bat
```

Londos never deletes existing databases. It creates/updates only the named local Londos role and
database. Database creation is idempotent, and the generated SQL uses PostgreSQL's required
`CREATE DATABASE … OWNER …` syntax. If the saved local password is wrong, move
`.local\native-postgres.env` to a private backup location and rerun so it can ask again; do not
publish that file.

## Start, stop, and uninstall boundaries

- Use `START-WINDOWS.bat`, `START-SHOPKEEPER-WINDOWS.bat`, or
  `START-LANDLORD-WINDOWS.bat` after installation.
- `STOP-WINDOWS.bat` stops Londos web/worker processes but leaves PostgreSQL available as a Windows
  service. It never deletes database data.
- Londos removes Docker from its own Windows dependency path. It intentionally does **not** uninstall
  Docker Desktop, WSL, containers, images, or volumes from the computer.
- Before the first contained local install, Londos automatically uninstalls a registered external
  PostgreSQL 18 product. It does not delete its old data folder or touch other major versions.

## Dormant Aiven/hosted path

The default files above always use loopback PostgreSQL. To prepare the dormant hosted mode:

1. Follow [Connecting to Aiven Postgres](../README.md#connecting-to-aiven-postgres).
2. Put the real `DATABASE_URL`, `AUTH_SECRET`, and `AUTH_BASE_URL` in the private `.env.local`, or
   expose them only to the launcher process. Never commit them.
3. Double-click `INSTALL-AIVEN-WINDOWS.bat`. It installs dependencies and builds, but does not
   install local PostgreSQL, migrate Aiven, or seed it.
4. Apply hosted migrations only through the separately reviewed release procedure.
5. Run `START-AIVEN-WINDOWS.bat`, optionally passing `mall`, `shopkeeper`, or `landlord` in a Command
   Prompt.

These Aiven shortcuts set an internal guard which requires a TLS-enabled PostgreSQL URL whose host is
not loopback. They reject the default local database, MongoDB/non-TLS URLs, and incomplete hosted settings.
PostgreSQL remains the only write authority; MongoDB remains an optional read-only public catalogue.

## Troubleshooting

- **UAC cancelled:** rerun and approve only after confirming the cached package hash step succeeded.
- **PostgreSQL installer fails:** inspect `.local\logs\postgresql-install.log` and current EDB Windows
  prerequisites. Update Windows and restart before retrying. No success is claimed on a nonzero exit.
- **Service does not start:** open Windows Services, inspect PostgreSQL's own server log, check that
  the chosen port is free, and rerun. Do not expose ports 54329–54339 through the firewall.
- **Old SQL error near `TO`:** download a revision containing the corrected
  `CREATE DATABASE … OWNER …` bootstrap and rerun from the same D-drive folder. The role/database
  setup is designed to repeat safely; do not edit or publish `.local\native-postgres.env`.
- **Hosted URL refused:** use `INSTALL-AIVEN-WINDOWS.bat`; the default installer is intentionally
  prevented from overwriting or migrating a hosted database.
- **Authentication error after changing PostgreSQL manually:** restore the matching private
  `.local\native-postgres.env` backup or have a database administrator rotate both the role password
  and `.env.local` together.

The native Windows UAC/service path cannot be executed by the Linux CI runner. Static safety tests
cover its pinned package, cache verification, hosted-database refusal, loopback listener, private
credentials, and launcher dispatch. A real Windows installation remains the final platform check.
