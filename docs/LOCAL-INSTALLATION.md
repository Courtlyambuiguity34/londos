# One-click local installation and role launchers

Londos is a Node.js/Next.js application. Python `.venv` directories cannot contain or isolate its
Node packages, so creating one would add a folder that Londos never uses. The installer provisions
a private, pinned Node runtime under the ignored `.local/runtime` directory, installs the exact
committed npm lockfile into `node_modules`, then produces the standalone production web build and
worker. START and STOP shortcuts find that private runtime, so they do not depend on a later PATH
change or a global Node installation.

## What the installer obtains automatically

- Node.js **24.19.0** from `nodejs.org`, selected for x64 or arm64 and verified against Node's
  official `SHASUMS256.txt` before extraction. An incomplete or altered download is rejected.
- npm **11.x** from that runtime and every exact JavaScript dependency in `package-lock.json`, using
  `npm ci` rather than choosing newer package versions.
- PostgreSQL **18.6-5** directly on Windows, from EDB's official distribution and only after its
  pinned SHA-256 digest passes. The installer creates a loopback-only Windows service, a `londos`
  role, a `londos_development` database, and ignored random local credentials. Windows local mode
  neither needs nor installs Docker or WSL.
- On macOS and Linux, Docker plus the pinned PostgreSQL image, a loopback-only database container,
  random local database/authentication credentials, migrations, fictional development seed accounts,
  and the production application build when `local` mode is selected.

The first run therefore needs Internet access, enough disk space, and permission to approve an
operating-system package installation. Linux may
require signing out and back in after the installer adds the current account to the `docker` group;
rerun the same installer afterward. If macOS does not already have Homebrew, install it from
<https://brew.sh> first so the Docker package can be authenticated and managed normally. The
installer refuses to execute an unverified Node or PostgreSQL download as a workaround.

A repeated installation reuses the verified private Node runtime, native Windows PostgreSQL (or the
macOS/Linux Docker installation), npm cache, database data, and generated local configuration. It
still runs `npm ci`, migrations, seed, and a fresh production build so repository changes are
applied reproducibly.

On Windows the PostgreSQL installer is cached in `.local\runtime\downloads` and rechecked against
the pinned digest on every use. A damaged cache is deleted and downloaded again. PostgreSQL binaries
are installed in `.local\runtime\postgresql-18`, database files in
`.local\data\postgresql-18`, and npm's retained cache in `.local\runtime\npm-cache`. The default
does not reuse a machine-wide PostgreSQL installation. Before the first contained install, the local
Windows installer now uninstalls a registered external **PostgreSQL 18** product through its official
uninstaller. It does not delete that product's old data directory, other PostgreSQL major versions,
Docker Desktop, WSL, containers, images, or volumes. Back up any database you need before running the
installer and retain the old data until Londos is verified. An advanced operator who intentionally
needs the external PostgreSQL 18 installation may set `LONDOS_PRESERVE_EXTERNAL_POSTGRES=true` for
that run.

Keep the whole repository together. Do not copy a START file away from it.

To keep the complete local installation on drive D, double-click `INSTALL-WINDOWS-ON-D.bat`. From a
C-drive download it creates a clean `D:\Londos` only when that target is empty, excludes partial
credentials/dependencies/builds, and starts the installer there. If the checkout is already on D, it
uses that folder directly. The copier never merges into or overwrites a non-empty target. Afterward,
always use the batch files in the D-drive checkout so every retained runtime, cache, database file,
package and build stays with that Londos folder.

## Windows

Double-click `INSTALL-WINDOWS.bat`. It obtains Node and native PostgreSQL when needed, installs locked
dependencies, creates the private local PostgreSQL configuration when absent, applies migrations,
creates fictional development accounts, and builds the production application. Existing
`.env.local`, account files, database and unrelated settings are preserved. The installer refuses
before installation when `.env.local` points at a non-loopback database.

Run the installer normally. Londos announces and opens one Windows Administrator permission (UAC)
prompt only when it must run the verified PostgreSQL installer or control its service. Dependency,
database, and application setup otherwise continues under the signed-in Windows account. Cancelling
the prompt stops safely and does not claim PostgreSQL was installed. When an external PostgreSQL 18
product is registered, Windows first asks for permission to run its official uninstaller and then
asks for permission to install the contained copy. The uninstall result is recorded without
credentials in `.local\logs\postgresql-uninstall.log`.

You may still right-click the installer and choose **Run as administrator**; the script detects that
state and does not attempt a second elevation. Normal-user execution is recommended because running
everything elevated can create app/cache files owned by the administrator account. If installation
fails, the window retains the error and writes a private summary to
`.local\logs\windows-install-error.log`; PostgreSQL installer metadata (never credentials) is in
`.local\logs\postgresql-install.log`. Neither file is committed. See
[Windows native PostgreSQL setup](./WINDOWS-NATIVE-POSTGRESQL.md).

