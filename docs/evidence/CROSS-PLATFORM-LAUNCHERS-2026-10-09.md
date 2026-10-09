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
- Start uses the standalone production build, starts the independent worker for configured modes,
  waits for health, then opens the selected role. `LONDOS_NO_BROWSER=true` supports headless servers.
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

The initial combined integration run reported 54 passing checks and one failed designer assertion.
The assertion rejected the harmless schema word `contact` after the branches were merged. Inspection
also showed the new designer was querying actual contact values for provider context. The query was
removed, the test was changed to insert and reject explicit private contact/payment/delivery
sentinels, and all 26 AI design integration checks then passed. The already-green P11/P13 suites were
not repeated after this isolated privacy change.

## Limits

- Native Windows and macOS clicks, browser PWA installation prompts, Android installation and Render
  deployment were not available in this Linux environment and are not claimed as executed.
- No real external email, domain, paid worker, public signup, live rent, or production deployment was
  enabled. Existing G5 conditions still apply.
- The cloud PTY detached when sent Ctrl+C, so launcher shutdown was verified by delivering SIGTERM
  directly to the launcher. Its owned web process group stopped and the test port was released.
- The free Render Blueprint is a fictional public demonstration. Full private workflows need the
  shared worker and reachable PostgreSQL described in the deployment guide.
