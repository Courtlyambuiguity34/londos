# UI and mall navigation on the hosted branch — 29 October 2026

Repository: `Courtlyambuiguity34/londos`.
Branch: `feature/hosted-lifecycle-secure-2026-10-23`.
Reviewed starting commit: `3a87ebd`.

## Starting state and approach

The earlier chat implementation was committed as `2befd5d` on the older communications branch. The owner identified this hosted branch as the correct target and requested analysis followed by fresh implementation. The attempted cherry-pick was discarded, leaving a clean checkout at `3a87ebd` before implementation. This update has no merge parent and does not replace the hosted branch with the older tree.

The hosted branch already supplies image-led, fully linked discovery cards, current match prices, saved shops, search refinements, multiple storefront themes, richer product/contact panels, a mobile contact bar, modern merchant/operator workspaces, hosted lifecycle controls and catalogue recovery. Its migration files through 037 and existing source/history are preserved.

The earlier UI goals are carried forward in the existing architecture:

| Chat goal | Hosted-branch implementation |
| --- | --- |
| Clear cards and obvious entry actions | Preserve the newer fully linked image cards and independent Save action, category rails and filter state. Do not substitute the older text cards or remove saved-shop/search functionality. |
| Separate product details into readable sections | Add a named About section for nonempty product/service descriptions on detail pages, with readable typography and spacing. Featured cards keep their existing presentation; empty descriptions create no empty section. |
| Prominent mobile price/contact action | Preserve the existing themed mobile contact bar and full contact-method panel, including product-aware WhatsApp text, enquiry destinations and preview guards. Add safe-area bottom clearance, focus-scroll padding and an explicit missing-destination guard. No duplicate contact bar or checkout is introduced. |
| Reliable Visit mall from private workspaces | Correct the current branch's persistent-layout visibility bug, retain its role-specific workspace shell, and give existing mall-entry links an explicit header anchor. |
| Relevant repeatable verification | Extend the current discovery/hosted integration suites, add current-architecture workspace navigation coverage, and retain the earlier worker-test readiness correction. Earlier branch counts are not presented as verification of this source. |

## Reproduced navigation failure and correction

On the unmodified hosted branch, a browser test loaded `/shopkeeper` directly after authentication and clicked the existing **Visit mall** link. The URL reached `/`, but the public header was absent from the DOM. Here the root layout's server-side header/footer suppression used the initial request's path, while Next.js retained that root layout during client navigation. The older-branch diagnosis of an offscreen header was insufficient for this branch.

`PublicSiteChrome` now uses the current pathname to select public header/footer visibility. Server-side account, role and permission checks remain in their existing handlers. Public navigation disappears within the private portal and returns when entering the mall, including client back navigation. The shared header has the stable `mall-top` anchor; existing portal Visit mall, back/home and public footer/home links target it for predictable scroll position. Existing management links, saved shops, mobile menu and conditional merchant actions remain intact.

## Executed verification

- Baseline and updated production builds passed, including theme generation, TypeScript and standalone/worker packaging.
- `npm run check` passed: lint, TypeScript, all **306 unit tests** and documentation links. Follow-up lint/type checking passed after final fixture adjustments.
- Selected hosted-shop, hosted-lifecycle and core integration suites: **58 passed** in a complete final run against guarded disposable databases.
- `workspace-mall.spec.ts`: **8 passed**, covering merchant and native-MFA operator paths on desktop/mobile in browser and simulated installed-state detection. Tests verify direct private launch, public header/footer restoration, returning to the portal, public menu operation, footer privacy navigation and home scroll position. Physical phone/desktop installation is not simulated by these tests; the installed-state variant exercises `navigator.standalone` detection only.
- `discovery-experience.spec.ts`: **6 passed**. The new regression checks description visibility and omission, mobile price/contact access, footer focus clearance, disabled contact actions, archived product handling, accessibility and overflow at 320, 390 and 1280px. Existing tests preserve card images, exact prices, search refinements, saved-shop persistence and sharing/contact behaviour, including no-JavaScript browsing.
- Public preview browser suite: **16 passed**, including desktop/mobile navigation, keyboard access, automated accessibility and overflow checks.
- Configured-secret artifact scan: **1,895 files / 38 candidate values passed**. This is exact configured-value scanning, not a comprehensive security audit.
- Formatting and whitespace checks passed for changed files. Generated historical discovery images were reviewed, copied to scratch for this session, then restored to preserve the original evidence.

The hosted lifecycle suite contained an outdated expectation that a reserved shop address would silently receive a numeric suffix. Its test now asserts the existing explicit `address_unavailable` contract; production address/rent behavior was not changed. Its cleanup now drains owned database sessions before dropping the disposable database, avoiding an asynchronous forced-termination error after passing assertions. The new operator browser fixture allows verification queuing alongside signup by using multiple local database connections. The embedded-worker fixture registers its signal handler before announcing READY and sends termination once; runtime worker code is unchanged.

No application dependencies, environment values, schema migrations, existing database contents or live provider delivery were changed. Verification used temporary fictional accounts and local notification sinks. No production deployment or market-leadership/conversion claim is made.
