# One-click local installation and role launchers

Londos is a Node.js/Next.js application. Python `.venv` directories cannot contain or isolate its
Node packages, so creating one would add a folder that Londos never uses. The installer uses the
Node equivalent: the exact committed npm lockfile installs into the local `node_modules` directory,
then produces the standalone production web build and worker.

## Prerequisites

- 64-bit Node.js **24.19 or newer in the 24.x line**, including npm **11.x**.
- Docker Desktop on Windows/macOS, or Docker Engine on Linux, for the full local database.
- Internet access for the first dependency/image download. A previously populated npm cache and the
  pinned PostgreSQL image are needed for a fully offline first installation.

Keep the whole repository together. Do not copy a START file away from it.

## Windows

Double-click `INSTALL-WINDOWS.bat`. It installs locked dependencies, creates the private local
PostgreSQL configuration when absent, applies migrations, creates fictional development accounts,
and builds the production application. Existing `.env.local`, account files and the named database
volume are preserved. The installer refuses to migrate when `.env.local` points at a non-loopback
database.

After installation, use one of these files:

| File                           | Opens                                                       |
| ------------------------------ | ----------------------------------------------------------- |
| `START-WINDOWS.bat`            | Customer mall at `/`                                        |
| `START-SHOPKEEPER-WINDOWS.bat` | Merchant workspace at `/shopkeeper`                         |
| `START-LANDLORD-WINDOWS.bat`   | MFA-protected operator workspace at `/landlord`             |
| `START-PREVIEW-WINDOWS.bat`    | Fictional public preview, without database/private features |

The START window runs the server and worker and opens the browser after the health endpoint responds.
Keep it open. Press Ctrl+C to stop the processes. `STOP-WINDOWS.bat` stops the development PostgreSQL
container and preserves its named volume; it does not terminate an unrelated process.

On a headless server, set `LONDOS_NO_BROWSER=true`; the launcher prints the ready URL instead of
calling the operating system's browser opener.

## macOS

In Finder, double-click `install-macos.command`, then use `start-macos.command`,
`start-shopkeeper-macos.command`, `start-landlord-macos.command`, or
`start-preview-macos.command`. macOS may require Control-click → Open on the first run. The files are
committed as executable; if an archive removed that bit, run `chmod +x *.command` once.

## Linux

Most file managers can run the executable scripts after choosing “Run as a program.” Use
`install-linux.sh`, then `start-linux.sh`, `start-shopkeeper-linux.sh`,
`start-landlord-linux.sh`, or `start-preview-linux.sh`. The equivalent terminal commands are:

```bash
./install-linux.sh
./start-linux.sh
```

## Modes and safe reruns

The generic launcher accepts `preview`, `local`, and `server`; the old `full` spelling remains an
alias for `local`.

```bash
node scripts/local/launcher.mjs install preview
node scripts/local/launcher.mjs install local
node scripts/local/launcher.mjs install server
node scripts/local/launcher.mjs start local shopkeeper
```

- `preview` needs no database and disables private/core services explicitly.
- `local` manages only the marked loopback PostgreSQL container on port 54329. It never deletes its
  volume and refuses a hosted `DATABASE_URL`.
- `server` builds with operator-supplied environment settings but never runs migrations or seeds.
  Follow the release runbook for the separately authorized migration step.

`npm ci` intentionally restores the exact lockfile state, so do not keep hand-edited packages inside
`node_modules`. Private credentials remain in ignored `.env.local` and `.local` files. Never give
those files to a merchant or customer.

## Other computers and phones

Only the owner/operator machine or hosted platform runs the Londos server, worker and database.
Customers and shop staff open its HTTPS address in a browser. They do not install Node, Docker, the
database, or environment variables. Visit `/install` to install the Progressive Web App on Windows,
macOS, Linux, or Android; visiting `/shopkeeper` or `/landlord` first selects that role's app name and
starting page. Account permissions and operator MFA remain enforced by the server.

The PWA does not contain secrets and deliberately does not cache HTML, API responses,
authentication, or private data for offline use. A native `.exe`, `.dmg`, or Linux bundle would wrap
the same website while increasing download size and update/security work, so the PWA is the supported
desktop/mobile client for this stage.
