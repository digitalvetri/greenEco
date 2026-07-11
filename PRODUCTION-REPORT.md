# GreenEco CRM — Production Readiness Report

**Overall: 65 → ~80/100 after Phase 0 + Phase 1.** The "last mile" is largely closed: real Clerk
auth + tenant scoping + env validation (Phase 0), and real PDFs, delivery channels, ops (healthz /
logging / verified backups), rate limiting, and broadened API-level RBAC tests (Phase 1). What
remains before a hard production cutover: Sentry SDK, CI/CD, a staging env — **all gated on standing
up a git repo + remote** — plus live-credential smoke tests for Clerk / WhatsApp / email.

> A polished, shareable version of this report was also generated as an Artifact.

## Scorecard (→ = after Phase 0+1)

| Dimension | Score |
|---|---|
| Feature completeness | 8.5 |
| Correctness & data integrity | 8.0 → 8.5 |
| Code quality & architecture | 8.0 |
| UI / UX & responsiveness | 7.5 |
| Testing & QA | 6.5 → 7.5 |
| Accessibility | 6.5 |
| Performance & scalability | 5.5 |
| **Security & auth** | **4.0 → 7.5** |
| **Production infra & ops** | **3.0 → 6.5** |

## What works (verified: 58 unit + 26 Playwright green, verify-*.ts)
Lead→Proposal→Won→Order→Execute→Invoice→AMC lifecycle · server-side RBAC field-stripping · GST
invoicing (CGST/SGST vs IGST) · immutable multi-location stock ledger · AMC/O&M (PM visits, SLA
tickets, recurring billing) · Decimal money · premium responsive UI (light/dark, mobile drawer) ·
offline follow-ups · ⌘K search · Excel export · audit log.

## Fixed this pass
Header notifications now a real data-driven dropdown; calendar + company chip are real links; fake
"31°C" weather → live clock; 3 redesign-broken dashboard tests green again; dead affordances removed.

## Critical issues (prioritized)

### P0 — go-live blockers ✅ DONE (verified)
- [x] **Real Clerk auth** — `ClerkProvider` (env-gated), `/sign-in` page, svix-verified webhook
      (`/api/webhooks/clerk`) provisions `User` rows; `getSession()` **refuses any Clerk user without a
      provisioned row**. Middleware protects app routes when `AUTH_MODE=clerk`.
- [x] **S3/R2 storage + upload guardrails** — `src/lib/storage.ts` (`local` | `s3` driver);
      size ceiling + MIME/extension allowlist. Proven: png→200, 12MB→**413**, `.sh`→**415**, `.dwg`→200.
      Also raised `experimental.proxyClientMaxBodySize` so the app limit is authoritative (Next was
      truncating the body and masking 413 as 500).
- [x] **Tenant scoping** — new `Company` model + migration + seed; `companyId` now resolves from the
      authenticated **User row**, never env (env is a pre-seed bootstrap only). `getSession()` wrapped in
      React `cache()` (once per request).
- [x] **Zod env validation** — fails fast at boot with named vars. Proven: `AUTH_MODE=clerk` without keys
      and `STORAGE_DRIVER=s3` without a bucket both refuse to start.

> **Not testable here:** the live Clerk sign-in round-trip (no keys). Code paths compile and are gated;
> see the go-live runbook below.

### P1 — before real customers
- [x] **Real PDF generation** — headless Chromium renders the branded `/print/*` route to a
      real PDF (verified: **111 KB, `%PDF-` magic bytes**), stored via the storage adapter, durable
      URL persisted to `pdfUrl`, exposed as a "PDF" button. Admin-only, rate-limited. The auth boundary
      (the trap the advisor caught): a signed, doc-bound, 2-min print token lets the cookieless renderer
      through — a forged token renders a clean **404, never the invoice**.
      `src/lib/pdf.ts`, `src/lib/print-token.ts`, `src/server/services/pdf.ts`, `src/app/api/pdf`.
- [x] **Delivery channels wired** (⚠️ *untested — no keys here*): direct **WhatsApp Cloud API**
      (n8n fallback, then no-op), **Resend** email, both env-gated with unit-tested rendering + gating.
      `src/lib/whatsapp.ts`, `src/lib/email.ts`.
