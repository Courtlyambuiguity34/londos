# Render bootstrap packaging correction — 22 October 2026

The deployment of commit `4636920` reached postbuild and failed with:
`The entry point "scripts/release/bootstrap.ts" cannot be marked as external`.
The strict `.dockerignore` allowlist excluded the newly added entry point. The
local checkout build passed because that file existed locally; that verification
did not cover the Docker build context. This was a packaging omission, not a
database, Brevo, or Render environment-variable failure.

## Changes

- `.dockerignore`: allow only the new `scripts/release/bootstrap.ts` source file.
  Existing exclusions for private configuration and local artifacts remain.
- `scripts/check-docker-context.mjs`: export Docker's real filtered context using
  a scratch build, reject private paths, then bundle all four release artifacts
  from that context using installed dependencies. Temporary files are cleaned.
  Run `node scripts/check-docker-context.mjs` in the managed Linux environment
  with Docker/BuildKit and `node_modules` available. The check uses the local
  Docker socket and requires no database or provider credentials.
- This evidence file.

## Executed verification

- Regression check before the allowlist fix: **failed**, reporting the missing
  account-bootstrap entry point. The first attempt was blocked by the sandbox's
  read-only Docker cache; the permitted retry reproduced the missing file.
- Same regression check after the fix: **passed**. `bootstrap.mjs`, `worker.mjs`,
  `operations.mjs`, and `migrate.mjs` all bundled from the exported context.
  `.env`, `.env.local`, `.git`, `.local`, `core`, and `node_modules` were excluded
  from that context before the test linked its existing dependencies.
- Full `deploy/Dockerfile` production build with the managed proxy CA secret:
  **passed**, including Next compilation, TypeScript, postbuild, production
  dependency pruning and final non-root runtime image assembly.
  Local image: `londos:bootstrap-context-fix`, digest
  `sha256:6d230c37ef651b82efda67dccd9fbd0bcf798242aaf20292495eaacca3228eab`.
- Resulting image ran with `--network none` and no application credentials:
  all four artifacts were present, `.env`/`.env.local`/`.git` absent, release
  entry started the web server, and its homepage returned **HTTP 200** with
  Londos content in fixture mode. The temporary container was removed.
- ESLint on the new check and `git diff --check`: **passed**.

No production database migration, live account creation, email delivery, or
Render deployment was executed. No unrelated recovery drills were rerun.
Deploy the corrected commit on Render; no configuration changes are needed for
this build error. The previous release's migration 024 and worker requirements
still apply; see [hosted accounts](../HOSTED-ACCOUNTS.md).
