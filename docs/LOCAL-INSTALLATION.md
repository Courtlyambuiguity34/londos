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
- Docker Desktop through `winget` on Windows when it is absent. On macOS the installer uses the
  checksum-controlled Homebrew cask when Homebrew is present. On supported Linux distributions it
  uses the system `apt`, `dnf`, `yum`, `pacman`, or `zypper` package with `sudo`.
- The pinned PostgreSQL image, a loopback-only database container, random local database/authentication
  credentials, migrations, fictional development seed accounts, and the production application build
  when `local` mode is selected.

The first run therefore needs Internet access, enough disk space, and permission to approve an
operating-system package installation. Docker Desktop may show its own first-run screen. Linux may
require signing out and back in after the installer adds the current account to the `docker` group;
rerun the same installer afterward. If macOS does not already have Homebrew, install it from
<https://brew.sh> first so the Docker package can be authenticated and managed normally. The
installer refuses to execute an unverified Node or Docker download as a workaround.

A repeated installation reuses the verified private Node runtime, Docker installation, npm cache,
database volume, and generated local configuration. It still runs `npm ci`, migrations, seed, and a
fresh production build so that repository changes are applied reproducibly.

On Windows, Docker discovery checks the current `PATH`, Docker Desktop's registered uninstall/App
Paths metadata, the normal Program Files and per-user locations, and then the optional
`LONDOS_DOCKER_DESKTOP_DIR` override. Set that override to a custom Docker Desktop installation
folder (for example `D:\Applications\Docker\Docker`) only when registry/PATH discovery is not
available. An existing installation is started and reused; `winget` runs only when neither the
Docker CLI nor Docker Desktop can be found. The exact Node archive is also retained in
`.local\runtime\downloads`; the installer refreshes the small official checksum list and reuses the
archive only after its SHA-256 checksum passes. A damaged cached archive is discarded and downloaded
again.

Keep the whole repository together. Do not copy a START file away from it.

## Windows

Double-click `INSTALL-WINDOWS.bat`. It obtains Node/Docker when needed, installs locked dependencies,
creates the private local
PostgreSQL configuration when absent, applies migrations, creates fictional development accounts,
and builds the production application. Existing `.env.local`, account files and the named database
volume are preserved. The installer refuses to migrate when `.env.local` points at a non-loopback
database.

Run the installer normally. If Docker Desktop is genuinely absent, Londos now explicitly announces
and opens one Windows Administrator permission (UAC) prompt for the Docker installation only. After
that elevated helper finishes, dependency/database/application setup continues under your normal
Windows account. Cancelling the prompt stops safely and does not claim Docker was installed.

You may still right-click the installer and choose **Run as administrator**; the script detects that
state and does not attempt a second elevation. Normal-user execution is recommended because running
everything elevated can create app/cache files owned by the administrator account. Docker Desktop
may still require its normal first-run agreement and the interactive user's WSL integration. If an
installation fails, the window retains the error and writes a private summary to
`.local\logs\windows-install-error.log` when possible.

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
stops the web/worker recorded by the launcher and the development PostgreSQL container, preserving
its named volume. A later START click starts that database again. It does not search for or terminate
unrelated Node/PostgreSQL processes.

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
- `local` manages only the marked loopback PostgreSQL container on port 54329. It never deletes its
  volume and refuses a hosted `DATABASE_URL`.
- `server` builds with operator-supplied environment settings but never runs migrations or seeds.
  Follow the release runbook for the separately authorized migration step.

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
authentication origin. They are written to ignored `.local/postgres.env` and `.env.local` files and
are never committed.

The installer does **not** invent production values. In `server` mode, copy the documented names
from `.env.example` and supply the real `DATABASE_URL`, `AUTH_SECRET`, `AUTH_BASE_URL`, PWA origins,
mail/provider credentials, and public domains through the host's secret/environment manager. It also
does not replace PostgreSQL with MongoDB: PostgreSQL remains authoritative, while MongoDB, Cloudinary,
Redis, AI, and Brevo integrations remain optional and controlled by their existing environment flags.
Missing optional integrations must not prevent the base application from starting.

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

For a same-day local proof, double-click the installer, then one START file, and open
`http://127.0.0.1:3000/api/ready`. A successful full local run reports `ready=true`,
`mode=development-core`, `database=true`, `authentication=true`, and `worker=ready`. A fixture
preview is useful for interface review but does not prove private workflows or a database.
