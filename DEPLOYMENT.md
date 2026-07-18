# Deploying GreenEco CRM to Coolify

Verified locally (2026-07-18): `docker build` succeeds, a fresh Postgres 18 container
receives all 24 `prisma migrate deploy` migrations cleanly, `next start` boots and
`/api/healthz` returns `{"status":"ok"}`, `prisma/seed.ts` creates the admin/employee
logins, and headless Chromium renders a PDF inside the image (the `/print/*` pipeline).
This doc is that exact path, run against your own Coolify server.

## What ships

- `Dockerfile` — multi-stage build (deps → next build → runner). The runner stage
  installs Chromium via `playwright-core`'s own CLI (`src/lib/pdf.ts` needs it for
  invoice/proposal/closeout PDFs) and includes `src/`, `prisma/`, `tsconfig.json` so
  `npx prisma migrate deploy` and `npx tsx prisma/seed.ts` can run **inside** the image.
- `docker-entrypoint.sh` — runs `prisma migrate deploy` (idempotent — only applies
  pending migrations) then `next start`, every container boot. Safe for a
  single-instance deploy; do not scale this app to >1 replica without moving the
  migration step out of the boot path first.
- `.dockerignore` — excludes `node_modules`, `.env`, test artifacts, and the runtime
  `public/uploads` / `public/pdfs` directories from the build context.

## Decisions made for this deploy

- **Database**: a Coolify-managed Postgres 18 service (own volume, own backups via
  Coolify).
- **File storage**: `STORAGE_DRIVER=local` (not S3) — uploads and generated PDFs are
  written under `public/uploads` and `public/pdfs`. To survive redeploys, both
  directories are mounted as **Coolify persistent volumes** (step 5 below). Nothing
  else under `public/` is runtime-written, so mounting only those two subpaths never
  shadows the committed brand assets (logo, favicon, etc.).
- **Domain**: Coolify's auto-generated `*.sslip.io`-style domain for now. A real
  domain can be attached later in the same resource's Domains tab with zero
  redeploy — just DNS + a click.
- **Integrations** (WhatsApp/Email/AI/Clerk): left unset at deploy time. This app has
  a **Settings → Integrations & API keys** admin page (v26) that lets you paste and
  rotate all of those at runtime, no redeploy needed. Only the "hard" boot-time
  secrets below go in Coolify's environment variables.

---

## Step 1 — Create the Coolify Project

1. Coolify dashboard → **Projects** → **+ New Project**.
2. Name it (e.g. `GreenEco CRM`) and open it. Everything below (database + app) gets
   created as two resources *inside* this one project, so they're grouped, share the
   project's internal Docker network, and can be torn down together if ever needed.

## Step 2 — Add the Postgres database

1. Inside the project → **+ New Resource** → **Database** → **PostgreSQL** (pick the
   18.x image tag if Coolify lets you choose; otherwise default is fine).
2. Set a strong database password (Coolify usually generates one — keep it).
3. Deploy the database resource and wait until it shows **Running**.
4. Open it → **Connection Info** (or similar tab) and copy the **internal** connection
   string — the one using the internal Docker service name as host (something like
   `postgres-xxxxx`), not `localhost`. It'll look like:
   ```
   postgresql://<user>:<password>@<internal-host>:5432/<dbname>
   ```
   The app and the DB will be in the same Coolify project network, so the app can
   reach the DB by its internal hostname without exposing Postgres to the internet.

## Step 3 — Add the application resource