- [x] **Ops: `/healthz` + structured logging + backups** — `/api/healthz` (DB check, 200/503),
      JSON-line logger with optional error forwarding, `scripts/backup.sh` (**backup+restore proven**:
      dumped the live DB, restored to a scratch DB, all 7 table counts matched). Fixed a real bug: the
      Prisma `?schema=` param breaks `pg_dump`.
- [x] **API rate limiting** — fixed-window limiter on `/api/pdf` (10/min) + `/api/uploads` (30/min);
      **verified live: 10×200 then 429**. `src/lib/rate-limit.ts` (unit-tested).
- [x] **E2E broadened** — proposal editor, materials, service/AMC, invoicing, **API-level RBAC**
      (employee search *of a non-empty result set* deep-scanned for pricing keys → none; employee
      `/api/pdf` → 403; forged print token → 404; **stored PDFs not enumerable by sequential number**).
      **26 Playwright tests** (was 15). `e2e/api-rbac.spec.ts`, `e2e/features.spec.ts`.
- [x] **Closed an at-rest PDF leak found in review** — the stored PDF was public at a *guessable*
      sequential path (`/pdfs/invoice/GEC-INV-2026-005.pdf` → 200, no auth), so invoices were
      enumerable and closeout cost data reachable. These URLs must stay auth-free (a customer has no
      login to receive their invoice), so the **key** is now the capability: an unguessable `randomUUID`
      segment, same as `saveUpload`. Guessable path → **404**; random path → **200**. Regression-tested.
- [x] **CI pipeline authored** — `.github/workflows/ci.yml` (Postgres 18 service → migrate → seed →
      verify-fixtures → lint · tsc · unit · build · Playwright). Runs once you push to a remote. Also
      made the new e2e specs **portable** (discover invoice/proposal/contract IDs at runtime — no
      machine-specific hardcoded ids) and cleared all **8 blocking lint errors** (0 errors now; fixed a
      real client-component date-hydration risk via a lazy `useState` initializer).
- [ ] **Sentry SDK + staging env** — env plumbing + runbook ready; needs a DSN + host to verify.

