# Cross-platform launchers and PWA verification — 2026-10-09

Branch: `feature/cross-platform-local-launchers-2026-10-09`
Scope: integration of the existing partial launcher/designer branch with the completed P13/provider
branch, one-click local build/start files, role-specific PWAs, and Render topology documentation.

## Implemented behavior

- Windows batch, executable Linux shell, and executable macOS command files install/build or start
  the Mall, Shopkeeper, Landlord, or fixture preview entry point.
- The installer uses Node's exact lockfile and `node_modules`; a Python `.venv` is deliberately not
  created because Londos has no Python runtime.
- Local mode creates/reuses only the marked loopback PostgreSQL development service and refuses to
  migrate a hosted `DATABASE_URL`. Server mode builds but does not migrate or seed.
- Start uses the standalone production build, starts/reuses the private local PostgreSQL container,
  starts the independent worker for configured modes, and waits for full readiness before opening
  the selected role. `LONDOS_NO_BROWSER=true` supports headless servers.
- Public, Shopkeeper and Management manifests have distinct IDs/names/start routes. One lifecycle
  service worker is registered and deliberately has no fetch/cache handler for HTML, API,
  authentication, or private data.
- Root `render.yaml` is a credential-free fictional preview on the free web tier. The full template
  keeps one web/API service, one worker and one canonical PostgreSQL database; it states that the
  worker/database topology is not an all-free Render deployment.
- Existing provider work was merged. Both additive 019 migrations remain unchanged; migration 020
  verifies both schema contracts and is the new readiness marker.
- The merged designer no longer places shop contact/payment/delivery values in remote AI context.
  The integration test uses explicit private sentinels to enforce that boundary.

## Checks executed

| Check                                                                                  | Result                                              |
| -------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Focused unit suites: launchers, PWA, designer, services/redaction, P13, release source | 105 passed                                          |
| Targeted PostgreSQL suites: P11, P13 and AI design on disposable databases             | 55 passed after one assertion/fixture correction    |
| Type generation and TypeScript                                                         | Passed                                              |
| ESLint with zero warnings                                                              | Passed                                              |
| Production Next.js/standalone web and worker build                                     | Passed                                              |
| Built runtime: health, install page, 3 manifests, service worker, PNG icon             | 7/7 returned HTTP 200 with expected content types   |
| Built HTML manifest selection for `/`, `/shopkeeper`, `/landlord`                      | 3/3 matched the role manifest                       |
| POSIX syntax for 12 Linux/macOS click files                                            | Passed                                              |
| Launcher help, invalid-mode, local-database guard and wrapper routing tests            | Passed                                              |
| Three Render YAML documents parsed                                                     | Passed                                              |
| Configured-value built-artifact scan                                                   | Passed: 1,676 files, 37 configured candidate values |
| Markdown local-link check                                                              | Passed                                              |
| `git diff --check`                                                                     | Passed                                              |

## Follow-up launcher and topology verification

The owner requested a same-day local launch and clarification of the central gateway, domain and
database topology. The follow-up inspection counted 68 SQL-dependent source files and 21 migrations;
MongoDB-primary was therefore not represented as a safe flag switch. The deployment documentation
now states that all clients use the web/API gateway, PostgreSQL remains canonical, MongoDB and
Cloudinary are optional public copies, and database credentials never enter a browser/PWA.

The follow-up found two concrete launcher defects and corrected them:

1. A configured local `PORT` could differ from `AUTH_BASE_URL`, causing private-page redirects to the
   wrong origin. Local start now derives the port from the authentication origin and rejects an
   explicit mismatch. Hosted server mode still separates a platform's internal port from the public
   HTTPS origin.
2. STOP previously stopped only PostgreSQL. The launcher now records only its own web/worker process
   tree in ignored private local state; STOP terminates that recorded tree before stopping the marked
   database container. START also restarts the preserved database container, so normal stop/start is
   a complete click workflow.