1. Inside the same project → **+ New Resource** → **Application** → **Public/Private
   Git Repository** (or connect via GitHub App if you've linked your GitHub account).
2. Repository: `https://github.com/digitalvetri/greenEco.git`, branch `main`.
3. **Build Pack**: choose **Dockerfile** (not Nixpacks) — Coolify will detect the
   `Dockerfile` at the repo root automatically.
4. **Port**: `3000` (the Dockerfile `EXPOSE`s 3000 and `next start` listens there).
5. Don't deploy yet — set environment variables first (Step 4).

## Step 4 — Environment variables

On the application resource → **Environment Variables**, add these. Generate the two
secrets yourself (don't reuse the values below) — from a terminal:

```bash
openssl rand -hex 32
```

Run that twice, once for each secret.

| Key | Value | Notes |
|---|---|---|
| `DATABASE_URL` | the internal connection string from Step 2 | append `?schema=public` |
| `AUTH_MODE` | `dev` | this app's credentials-login mode is production-supported (see AGENTS.md) |
| `AUTH_DEV_BYPASS` | `0` | **required** — without this, auth falls back to a forgeable dev cookie |
| `SESSION_SECRET` | output of `openssl rand -hex 32` #1 | boot fails loudly if this is short/default in prod |
| `PRINT_TOKEN_SECRET` | output of `openssl rand -hex 32` #2 | same — guards priced PDF links |
| `NODE_ENV` | `production` | |
| `NEXT_PUBLIC_APP_URL` | the app's Coolify domain, e.g. `https://xxxx.sslip.io` | used to build the `/print/*` URL Chromium visits |
| `STORAGE_DRIVER` | `local` | see Step 5 for making this durable |
| `DEFAULT_COMPANY_ID` | `green-ecocare` | bootstrap tenant id (matches seed) |
| `COMPANY_GSTIN` | your GSTIN | optional but recommended before invoicing |
| `COMPANY_STATE_CODE` | `33` (or your state's 2-digit GST code) | |
| `SEED_ADMIN_PASSWORD` | a strong password you choose | only read by the one-off seed command in Step 7 |
| `SEED_EMPLOYEE_PASSWORD` | a strong password you choose | same |
| `CRON_KEY` | output of `openssl rand -hex 32` #3 | protects `/api/cron` (Step 8) |

Leave `WHATSAPP_*`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`,
`GEMINI_API_KEY`, `CLERK_*`, `S3_*` unset — configure the ones you have later from
**Settings → Integrations** inside the running app, as an admin. Nothing degrades
badly if they're absent (WhatsApp/email log instead of sending, AI falls back to
templates).

## Step 5 — Persistent storage for uploads/PDFs

Still on the application resource → **Storages** (or **Volumes**) tab → add two
mounts:

| Container path | Purpose |
|---|---|
| `/app/public/uploads` | user-uploaded files (bill photos, documents) |
| `/app/public/pdfs` | generated invoice/proposal/closeout PDFs |

Let Coolify create/manage the underlying volumes. Don't mount anything at
`/app/public` itself — that would shadow the brand assets baked into the image.

## Step 6 — Deploy

1. Click **Deploy**. Watch the build log — it runs `npm ci` → `prisma generate` →
   `next build` → installs Chromium (~2–3 min total; the Chromium download is the
   slow part).
2. On container start, the entrypoint runs `prisma migrate deploy` — you'll see each
   of the 24 migrations apply in the runtime logs, then `next start`.
3. Confirm health: open `https://<your-coolify-domain>/api/healthz` — expect
   `{"status":"ok","checks":{"db":"ok"},...}`.

## Step 7 — Create the first admin login

The database is now schema-complete but has **no rows** — `migrate deploy` only
applies schema, it doesn't seed data. Run the seed script once, inside the running
container:

- In Coolify: open the application resource → **Terminal** (or **Execute Command**)
  → run:
  ```bash
  npx tsx prisma/seed.ts
  ```
  (`SEED_ADMIN_PASSWORD` / `SEED_EMPLOYEE_PASSWORD` are already in the container's
  environment from Step 4, so the script picks them up automatically.)
- You should see `Seed complete ✅`.
- Log in at `https://<your-coolify-domain>/sign-in` with `admin@greeneco.in` and the
  password you set as `SEED_ADMIN_PASSWORD`.

Re-running the seed script later is safe — it upserts the company/items/users and
explicitly will **not** overwrite an already-rotated password.

## Step 8 — Schedule the cron automations (optional but recommended)

The app's automation engine (follow-up digests, payment reminders, AMC reminders,
low-stock alerts, etc.) only run when `/api/cron` is hit. In Coolify:

1. Application resource → **Scheduled Tasks** → **+ New**.
2. Command:
   ```bash
   curl -s -H "x-cron-key: $CRON_KEY" "http://localhost:3000/api/cron?job=all"
   ```
3. Schedule: every 15 minutes is a reasonable default (`*/15 * * * *`).

Without `CRON_KEY` set, this endpoint fails closed (401) in production by design —
so this step is inert (and harmless) until you've set `CRON_KEY` in Step 4.

## Step 9 — Attach a real domain (whenever you're ready)

Application resource → **Domains** → add your domain/subdomain, point its DNS `A`/
`CNAME` record at the Coolify server per Coolify's instructions, and update
`NEXT_PUBLIC_APP_URL` to match — then redeploy (needed because that value is read at
request time to build the PDF-rendering URL).

## Troubleshooting

- **Boots then immediately errors about `SESSION_SECRET`/`PRINT_TOKEN_SECRET`** — one
  of them is missing, too short (<32 chars), or still the dev default. Re-check
  Step 4.
- **`/api/cron` returns 401** — either you didn't set `CRON_KEY`, or the header value
  doesn't match. This is intentional fail-closed behavior in production.
- **PDF download fails / times out** — check the app's logs for a Chromium launch
  error; if you ever change the base image or `playwright-core` version, rebuild
  from scratch (the browser binary is downloaded to match the exact version).
- **Uploaded files disappear after a redeploy** — Step 5's volumes aren't mounted, or
  are mounted at the wrong path.