### P2 — polish / scale
- [ ] **Dashboard query-heavy per request** (no caching) — `src/server/services/dashboard-rich.ts`
- [ ] **Offline partial** (follow-ups only; stage/erection have REST but aren't queued)
- [ ] **a11y** — `Label` doesn't wire `htmlFor/id`; contrast/keyboard audit needed
- [ ] Dense tables cramped <380px; one placeholder metric ("Efficiency 92%")
- [ ] **Orphaned PDFs** — each regenerate writes a new random-key file; the old one is left behind
      (harmless: unguessable, `pdfUrl` points at the latest). Add a delete-old-key step or a sweep job.

## Phased roadmap

### Phase 0 — Go-live blockers ✅ COMPLETE
- [x] Real Clerk auth (ClerkProvider + `/sign-in` + roles/tenant in `publicMetadata` → svix webhook → `User` row)
- [x] S3/R2 storage adapter (size + MIME/ext allowlist, keep client compression)
- [x] Tenant scoping — `companyId` from the session's User row; `Company` table per customer
- [x] Zod env validation (fail fast at boot, conditional on `AUTH_MODE` / `STORAGE_DRIVER`)
- **Exit met:** unauthenticated + unprovisioned users blocked; files can survive redeploy (S3 driver);
  app refuses to start on bad config. Gate: `tsc` ✓ · `next build` ✓ · 42 unit ✓ · 15 E2E ✓ · 4 verify scripts ✓.

#### Go-live runbook (flip from dev-shim to real auth + durable storage)
```bash
# 1. Clerk → create app; add users; set each user's publicMetadata:
#    { "role": "ADMIN" | "EMPLOYEE", "companyId": "<Company.id>" }
# 2. Clerk → Webhooks → endpoint {APP_URL}/api/webhooks/clerk
#    events: user.created, user.updated, user.deleted  → copy signing secret
# 3. .env (production):
AUTH_MODE=clerk
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
STORAGE_DRIVER=s3
S3_ENDPOINT=... S3_ACCESS_KEY=... S3_SECRET_KEY=... S3_BUCKET=...
MAX_UPLOAD_MB=10
# 4. Seed the tenant first — the webhook returns 422 for an unknown companyId.
npx prisma migrate deploy && npx tsx prisma/seed.ts
```
Boot will refuse (with named vars) if any required key is missing. A Clerk user with no `User` row
gets a 403 "not provisioned for this workspace" — provisioning is webhook-driven, never implicit.

### Phase 1 — Production hardening ✅ MOSTLY COMPLETE
- [x] Real PDF generation (headless Chromium → storage → `pdfUrl`) — **verified**
- [x] WhatsApp Cloud API + email (Resend) — wired, gated, unit-tested (**live send untested — no keys**)
- [x] Structured logs + `/healthz`; nightly `pg_dump` (retention) — **backup+restore verified**
- [x] Broaden Playwright (editor/materials/service/invoicing/API RBAC); API rate limiting — **verified**
- [ ] Sentry SDK; CI/CD pipeline; staging env — **blocked on a git remote (see below)**
- **Exit (met for the verifiable set):** documents render to real attachable PDFs; data backs up and
  restores; abuse is rate-limited; API-level RBAC is test-guarded. Gate: `tsc` ✓ · `next build` ✓ ·
  **58 unit** ✓ · **26 Playwright** ✓ · verify-pdf ✓ · backup+restore ✓.

#### Phase 1 runbook — the untested pile (implement ✓ / verify ✗ without accounts)
```bash
# WhatsApp (direct Cloud API):  Meta Business → WhatsApp → permanent token + phone-number ID
WHATSAPP_TOKEN=...   WHATSAPP_PHONE_ID=...          # else set WHATSAPP_WEBHOOK_URL for n8n; else no-op
# Email (Resend):  resend.com → API key + verified sender domain
RESEND_API_KEY=re_...   EMAIL_FROM="Green Ecocare <billing@greenecocare.in>"
# Error monitoring — dependency-free sink now:
ERROR_WEBHOOK_URL=https://...                        # any JSON collector
#   Full Sentry upgrade:  npm i @sentry/nextjs && npx @sentry/wizard@latest -i nextjs
#   (adds sentry.*.config.ts + instrumentation.ts; set SENTRY_DSN). Left out here because it can't be
#   verified without a DSN and would add an unvalidated build-time dependency before ship.
# PDF rendering in prod:  the Docker image MUST install the browser —
#   RUN npx playwright install --with-deps chromium
# Backups:  cron on the DB host —
#   0 2 * * *  DATABASE_URL=$DATABASE_URL BACKUP_DIR=/var/backups/greeneco ./scripts/backup.sh
```
**CI/CD + staging are the one genuinely-blocked item:** this working tree is *not a git repo* and has no
remote. A pipeline (lint · tsc · unit · Playwright · build → `prisma migrate deploy`) can be authored but
can't run until there's a repo + host. Decide the remote, then it's ~1 file.

### Phase 2 — Scale & polish (~2–4 weeks)
- [ ] Dashboard caching/revalidation + query trims + indexes
- [ ] Full offline for all 4 field actions
- [ ] Accessibility pass (labels, ARIA, contrast/keyboard)
- [ ] Granular RBAC (PM/accountant/supervisor/client); true multi-tenant onboarding; mobile tables

### Phase 3 — World-class (own the sector)
TNPCB/CPCB compliance vault · GST e-invoicing (IRN) + e-way bill + Tally sync · client portal +
WhatsApp + UPI collection · IoT plant telemetry → predictive maintenance · AI ops layer (price
intelligence, voice-to-proposal, technology recommender) · cashflow forecast + subcontractor mgmt.

## Deliver soon
Week 1: Phase 0 → safe & real. Week 2–3: top of Phase 1 → deliverable & observable. Ship, then layer
Phase 2 polish + Phase 3 moat (compliance/IoT/portal) while live.
