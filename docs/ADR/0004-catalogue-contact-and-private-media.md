# ADR-0004: catalogue commands, customer requests and private media

- Status: implemented and locally verified in the first X2/P5 work packet.
- Date: 2026-10-05 (Africa/Kampala).
- Builds on [ADR-0003](0003-identity-and-durable-jobs.md) and [R1 review](../evidence/R1-REVIEW.md).

## Catalogue and contact authority

Departments and products/services use immutable tenant identity, tenant-consistent references and explicit versions. Position plus immutable ID gives deterministic ordering; pages contain at most 20 products and 100 departments. Update/archive commands serialize with membership changes on the merchant and recheck authority after that lock. A stale version or duplicate slug returns 409 without a second canonical/audit write. Departments with active products cannot be archived. Product archival retains history and references; image deletion requires detachment first.

Prices remain nullable integer minor-unit strings backed by the SQL domain. Null means ask-for-price and zero is a real price. Display uses BigInt and currency-specific fractional parts rather than converting a 20-digit price to a floating-point number. Catalogue commands require the catalogue action and, for staff, the shop grant. Scoped operators with support permission and real MFA may inspect catalogue/contacts/media; ordinary catalogue writes still require merchant authority.

Contact/payment instructions have a separate version. Mutation needs the sensitive action, fresh authentication, a reason and audit. A scoped operator with explicit recovery permission and fresh MFA can repair them. Owner notifications enqueue in that transaction and contain identifiers/version, not changed financial/contact details. The development fanout limit is ten active owners; exceeding it rejects and rolls back the command instead of silently omitting recipients. Operator browser recovery tools remain part of P8.

## Anonymous customer requests

`/contact/[shopId]` is a dedicated, uncached local contact surface. It requires explicit enquiry opt-in, active publication, active tenancy and clear moderation. It does not turn the public fixture mall into PostgreSQL discovery. Submission rechecks that canonical eligibility under the merchant lock, validates any product's shop/availability/department, and stores bounded plain text. Reply contact stays in the private shop inbox. A key and input fingerprint deduplicate retries; changing content under the same key returns 409. A receipt never confirms an order, payment or inventory reservation.

HTTP budgets are 30 attempts per minute for the current loopback network identity and ten per shop; spoofable forwarded-IP headers are ignored. There can be at most 500 unclosed requests per shop. Notifications contain the request/shop IDs, and the authenticated inbox supplies the contents. These are development defaults, not agreed live privacy/retention/traffic policies. Both this HTTP API and its public page require explicit local adapters; remote operation needs a verified live delivery path and trusted ingress policy.

## Upload and processing contracts

Owned upload sessions reserve quota before accepting bytes, expire after 15 minutes, and require the creating user to upload while still authorized. Raw bodies are streamed with a byte bound and deadline. The declared length/type must match. Input is limited to JPEG, PNG and WebP, 4 MiB, 16 million pixels, 8192 pixels per side, and one frame. There is no remote URL ingestion, arbitrary path or raw-file download route. Container signatures/trailing-data checks and the maintained decoder reject malformed, mismatched, animated, oversized and tested polyglot/bomb samples.

Sharp **0.35.5**, pinned as a production dependency, runs in the separate worker. Auto-orientation, bounded resize and re-encoding remove metadata. It creates WebP thumbnail (320), card (640), display (1280) and normalized rebuild-source (2048) variants, without enlargement. Display variants use quality 80; rebuild source uses 90. Dimensions preserve aspect ratio. Synthetic quality checks prove bounds, orientation handling, metadata removal and smaller output; broad photographic/category quality measurement remains a later gate.

This local backend stores bounded blobs in PostgreSQL, in private tables outside public routing. Only ready thumbnail/card/display variants can be read through current authenticated shop policy; source/quarantine is never exposed. Public variant delivery awaits P6/P7 eligibility/revocation contracts. Production object storage/CDN requires its own adapter and consequence tests; this development choice is not a media-scale benchmark.

Each shop has a 128 MiB combined stored/reserved budget and at most 100 nondeleted uploads. An upload reserves 20 MiB for worst-case output; accounting transfers reserved bytes to actual bytes as work completes. Quota checks serialize under the merchant lock and also have SQL bounds. Expiry cleanup returns reservations. Deletion removes private bytes and retains a versioned tombstone; referenced media cannot be deleted.

Media enqueue and quarantine storage commit together. Decoding occurs outside the database transaction; completion rechecks the asset generation and current lease under the merchant/job locks before writing variants, quota and effect receipt. Deleted/retried/stale work cannot resurrect content. A dead job appears as a failed processing state; an audited retry creates a new asset version/job. The prior ready product image stays attached while a replacement is being processed or rejected. At-least-once processing and current generation/fencing remain the contract.

## Verification and limits

[X2 evidence](../evidence/X2-P5.md) records the real PostgreSQL/browser tests, data preservation, visual evidence and fixes. Original migrations are immutable; migration 008 expands the reviewed boundary. Production least privilege, encryption/retention, live communication/storage, public design/discovery, rent, AI and release/recovery gates remain in the implementation plan.
