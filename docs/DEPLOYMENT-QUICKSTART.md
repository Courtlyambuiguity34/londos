# View and deploy Londos

Use branch `codex/londos-x2-2026-10-05`. Keep your existing checkout, database volume and private environment files. This guide covers a visual mockup and the current supported application; it does not certify a live production launch.

## 1. View a mockup on your computer

The cloud chat interface cannot expose this application as a clickable preview. Run it on your computer to interact with it in your browser. The verified local platform is Linux or Ubuntu under WSL2, with Node **24.19.0** and npm **11.9.0**.

For a new checkout:

```bash
git clone https://github.com/Courtlyambuiguity34/londos.git
cd londos
git switch codex/londos-x2-2026-10-05
npm ci --no-fund
```

For an existing checkout, use its current directory and preserve private files. In Bash, start the fictional catalogue preview:

```bash
LONDOS_CORE_ENABLED=false LONDOS_DATA_SOURCE=fixtures LONDOS_AI_REMOTE=false LONDOS_MONGODB_ENABLED=false LONDOS_CLOUDINARY_ENABLED=false LONDOS_REDIS_ENABLED=false npm run dev
```

Open `http://localhost:3000` **on that computer**. Browse the mall and sample shops, search, and resize the browser to try mobile layouts. If port 3000 is occupied, use the address Next.js prints. No provider keys, database, worker or Redis are needed for this visual preview. Native sign-in, merchant editing and operator workflows require the database setup below.

## 2. Run the application locally with accounts

Install Docker and start its daemon. From the same checkout:

```bash
npm run db:local
```

This preserves existing local files and volumes; on first use it creates PostgreSQL and random credentials in ignored private files. Privately edit `.env.local`, retain the generated `DATABASE_URL` and `AUTH_SECRET`, and set:

```dotenv
LONDOS_DATA_SOURCE=database
LONDOS_CORE_ENABLED=true
AUTH_BASE_URL=http://127.0.0.1:3000
LONDOS_LOCAL_ADAPTERS=true
LONDOS_DATABASE_ENGINE=postgresql
LONDOS_MONGODB_MIGRATION_ENABLED=false
LONDOS_MONGODB_ENABLED=false
LONDOS_CLOUDINARY_ENABLED=false
LONDOS_REDIS_ENABLED=false
LONDOS_AI_REMOTE=false
```

Then run:

```bash
npm run db:migrate
npm run db:seed
npm run db:operations
npm run build
npm run start -- --port 3000
```

In a second terminal, in the same directory, run `npm run worker`. Open `http://127.0.0.1:3000`; obtain fictional sign-in details privately from `.local/development-accounts.json`. The operations operator must enroll MFA before opening `/landlord/services`. That page shows configuration warnings without exposing secrets.

The worker processes images and durable jobs. Check `/api/ready` for database/authentication availability and a ready worker. Local notifications go to a private sink rather than real email. Stop web/worker with Ctrl-C; `npm run db:stop` stops PostgreSQL while retaining its volume. Do not rerun first-install seeding against a production or unrelated database.

For image uploads, merchant editing, demonstration accounts, development rent and optional provider commands, use [the full local guide](LOCAL-FIRST-SETUP.md). PostgreSQL stores the application's managed image bytes and metadata; Cloudinary currently provides explicitly requested public copies, not an automatic replacement media backend.

## 3. Put a free visual demonstration on Render

In Render's own dashboard, connect this repository and create a **Web Service**, select the implementation branch, choose **Docker** and the **Free** plan. Set the Dockerfile to `deploy/Dockerfile`, build context to the repository root, and health check to `/api/ready`. Keep automatic deployment off while reviewing changes.

For a catalogue-only demonstration, set these server-side variables:

```dotenv
LONDOS_CORE_ENABLED=false
LONDOS_DATA_SOURCE=fixtures
LONDOS_DATABASE_ENGINE=postgresql
LONDOS_LOCAL_ADAPTERS=false
LONDOS_AI_REMOTE=false
LONDOS_MONGODB_ENABLED=false
LONDOS_MONGODB_MIGRATION_ENABLED=false
LONDOS_CLOUDINARY_ENABLED=false
LONDOS_REDIS_ENABLED=false
```

