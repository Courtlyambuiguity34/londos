# ADR 0017: Cross-platform clients and one authoritative server

## Decision

Keep Mall, Shopkeeper and Landlord in the existing Next.js modular monolith and deploy one
authoritative web/API origin plus its independent worker and canonical PostgreSQL database. Provide
role-specific Progressive Web App manifests and one-click local install/start files for Windows,
macOS and Linux.

## Reasons

- Existing authentication uses secure same-origin cookies and server-side route/API authorization.
- Shopkeeper and Landlord are dynamic private applications and cannot be safe static exports.
- A PWA provides an installable Windows, macOS, Linux and Android client without distributing server
  secrets or maintaining separate Electron/native update channels.
- Role-specific start pages improve convenience but never grant access; membership, scoped operator
  permissions and MFA remain authoritative.
- PostgreSQL stays canonical. Server-only optional providers retain their current guarded behavior.

## Operational consequences

The operator configures secrets on web and worker services. Other users receive only the HTTPS URL
or install the PWA. The service worker does not cache dynamic/private responses. Render free hosting
supports the fictional public preview; full account workflows still require reachable PostgreSQL and
an independently supervised worker. Local setup refuses to migrate a non-loopback database.

The two previously independent feature lines both used migration number 019. Their files remain
unchanged; migration 020 checks both schema additions and becomes the readiness marker.
