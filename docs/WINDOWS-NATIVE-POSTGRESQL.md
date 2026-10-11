# Windows native PostgreSQL setup

Native PostgreSQL is the default local database path for Londos on Windows. Docker Desktop and WSL
are not required. The alternative Aiven path exists only behind explicit shortcuts and is dormant
until an operator supplies a hosted PostgreSQL URL.

## Default one-click installation

1. Keep the complete repository together and double-click `INSTALL-WINDOWS.bat` as your normal
   Windows user.
2. The installer obtains the pinned private Node.js runtime and locked npm packages.
3. If compatible PostgreSQL 18 is absent, Londos downloads EDB PostgreSQL **18.6-5**, verifies the
   pinned SHA-256 digest, and asks Windows for Administrator permission to install it.
4. Londos configures the service to listen only on localhost, creates the non-superuser `londos`
   application role and `londos_development` database, and verifies that identity.
5. Londos safely merges the generated loopback settings into `.env.local`, then runs migrations,
   fictional development seed data, and the production build.

The generated PostgreSQL application password and installation credential are stored in
`.local\native-postgres.env`. The application settings are stored in `.env.local`. Both locations
are ignored by Git and restricted to the signed-in Windows account and local Administrators. Never
copy either file into a commit, screenshot, chat, email, or support ticket.

The official distribution and command-line parameters were checked on **11 October 2026**:

- [EDB PostgreSQL installers](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)
- [EDB command-line installation](https://www.enterprisedb.com/docs/supported-open-source/postgresql/installing/windows/installing_postgresql_on_windows/installing_postgresql_using_command_line/)
- [EDB installer parameters](https://www.enterprisedb.com/docs/supported-open-source/postgresql/installing/windows/installing_postgresql_on_windows/installing_postgresql_using_command_line/command_line_parameters/)

The installer cache is `.local\runtime\downloads`. Londos recomputes its SHA-256 digest before
execution, reuses a valid download, deletes an invalid one, and never falls back to an unverified
package. The temporary EDB option file is access-restricted and deleted after the installer exits.
Installation logs contain version/checksum status and exit code, not credentials.

## Existing PostgreSQL 18

Londos searches `PATH`, Windows uninstall registration, and the normal `Program Files` location. If
it finds PostgreSQL 18, it reuses it and securely asks for that instance's `postgres` superuser
password. The default existing-instance port is 5432. If yours is different, set
`LONDOS_POSTGRES_PORT` in the launching Command Prompt before double-clicking, or run:

```bat
set LONDOS_POSTGRES_PORT=5433
INSTALL-WINDOWS.bat
```

Londos never deletes existing databases. It creates/updates only the named local Londos role and
database. If the saved local password is wrong, move `.local\native-postgres.env` to a private backup
location and rerun so it can ask again; do not publish that file.

## Start, stop, and uninstall boundaries

- Use `START-WINDOWS.bat`, `START-SHOPKEEPER-WINDOWS.bat`, or
  `START-LANDLORD-WINDOWS.bat` after installation.
- `STOP-WINDOWS.bat` stops Londos web/worker processes but leaves PostgreSQL available as a Windows
  service. It never deletes database data.
- Londos removes Docker from its own Windows dependency path. It intentionally does **not** uninstall
  Docker Desktop, WSL, containers, images, or volumes from the computer.
- Londos does not automatically uninstall PostgreSQL. Use a reviewed backup and Windows Apps
  settings only if you deliberately retire the database.

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
  the chosen port is free, and rerun. Do not expose port 5432/54329 through the firewall.
- **Hosted URL refused:** use `INSTALL-AIVEN-WINDOWS.bat`; the default installer is intentionally
  prevented from overwriting or migrating a hosted database.
- **Authentication error after changing PostgreSQL manually:** restore the matching private
  `.local\native-postgres.env` backup or have a database administrator rotate both the role password
  and `.env.local` together.

The native Windows UAC/service path cannot be executed by the Linux CI runner. Static safety tests
cover its pinned package, cache verification, hosted-database refusal, loopback listener, private
credentials, and launcher dispatch. A real Windows installation remains the final platform check.