After installation, use one of these files:

| File                           | Opens                                                       |
| ------------------------------ | ----------------------------------------------------------- |
| `START-WINDOWS.bat`            | Customer mall at `/`                                        |
| `START-SHOPKEEPER-WINDOWS.bat` | Merchant workspace at `/shopkeeper`                         |
| `START-LANDLORD-WINDOWS.bat`   | MFA-protected operator workspace at `/landlord`             |
| `START-PREVIEW-WINDOWS.bat`    | Fictional public preview, without database/private features |

The START window runs the server and worker and opens the browser after the health endpoint responds.
The launcher now waits for `/api/ready` to confirm the web process, database, authentication and
worker—not merely an open port. Keep it open. Press Ctrl+C to stop the processes. `STOP-WINDOWS.bat`
stops the web/worker recorded by the launcher. The native PostgreSQL service stays available and its
data is preserved. It does not search for or terminate unrelated Node/PostgreSQL processes.

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
./install-linux.sh preview
./install-linux.sh local
./install-linux.sh server
./start-shopkeeper-linux.sh
```

- `preview` needs no database and disables private/core services explicitly.
- `local` uses native PostgreSQL on Windows and the marked loopback PostgreSQL container on macOS or
  Linux. A fresh Windows install uses port 54329; an existing PostgreSQL 18 service may use another
  validated loopback port. Local mode never deletes data and refuses a hosted `DATABASE_URL`.
- `server` builds with operator-supplied environment settings but never runs migrations or seeds.
  Follow the release runbook for the separately authorized migration step.

Windows also has dormant, explicit `INSTALL-AIVEN-WINDOWS.bat` and
`START-AIVEN-WINDOWS.bat [mall|shopkeeper|landlord]` shortcuts. They require a real hosted PostgreSQL
`DATABASE_URL` and never install local PostgreSQL, run hosted migrations, or seed hosted data. The
ordinary Windows shortcuts remain the default.

In local mode, the listening `PORT` must match the port in `AUTH_BASE_URL`; the launcher rejects a
mismatch because authentication redirects and cookies would otherwise point at a different origin.
In server mode, a hosting platform may supply an internal `PORT` while `AUTH_BASE_URL` remains the
external HTTPS Render/custom-domain origin. `AUTH_BASE_URL` is the central-domain setting—do not add
a second public-domain variable or put a database URL in a browser/PWA.

`npm ci` intentionally restores the exact lockfile state, so do not keep hand-edited packages inside
`node_modules`. Private credentials remain in ignored `.env.local` and `.local` files. Never give
those files to a merchant or customer.

## Environment values and secrets

The `local` installer is allowed to generate only private development values: a random local
PostgreSQL password, a random authentication secret, the loopback database URL, and the loopback
authentication origin. On Windows they are written to ignored `.local/native-postgres.env` and
`.env.local`; macOS/Linux use `.local/postgres.env` and `.env.local`. They are never committed.

The installer does **not** invent production values. In `server` mode, copy the documented names
from `.env.example` and supply the real `DATABASE_URL`, `AUTH_SECRET`, `AUTH_BASE_URL`, PWA origins,
mail/provider credentials, and public domains through the host's secret/environment manager. It also
does not replace PostgreSQL with MongoDB: PostgreSQL remains authoritative, while MongoDB, Cloudinary,
Redis, AI, and Brevo integrations remain optional and controlled by their existing environment flags.
Missing optional integrations must not prevent the base application from starting.

## Other computers and phones

Only the owner/operator machine or hosted platform runs the Londos server, worker and database.
Customers and shop staff open its HTTPS address in a browser. They do not install Node, PostgreSQL,
database, or environment variables. Visit `/install` to install the Progressive Web App on Windows,
macOS, Linux, or Android; visiting `/shopkeeper` or `/landlord` first selects that role's app name and
starting page. Account permissions and operator MFA remain enforced by the server.

The PWA does not contain secrets and deliberately does not cache HTML, API responses,
authentication, or private data for offline use. A native `.exe`, `.dmg`, or Linux bundle would wrap
the same website while increasing download size and update/security work, so the PWA is the supported
desktop/mobile client for this stage.

For a same-day local proof, double-click the installer, then one START file, and open
`http://127.0.0.1:3000/api/ready`. A successful full local run reports `ready=true`,
`mode=development-core`, `database=true`, `authentication=true`, and `worker=ready`. A fixture
preview is useful for interface review but does not prove private workflows or a database.
