# ADR-0002: Next.js / Node application architecture

- Status: Accepted direction from the owner's explicit master build instruction; runtime validation in progress.
- Date: 2026-10-04
- Supersedes: [ADR-0001](0001-initial-application-architecture.md)

## Decision

Build Londos as a Next.js App Router / TypeScript / Node.js modular monolith backed by PostgreSQL. Use server rendering and React Server Components for public routes, with small client components where interaction requires them. Keep domain policies and persistence separate from React presentation. Run asynchronous work in a separate Node worker process.

The explicit [master instruction](../../prompt.txt) supersedes the earlier Django proposal. This is a recorded owner decision, not a new claim that comparative benchmarks proved one framework superior.

## Foundation versions

The High-stage foundation pins Node 24.19.0, npm 11.9.0, Next.js 16.3.8, React 19.3.0 and TypeScript 5.9.3. Next.js accepts the selected Node/React versions. TypeScript 5.9 stays within a well-established compiler generation while the newly released 7.x toolchain is evaluated separately. Actual compatibility is demonstrated by type checks, lint, tests and production build, not dependency metadata alone.

Use one npm lockfile and frozen `npm ci` installs. System fonts and local illustrations avoid build-time font/image network dependencies. PostgreSQL driver/ORM, auth/MFA library and job backend remain X1 decisions; no temporary private-data implementation is treated as secure infrastructure.

## Boundaries

- Public Mall and Shop are anonymous, bounded read surfaces.
- Shopkeeper and Landlord require server-side identity and permissions; route layout is not authorization.
- PostgreSQL owns canonical business/financial records. LSS remains presentation with authorized references.
- A durable worker handles media, projections, reminders, notifications and aggregation.
- AI emits untrusted structured proposals; deterministic validation and merchant confirmation control publication.
- Production rendering makes zero AI calls for a stored shop.

## Consequences and gates

The web and worker can initially share a repository and domain modules. No Python runtime is required in normal requests. A future specialized Python workload needs an isolated interface and evidence of benefit.

The public foundation uses labeled fictional fixtures. It does not pass the six-slice architecture prototype gate, prove tenant isolation, or establish production readiness. The PostgreSQL prototype and complete-build benchmarks remain required under [the implementation plan](../IMPLEMENTATION-PLAN.md).

Retain the old comparison and ADR as history. Change this direction only through a documented owner-reviewed architectural decision; optimize observed bottlenecks before adding services.