Leave database/auth/provider credentials unset for this fixture demonstration. Use the Dockerfile's default web command, deploy manually, and open the HTTPS service URL **Render supplies**. This is the way to obtain a shareable interactive mockup; no Render deployment was created by this task. The existing [web blueprint](../deploy/render.web.yaml) targets database mode, so do not import it unchanged for this credential-free fixture profile.

As checked in [Render's official free-service documentation](https://render.com/docs/free) on 2026-10-07: free web services sleep after 15 idle minutes, have monthly usage limits, and lose filesystem changes on restart/redeploy/spin-down. Free Render PostgreSQL expires after 30 days. Treat these as demonstration limits, not durable production hosting.

## 4. Deploy database mode on Render or an owned server

The full application requires **reachable PostgreSQL and a separately supervised worker**. Render cannot reach your computer's loopback database. Use a reviewed reachable PostgreSQL service or a protected route to your own server. Do not expose PostgreSQL publicly without appropriate network and TLS controls.

Follow [initial Render setup](RENDER-SETUP.md), its environment-variable table, the [release runbook](RELEASE-RUNBOOK.md), and [render.html](../render.html). Configure the exact HTTPS authentication origin, stable private auth secret, least-privilege database roles, verified Brevo sender/key, worker, backups and trusted ingress. Use `LONDOS_LOCAL_ADAPTERS=false` for a public deployment. Never use development seed helpers there.

MongoDB and Cloudinary can be enabled on either an owned machine or Render once their real credentials and access rules are configured. Redis remains optional, including for subscriptions. Private accounts, rent, audit, jobs and canonical media remain in PostgreSQL. A MongoDB/Cloudinary-only full deployment is not implemented. Free Render web hosting alone does not provide all these dependencies or an always-on independent worker.

Remote lifecycle/privacy/pilot acceptance and the [G5 launch obligations](launch/G5-DECISIONS.json) remain pending. Do not remove development guards or treat a healthy catalogue preview as approval for live finance or merchant onboarding.

## 5. Choose a hosting option

| Option | What you can do now | Main requirement or limit |
| --- | --- | --- |
| Your computer | Free fictional preview; full development workflows | Node/npm; Docker/PostgreSQL and worker for accounts. Internet for first installation and external providers. |
| Owned server | Control PostgreSQL, worker and backups | Supervision, HTTPS, protected ingress, recovery and release approval for public use. |
| Render Free web | Share a fictional catalogue mockup | Sleeping service and ephemeral filesystem; full application dependencies are separate. |
| Render with supported external services | Host the current web/worker architecture | Reachable PostgreSQL, independent worker, verified credentials and production gates; review costs first. |
| Vercel Hobby | A personal Next.js catalogue demonstration | Personal, non-commercial use only; persistent worker needs separate hosting and the full application needs deployment adaptation. |

[Vercel's official Hobby documentation](https://vercel.com/docs/plans/hobby), checked on 2026-10-07, restricts the free plan to personal, non-commercial use. I recommend an owned server or Render for the current full application architecture; Vercel is a reasonable frontend demonstration option. Neither platform is automatically more secure: correct authentication, secret handling, TLS, database isolation and backups matter on both.

## 6. Avoid the MongoDB database conflict

Use **`MONGODB_URL`** as the preferred secret. `MONGODB_DATABASE` is an optional database selector, not an alternative connection credential. If the URL already names the intended dedicated database, leave `MONGODB_DATABASE` unset or set it to exactly that same name. If the URL has no database, set `MONGODB_DATABASE` to the intended dedicated database. The spelling must agree; creating another database does not resolve two conflicting selectors.

Remove an unused legacy `MONGODB_URI`, or keep it exactly equal to `MONGODB_URL`. Never put connection strings in Git, screenshots, chat or command-line arguments. Restart processes after changing private environment settings. Then `npm run mongo:verify` performs the bounded temporary connection/CRUD/cleanup check. It requires neither Cloudinary nor Redis and does not migrate PostgreSQL. See [media and public-copy linkage](CLOUDINARY-MEDIA.md).

No saved MongoDB credentials or database selectors were changed during this preview/documentation task. Live Atlas connectivity has not been established; a prior isolated probe failed at DNS after using the database from the URL. Do not assume a conflict correction alone proves connectivity.
