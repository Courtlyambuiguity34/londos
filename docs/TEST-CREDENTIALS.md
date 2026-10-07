# Test credentials and replacement reminder

**Reminder: supply the real `MONGODB_URI` and `REDIS_URL` securely before testing remote MongoDB/Redis.** The generated local fixture credentials are not production/provider credentials and expired when their disposable services were removed. Do not paste actual connection strings into chat or Git.

On 2026-10-07 (Africa/Kampala), the owner authorized generated mock credentials to exercise the algorithm. The [rehearsal report](evidence/OPTIONAL-SERVICES-MOCK.json) records **14 passed functional assertions**, additional to the preserved 464-test development packet. No application, dependency, migration or existing test implementation changed.

The run used authenticated MongoDB 8.2.3 and Redis 8.2.3 containers bound only to loopback, random 32-byte passwords and a disposable PostgreSQL fixture. MongoDB's copy user had read/write access only to its fixture database. Generated URIs and fixture settings were saved in a private ignored `.local/mock-services/runs/<run-id>/mock.env`, mode 600. They were passed only to test processes; `.env.local`, active PostgreSQL and the application's default-off optional service flags were preserved.

The existing `scripts/services.ts` commands successfully checked the connections, copied four published fictional products and one normalized image, read the MongoDB document, and replaced it on repeat without duplicates. Wrong MongoDB/Redis passwords failed authentication. Unpublished-shop copies and reads after PostgreSQL suspension were rejected. Redis passed an authenticated write/read roundtrip. Whole-row checks confirmed that the main catalogue, designs, financial history and applied migration records were unchanged. The owned containers and disposable PostgreSQL database were removed after the run.

Cloudinary and Brevo credentials are also absent. To exercise the image branch, a process-scoped **Cloudinary mock** verified the generated test credentials, upload signature, fixed endpoint and normalized WebP, then supplied a synthetic response. It intercepted all fetches in that test process and never forwarded mock credentials to a provider. No real Cloudinary upload, image URL, sender verification or external email was established. This run does not make production G5 or real pilot evidence complete.

## Repeat in this prepared cloud workspace

The private setup helpers are retained in the current filesystem, excluded from Git and release images. Each run creates new passwords, local services and fictional PostgreSQL data, and removes its own services afterward:

```bash
cd /workspace/londos
node --import tsx .local/mock-services/run.mjs
```

This command is verified in the current prepared workspace. The helpers must be included in a published environment snapshot to survive restoration; a clean Git clone does not contain them. Existing repository unit/integration service tests remain the cloneable checks. Do not automatically start these fixtures during ordinary application startup or put their flags/credentials into the shared environment configuration.

## Attach the correct credentials

| Variable               | Needed for                                                             | Current real-service status                                            |
| ---------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `MONGODB_URI`          | Authenticated MongoDB connection with a dedicated public-copy database | Missing; local mock validated algorithm/authentication only            |
| `REDIS_URL`            | Redis connection; use verified TLS (`rediss://`) for a remote service  | Missing; local mock validated authentication and basic operations only |
| `CLOUDINARY_URL`       | Normalized public image copies required by optional MongoDB copying    | Missing; only a synthetic transport was used                           |
| `LONDOS_BREVO_API_KEY` | Verified Brevo account/sender and live delivery                        | Missing; no email was sent                                             |

Use secure environment settings or the private local configuration on your computer. Keep **`LONDOS_DATABASE_ENGINE=postgresql`** and **`LONDOS_MONGODB_MIGRATION_ENABLED=false`**. MongoDB remains a manually invoked public copy; no migration or canonical database switch is implemented. After supplying the real URLs, enable only the intended optional service flags in a controlled test process and run `npm run services -- check`. For MongoDB, both its flag and Cloudinary's flag/credentials are required. Actual native-network host access and remote TLS/provider authorization still need validation. Redis does not replace durable jobs or application caching. See [deployment profiles](DEPLOYMENT-PROFILES.md).

This page and the README are the persistent reminder. No scheduled notification was created or promised.
