# Render theme generator build-context correction

Checked 26 October 2026 (Africa/Kampala). Branch
`feature/hosted-lifecycle-secure-2026-10-23`, continuing from `fef5189`.

## Cause and correction

Render stopped in `prebuild` with
`Cannot find module '/build/scripts/generate-shop-themes.mjs'`.
The file existed in Git and local builds, but `.dockerignore` starts by denying
all files and then selectively includes build inputs. The new theme generator
had not been added to that allowlist. Docker's `COPY . .` therefore never copied
it into `/build`, where the package lifecycle tried to execute it.

The allowlist now includes exactly two additional inputs:

- `scripts/generate-shop-themes.mjs`, required by `prebuild`.
- `.prettierrc.json`, used by that generator so its output uses the same
  formatting configuration in the container and the local source tree.

The default deny rules remain. No runtime code, package/lockfile, dependency,
environment setting, SQL migration, bootstrap logic or Dockerfile changed.

## Verification executed

1. The existing theme/release-start baseline passed: **16 tests**.
2. A minimal Docker `COPY` probe reproduced the missing generator using the
   original `.dockerignore`.
3. The new `scripts/verify-docker-context.mjs` regression initially failed on the
   excluded formatting configuration. After the fix it passed: **17 required
   inputs**, including the three current Node build lifecycle entrypoints, two
   release entrypoints, six theme definitions and build configuration files.
   **Six fictional private/unapproved canaries remained excluded.**
4. The actual `deploy/Dockerfile` built through `npm ci`, theme generation,
   production Next build, standalone assets, worker/release bundles, offline
   production pruning and final runtime image export. Its prebuild log reported
   `Shop theme registry: 6 definitions.`
5. Runtime artifact checks found and syntax-checked `server.js`,
   `release-entry.mjs` and the four worker/bootstrap/migration/operations bundles.
   The container ran as UID1000, and `.env`, `.env.local` and `.env.production`
   were absent from the runtime working directory.
6. The image started through its normal release entrypoint in explicit
   credential-free fixture mode, published to an ephemeral **loopback-only**
   port. Homepage, search, PNG logo and built stylesheet returned **HTTP200**.
   Only that temporary container was stopped and removed afterward.
7. The new verification script passed ESLint and Prettier; whitespace and local
   documentation links were checked before committing.

Local verification image:
`londos:render-theme-context-20261026`,
`sha256:f84333d692016287d00764dd25ae27debbabfead31f70c4603653151e31612dc`.
This image was built locally, not pushed to a registry or deployed to Render.

The build kept TLS verification enabled and supplied the environment's public
proxy CA through the Dockerfile's existing temporary BuildKit secret mount.
Registry credentials and Docker client proxy configuration were preserved.
The daemon was not restarted and existing containers/images were not removed.
Builder metadata used writable task-local storage where needed.

The startup check validates packaging and public fixture rendering. It does not
claim a live Aiven connection, account bootstrap, email delivery, production
authentication or a successful Render deployment. No production credentials,
database writes, messages or new seed records were used. The already-verified
shopping/database/browser suites were not repeated for this packaging-only fix.

## Repeat the packaging regression

In a Linux verification environment with Git, Node and a running local Docker
daemon available:

```sh
node scripts/verify-docker-context.mjs
```

It constructs a temporary snapshot from tracked source inputs and the current
allowlist, adds fictional canaries, and uses Docker's real ignore parser and a
network-free scratch build/export. It checks inclusion/exclusion and removes
the temporary snapshot. It never copies the actual `.env.local`, private
account files, installed dependencies or Docker credentials. The existing
`DOCKER_CONFIG` and registry credentials are retained; the local socket is
selected explicitly and temporary Buildx metadata is cleaned up. The helper
is a maintainer check and is not a new requirement for normal Windows installers
or application startup.

## Redeploy

Deploy the latest commit on the existing hosted branch using Render's usual
**Manual Deploy → Deploy latest commit** action, or let the configured automatic
deployment run. Keep the current environment values and database intact.
There is no new variable to add and no migration or reseed to run for this fix.
The changed context invalidates the relevant copy/build cache layers normally;
clearing the whole build cache is not required by this error.

## Every file added or changed

- Changed `.dockerignore`: includes the two required build inputs.
- Added `scripts/verify-docker-context.mjs`: actual Docker-context inclusion and
  private-canary regression, independent of hand-written ignore matching.
- Changed `docs/BUILD-STATUS.md`: points to the current packaging evidence.
- Added `docs/evidence/RENDER-THEME-BUILD-CONTEXT-2026-10-26.md`: diagnosis,
  executed checks, scope, redeployment action and file inventory.
