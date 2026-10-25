# Hosted workflow audit, second pass — 25 October 2026

Branch: `feature/hosted-lifecycle-secure-2026-10-23`. Source baseline: `d363b25`.
The previous [audit, results and inventory](HOSTED-WORKFLOWS-2026-10-25.md) remain
unchanged. Three delegated reviews inspected remaining account/team, catalogue/discovery
and preview paths. Work used `/workspace/londos-hosted`; the older checkout and its
uncommitted work were preserved.

## Corrections

| Finding | Result and retained boundary |
| --- | --- |
| Email invitation links lose the token or return to the wrong page after sign-in | Browser-fragment links, legacy-query redirect before SSR, exact token-free sign-in destination, bounded same-tab retention and explicit acceptance. The public entry shell exposes no invitation/member data. Verified invited email, native MFA/freshness, expiry and single use remain server requirements. |
| Catalogue creates retain the previous submitted values | Only confirmed creation resets its form. Rejected writes preserve the entered values. |
| Catalogue/team writes are reported as failed when the follow-up read fails | Confirmed saves retain their confirmation. Stale mutations are disabled until reload. Self-demotion/revocation is not misreported as a failed write. |
| Browse collection points to contacts | It targets an actual collection or department-navigation fallback. Catalogue page also has one main heading. |
| Product search loses the exact item beyond the first 20 products | The winning product result carries its slug through SQL and rendering; department/shop winners keep their destinations and ranking. Eligibility/archive restrictions are preserved. |
| Team lists share one pagination offset | Independently bounded member/invitation/shop pages preserve the other selections. Legacy numeric pages remain supported. Grants still use the current merchant version and staff permission intersection. |
| Invalid team pages throw; stale owners get an opaque error | Malformed pages fail safely. The exact owner landing page can show no-data reauthentication guidance; private team/API reads and mutations remain fenced. |
| Concurrent payment-settings saves silently overwrite one another | An advisory transaction lock covers initial setup and row updates, followed by fresh authority checks and optimistic version validation. Only the successful save creates an audit record/optional announcement. |
| Unpublished private preview links lead into unavailable public pages | Saved revision/proposal context is retained across authorized preview destinations; public visibility is unchanged. |

## Executed verification

| Command / scope | Actual result |
| --- | --- |
| Affected Brevo/P13 unit suite (`npm test -- tests/unit/p13.test.ts`) | 34 passed. |
| `npm run test:integration -- tests/integration/p8.test.ts -t 'payment settings\|merchant payment claims'` | 4 passed; 27 skipped. Includes the three new settings concurrency/authority cases and one relevant existing claim regression. |
| `npm run test:integration -- tests/integration/team-pagination.test.ts` | 3 passed. |
| New exact-product-search regression in `p6.test.ts` | 1 passed; 19 skipped at that execution. |
| `npm run test:integration -- tests/integration/p6.test.ts tests/integration/ai-design.test.ts -t 'saved preview navigation\|proposal preview navigation'` | 2 passed; 46 skipped. |
| Production build, including TypeScript/standalone/worker | Passed, including the final invitation hash-navigation correction. |
| Full ESLint, final TypeScript and whitespace checks | Passed; final invitation changes additionally passed targeted lint/type checks. |
| `npm run check:bundle-secrets` | Passed on the production build: 1,838 artifact files/20 configured exact candidate values. |
| `npm run check:docs` | Passed: 795 local links across 116 Markdown files. |
| New browser scenarios | All 12 selected scenarios established as passing across the first run and focused retries. Four final invitation cases passed against the final production rebuild. See history below. |

Final full lint, all 29 changed code files' formatting, whitespace and documentation checks
passed. All 33 changed/added files passed an exact configured-secret scan. These configured
value scans do not establish the absence of every possible unknown secret.

The selected integration commands established **10 unique passing scenarios in this pass**,
not a fresh execution of the previous audit's 313. Skipped tests are not passes.