Newly executed checks, without repeating completed recovery/load suites:

| Check                                                | Observed result                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `./install-linux.sh local`                           | Locked install, preserved DB start, migration checksum verification, repeatable seed and production web/worker build passed                  |
| `./start-linux.sh local landlord` after a prior STOP | Database restarted; web, authentication and worker reached ready state                                                                       |
| `/api/ready` full local                              | `ready=true`, `development-core`, database/authentication true, worker ready                                                                 |
| Anonymous `/`, `/shopkeeper`, `/landlord`            | 200 public; both private surfaces redirected to the exact configured sign-in origin                                                          |
| Anonymous workspace/operator API                     | Both returned 401                                                                                                                            |
| Cross-origin workspace write                         | Returned 403                                                                                                                                 |
| Preview launcher and `/api/ready`                    | `fixture-preview`, database/authentication false, worker not configured, public route 200                                                    |
| `./stop-linux.sh local`                              | Recorded web and worker stopped gracefully; database stopped; named volume retained                                                          |
| Focused launcher/config/PWA unit files               | 10 passed                                                                                                                                    |
| Documentation check                                  | 85 Markdown files and 709 local links passed before this additive evidence update; final documentation check is recorded by the task handoff |

The initial combined integration run reported 54 passing checks and one failed designer assertion.
The assertion rejected the harmless schema word `contact` after the branches were merged. Inspection
also showed the new designer was querying actual contact values for provider context. The query was
removed, the test was changed to insert and reject explicit private contact/payment/delivery
sentinels, and all 26 AI design integration checks then passed. The already-green P11/P13 suites were
not repeated after this isolated privacy change.

## Private runtime bootstrap follow-up

The optional self-hosted work exposed one remaining fresh-computer assumption: every click file
expected a compatible global `node` command. The installers now provision private Node.js 24.19.0
under ignored `.local/runtime` storage and all START/STOP shortcuts locate that runtime. Downloads
come only from `https://nodejs.org`, require TLS, and must match the archive entry in Node's official
`SHASUMS256.txt` before extraction. The existing launcher then runs `npm ci`, so
`package-lock.json` still selects every application package.

Full local mode also checks Docker. If it is absent, Windows uses `winget`, macOS uses the Homebrew
Docker Desktop cask when Homebrew is available, and supported Linux distributions use their system
package manager with `sudo`. Preview/server mode does not install Docker. Local development secrets
remain random and ignored; hosted database URLs, domains, and provider credentials are never
fabricated by an installer.

Executed on Linux x64:

| Check                                                      | Observed result                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Official Node 24.19.0 archive and checksum download        | Passed; 54.7 MiB archive matched the official SHA-256 list and extracted        |
| Downloaded private runtime → launcher help                 | Passed; supported modes and roles printed                                       |
| Focused launcher/deployment/self-host unit files           | 17/17 passed                                                                    |
| `./install-linux.sh preview` through private Node/npm      | 270 locked packages installed; production web and worker build passed           |
| `./start-preview-linux.sh` → `/api/ready` → STOP shortcut  | Passed; fixture-preview readiness returned and recorded process stopped cleanly |
| POSIX syntax for installer, launcher and self-host scripts | Passed                                                                          |

Windows PowerShell and macOS native execution remain OS-specific checks; their wrapper/bootstrap
contracts are inspected by the unit suite and share the already-executed application launcher.

## Limits

- Native Windows and macOS clicks, browser PWA installation prompts, Android installation and Render
  deployment were not available in this Linux environment and are not claimed as executed.
- No real external email, domain, paid worker, public signup, live rent, or production deployment was
  enabled. Existing G5 conditions still apply.
- Windows/macOS click behavior remains an operating-system verification item. The common launcher
  logic and wrapper routing are covered locally; Linux install/start/stop wrappers were executed.
- The free Render Blueprint is a fictional public demonstration. Full private workflows need the
  shared worker and reachable PostgreSQL described in the deployment guide.
