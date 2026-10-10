# Optional self-hosted mode verification — 2026-10-09

Branch: `feature/optional-selfhosted-mode-2026-10-09`

Starting commit: `5bcad22a985e86714e32f4308e0c6941bac45d54`

## Scope

Render plus hosted PostgreSQL remains the default. This change adds an environment-selected,
loopback-only self-hosted web/worker profile, local PostgreSQL/tunnel/service guidance, explicit
Aiven export/local restore tools, and nightly off-machine dump copying. PostgreSQL remains canonical;
MongoDB remains optional public-catalogue-only and Redis remains optional.

## Official documentation review

Aiven's get-started, free-tier, psql, IP restriction and connection-pooling documentation and
Cloudflare's local Tunnel, configuration, service and nameserver documentation were fetched from
their official sites on 2026-10-09. Exact links and the differences from earlier assumptions are in
the root README and self-hosted runbook.

## Executed verification

| Gate                                                                  | Result                                                                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Initial `npm run check`                                               | Passed: lint, types, 157 unit tests, 85 Markdown files/709 local links                                   |
| Initial full PostgreSQL integration suite                             | Passed: 284 tests in 15 files                                                                            |
| Initial standard Playwright suite                                     | Passed: 16 tests                                                                                         |
| Initial core Playwright suite after isolating disposable auth budgets | Passed: 49 tests                                                                                         |
| Existing Linux install/build launcher                                 | Passed                                                                                                   |
| Existing Linux local start/readiness/private-role redirects/stop      | Passed; volume retained                                                                                  |
| Focused deployment/config/launcher tests                              | Passed: 76 tests, then 18 focused tests after self-host assets                                           |
| Production build after mode/CORS/pool changes                         | Passed                                                                                                   |
| New self-hosted web and worker entry points                           | Passed; ready, loopback-only `127.0.0.1:3000`, clean stop                                                |
| Unapproved CORS preflight                                             | Passed: HTTP 403                                                                                         |
| Render and Cloudflare YAML formatting/parse check                     | Passed through Prettier YAML parser                                                                      |
| Shell syntax and executable mode                                      | Passed for all supplied `.sh` entry points                                                               |
| Documentation links                                                   | Passed: 86 Markdown files/711 local links before this evidence file                                      |
| Real local nightly custom-format dump                                 | Passed using PostgreSQL 18.6 client runtime; dump and SHA-256 sidecars copied to an external test path   |
| Restore drill into isolated temporary PostgreSQL database             | Passed; 21 migrations found after restore; temporary database removed                                    |
| Final `npm run check`                                                 | Passed: lint, generated route types/strict TypeScript, 169 unit tests, 88 Markdown files/716 local links |
| Final full PostgreSQL integration suite                               | Passed: 284 tests in 15 files                                                                            |
| Checksum-verified private Node bootstrap                              | Passed with official Node 24.19.0 Linux x64 archive and `SHASUMS256.txt`                                 |
| Final preview install/start/readiness/stop shortcuts                  | Passed through private Node; 270 locked packages installed and production build completed                |
| Final local install/migrate/seed/build/start/stop shortcuts           | Passed; PostgreSQL/authentication/worker ready and private-role redirects correct                        |

The managed cloud host did not permit root package installation. PostgreSQL 18.6 client tools were
therefore exercised through the existing development container via ignored local wrappers; no
runtime binary or credential was committed. Actual Windows Task Scheduler, systemd boot after a host
reboot, Namecheap/Cloudflare DNS change, Aiven export, Cloudflare Access and live Render deployment
remain operator/environment actions and are not claimed as executed here.