The first 12-case production-browser invocation finished **7 passed/5 failed**. Four catalogue
cases and all three team cases passed. One preview image assertion incorrectly assumed a
fixed density-adjusted intrinsic width; it now checks actual successful decoding, a same-shop
private variant URL, normalized WebP bytes and private caching. That complete saved/proposal
navigation case then passed alone, including its subsequent privacy/access assertions.

The invitation failures revealed a real same-document navigation defect: opening another
`#token` link did not remount the component. The client now consumes `hashchange` as well as
the initial link. One test also needed to await sign-in navigation. The legacy-link assertion
initially mistook Next's ordinary redirect transition body for rendered HTML/Flight. Standard
HTTP 303 framing is retained: its Location (and Next's plain transition body) contains the
fragment destination for the token already in the incoming old-style URL. Separate checks
test the actual destination HTML/Flight for no bearer reflection. New emails avoid sending
the token in HTTP request URLs in the first place. The focused invitation retry passed
**4/4** after rebuilding the production output. The focused private-preview retry passed
**1/1**; these five retries overlap the original 12 scenarios, not additional counts.

The browser commands actually executed were:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core -- \
  catalogue-feedback.spec.ts invitation-entry.spec.ts team-workflow.spec.ts --reporter=line
# 7 passed, 5 failed; failures/corrections described above.
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core -- \
  catalogue-feedback.spec.ts -g 'unpublished saved and proposal' --reporter=line
# 1 passed, completing the saved/proposal preview assertions.
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e:core -- \
  invitation-entry.spec.ts --reporter=line
# 4 passed against the final rebuild, completing the 12 unique selected scenarios.
```

Before the payment-settings fix, both new concurrent-save cases failed because both writers
reported success for one version. They passed after serialization and reauthorization. The
search test similarly failed before the product slug was preserved and passed afterward.
New preview fixtures initially lacked the schema-required department position; only those
fixture values were corrected before their successful rerun. The team fixture was corrected
to create 21 total shops rather than assuming the seed supplied only one.

## Operator guidance and limits

No environment change is needed for these fixes. Deploy through the existing web/worker
process. Existing invitation emails remain usable; if same-tab storage is unavailable,
sign in and reopen the original link. Owner team controls preserve the current permission
and optimistic-version rules. A failed reload after a confirmed mutation is a reason to
reload/inspect current access, not to repeat the completed write blindly.

Saved-layout previews retain the actual requested layout revision, and proposal previews
retain the original proposal identity. This does not turn catalogue/prices into historical
snapshots or publish a draft. Public shop visibility and canonical production URLs remain
unchanged. Review the previous audit's existing-UGX-record warning separately; this pass
does not rewrite old financial records or configured collection accounts.

No new migration, dependency or environment flag is required. PostgreSQL remains canonical;
MongoDB stays optional and Redis remains optional. No production database, real invitation,
email send, provider call, payment, deployment setting or DNS record was changed. Verification
uses guarded disposable loopback databases and fictional accounts, with mocked failure paths.
Existing successful broad suites and unrelated physical recovery drills are not being repeated.

## File inventory

Total: **33 files**, 6 added and 27 modified. No deletions.

| Change | Path | Purpose |
| --- | --- | --- |
| Modified | `docs/BUILD-STATUS.md` | Point current status to the second-pass evidence; preserve historical release results. |
| Modified | `docs/HOSTED-BILLING-AND-OPERATIONS.md` | Explain invitation acceptance, independent team pages, safe save/reload recovery and concurrent payment settings. |
| Modified | `docs/X2-HANDOFF.md` | Record continuation from d363b25 and link both audit passes. |
| Added | `docs/evidence/HOSTED-WORKFLOWS-FOLLOWUP-2026-10-25.md` | Record findings, actual execution, failures/corrections, operator guidance and every changed file. |
| Modified | `playwright.core.config.ts` | Register three new focused desktop browser suites. |
| Modified | `src/app/api/workspace/merchants/[merchantId]/team/route.ts` | Validate independent bounded page parameters while retaining legacy page and current workspace guards. |
| Modified | `src/app/shopkeeper/invitations/page.tsx` | Offer a no-private-data entry shell and authenticated acceptance without server token props. |
| Modified | `src/app/shopkeeper/merchants/[merchantId]/team/page.tsx` | Validated independent pages, consistent shell and no-data stale-owner guidance. |
| Modified | `src/app/shopkeeper/shops/[shopId]/catalogue/page.tsx` | Remove duplicate main heading while retaining shop context. |
| Modified | `src/app/shopkeeper/shops/[shopId]/design/assistant/[id]/preview/page.tsx` | Validate nested proposal preview destinations and retain the proposal identity. |
| Modified | `src/app/shopkeeper/shops/[shopId]/preview/page.tsx` | Validate nested saved-preview destinations and preserve the requested layout revision. |
| Modified | `src/app/shopkeeper/team/page.tsx` | Safe malformed-page handling and consistent account heading/layout. |
| Modified | `src/app/sign-in/page.tsx` | Allow only the exact token-free invitations destination in addition to existing destinations. |
| Modified | `src/components/admin-controls.tsx` | Explicit invitation fragment consumption/retention/clearing and independent team navigation with confirmed-save recovery. |
| Modified | `src/components/auth-controls.tsx` | Extend the sign-in destination type for the exact invitations entry page. |
| Modified | `src/components/canonical-directory.tsx` | Pass a matched product slug to the existing public destination helper. |
| Modified | `src/components/canonical-shop.tsx` | Correct browse anchors and retain authorized saved/proposal context in all nested shop links. |
| Modified | `src/components/catalogue-workspace.tsx` | Reset confirmed create forms, preserve rejected input and block stale mutations after a failed reload. |
| Added | `src/modules/shop-design/view-links.ts` | Construct public or trusted private preview links, preserving revision/proposal and cursor context. |
| Modified | `src/proxy.ts` | Support exact no-data invitation entry/legacy redirects and exact stale-owner team guidance; API guards unchanged. |
| Modified | `src/server/ai-design/service.ts` | Pass validated destinations through existing requester/freshness/digest/expiry checks and attach trusted proposal identity. |
| Modified | `src/server/communications.ts` | Serialize initial/existing settings saves, lock the row and recheck current fresh finance authority before versioned update. |
| Modified | `src/server/discovery.ts` | Carry product slug only for a winning product hit without changing shop/department scoring. |
| Modified | `src/server/jobs/brevo.ts` | Generate fragment invitation links and accurate acceptance wording. |
| Modified | `src/server/public-shop.ts` | Validate private destination input and attach the actual saved revision context without changing public eligibility. |
| Modified | `src/server/team.ts` | Add independent bounded list pages and per-list metadata; preserve legacy numeric paging and current authorization. |
| Added | `tests/e2e-core/catalogue-feedback.spec.ts` | Five independent real-browser catalogue, recovery, anchor, exact-search and private-preview scenarios. |
| Added | `tests/e2e-core/invitation-entry.spec.ts` | Four independent real email-template/link/login/acceptance/storage/security scenarios, with bearer tracing disabled. |
| Added | `tests/e2e-core/team-workflow.spec.ts` | Three real-browser paging/assignment/recovery, self-demotion and malformed/stale-access scenarios. |
| Modified | `tests/integration/ai-design.test.ts` | Add a focused proposal-preview destination/identity/security regression. |
| Modified | `tests/integration/p6.test.ts` | Add exact later-page product discovery and saved-preview destination/security regressions. |
| Modified | `tests/integration/p8.test.ts` | Add deterministic initial/existing concurrent settings saves and grant-revocation-during-wait checks. |
| Added | `tests/integration/team-pagination.test.ts` | Add three independent shop/invitation paging, assignment, legacy and security regressions. |
