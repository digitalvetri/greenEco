@AGENTS.md

# GreenEco CRM — Build Notes

CRM for **Green Ecocare Pvt Ltd** (wastewater treatment plant projects), built by DigitalVetri.AI.
Full spec: `ECOFLOW-MASTER-BUILD-SPEC-v1.0.md` (in the parent Downloads folder). Follow its phases.

## Environment decisions (deviations from the spec, with reasons)

- **Next.js 16** (spec said 15) — the scaffold shipped with 16.2.10. `params`/`searchParams`
  are **async** (`await params`) in every dynamic page/route/layout.
- **Prisma 6** (pinned) — `npm install prisma` pulls v7, which requires `prisma.config.ts` +
  driver adapters and drops `url` in the datasource. Pinned to `^6` to keep the spec's standard
  `migrate dev` / `migrate deploy` workflow and `url = env("DATABASE_URL")`.
- **Real local PostgreSQL 18** on `localhost:5432`, db `greeneco_crm` (not SQLite) — keeps the
  spec's Postgres-locked schema (`@db.Decimal`, `String[]`) intact and lets migrations/seed run.
- **Two auth modes** (`src/lib/auth.ts`) — `AUTH_MODE=dev` returns a fixed session (role toggled via
  `DEV_ROLE` or the `dev_role` cookie, dev only); `AUTH_MODE=clerk` uses real Clerk and **refuses any
  Clerk user without a provisioned `User` row** (403). Both resolve `companyId` from that row.
- **UI**: Tailwind v4 + hand-rolled shadcn-style primitives in `src/components/ui/` (no shadcn CLI).

## Non-negotiables (spec §6, §9)

- **Field stripping** — `src/lib/rbac.ts` `stripPricing(data, role)`. EMPLOYEE JSON must never
  contain purchase price / cost / margin / budget / PO rate+total / valueAtCost. Applied in the
  **service return path**. Wholly-admin entities (PO, VendorPrice, Budget) are capability-gated,
  not just key-stripped, because `rate` is a *sell* price on BOQItem (visible) but a *purchase*
  price on PO (hidden). Covered by `src/lib/rbac.test.ts`.
- **Money** = `Decimal` in DB, `decimal.js` in code (`src/lib/money.ts`). Never float on ₹.
- **Immutable ledgers** — `StockMovement`, `Receipt` are append-only; corrections via reversal.
- **Sequential numbers never reused** — `src/server/services/numbering.ts` (Postgres
  `INSERT … ON CONFLICT … RETURNING`, race-free; call inside the document's `$transaction`).
- **Service layer** — `ctx = {userId, role, companyId}` on every service method; route handlers
  stay thin; audit every mutation via `src/lib/audit.ts`.

## Commands

- `npm run dev` — dev server (localhost:3000)
- `npm test` — Vitest (rbac stripping, gst, money, stock, milestone, numbering)
- `npm run db:migrate` / `npm run db:seed` / `npm run db:studio`

## Status

### v25 — Automation Engine (AUTOMATION-ENGINE-SPEC-v1.0 — all 15 automations)

Full automation engine + 15 automations across 6 waves. **Gate: tsc 0 · lint 0 · 72 unit · 68 e2e ·
7 automation verify scripts (engine + w1–w5 + idempotency) · sell/control/invoices regressions green.**
See `AUTOMATIONS-MODULE-REPORT.md`.

- **Engine** (`src/server/automations/`, `automation_engine` migration): `AutomationLog` (unique
  `dedupeKey` idempotency), `AutomationSetting` (kill switch/params), `AutomationTask` (auto to-dos);
  `engine.ts` (registry + `runAutomation` + kill switch), `deliver.ts` (single choke point — skip if
  `SENT`, dry-run under a `dry:` namespace, logs every attempt), `util.ts`. `/api/cron` rewritten to
  dispatch through the engine + `?dryRun=1` (amc/purgeAudio stay inline; A4 replaced dueDates/whatsapp,
  A11 replaced lowstock). **Settings → Automations** page (toggle + dry-run + last-run + admin phones).
- **A1–A15** (waves 1–5): follow-up digest, auto-next-followup, stale-deal nudges · payment reminders
  (quiet hours), stage→draft-invoice, monthly receivables · site digest, budget alerts, delay detection,
  bill vision (Claude) · low-stock draft PO, request routing · weekly brief (Groq), win/loss loop,
  reference mining. Event-driven ones fire from lead/order/erection/materials/proposal services + register
  a stub for the Settings row.
- **Schema:** `Order.clientPhone`, `Invoice.status` (DRAFT|ISSUED — excluded from every money aggregate
  until issued), `ErectionEntry.aiExtract/aiMatch`, `ProposalOutcome`. **Env:** `GROQ_API_KEY`, `ADMIN_PHONES`
  + `.env.example` created; `/api/healthz` gains `automations.lastCronAt` + recent-failure count.
- **Gated + degrades:** WhatsApp/email/Claude/Groq unset → logged, never sent; A10/A13/A14 fall back
  cleanly with no key. AI ones untested-live (no keys here). Cross-cutting docs point to the spec + report.

### v24 — Premium animated login + full-width pages + transparent logo

- **Login redesign** (`(auth)/sign-in`) — brand panel is now a living "aeration tank": a self-contained
  `WaterCanvas` client component paints parallax rising bubbles + drifting light orbs over a teal-green→ocean-blue
  gradient (DPR-aware, pauses when the tab is hidden, single calm frame under `prefers-reduced-motion`). Adds a
  status pill, refreshed headline, frosted-glass feature cards, a bottom water-wave SVG, gradient CTA, input icons
  (mail/lock) + a password show/hide toggle. Heading "Welcome back" + labelled inputs preserved for e2e (the toggle's
  "Show password" aria-label collides with `getByLabel("Password")` substring match → login e2e now uses `exact: true`).
- **Transparent logo** — `public/brand/logo-mark-light.png` generated by border **flood-fill** of the source JPG's
  white background (preserves the droplet's interior highlight, no holes; tighter crop drops the tagline text). Used
  directly on the login (no white badge) per request.
- **Full-width pages** — settings + the five detail pages (`projects/service/materials/clients/erection [id]`) dropped
  their `max-w` caps to fill the area beside the sidebar (earlier commits this session).

### v23 — Layout width sweep + working profile/settings + sidebar cleanup

Two threads: (a) fix the "content hugs the left, empty gutter on the right" imbalance on every detail/form
page; (b) turn the read-only Settings page into a real, working account area and drop the dev-only role pill.
**Gate: tsc 0 · lint 0 · 72 unit · 68 Playwright · build clean · profile save + password change verified
end-to-end (old pw rejected / new pw works / wrong-current guarded) then reseeded to restore `Admin@123`.**

- **Width sweep** — narrow left-hugging containers rebalanced so wide screens are used, not wasted:
  - **Leads detail** — header rebuilt as one summary card (status + owner, divider, a single uniform action
    toolbar — removed the `justify-between` dead gap), then a 2-column layout (`max-w-6xl`): details/forms on
    the left, **Activity timeline in a sticky right sidebar** on `xl`, stacking below on smaller screens.
  - **Proposal editor** — `max-w-4xl` → `mx-auto max-w-5xl` (BOQ table gets room, margins balanced).
  - **Detail pages** (`projects/[id]`, `service/[id]`, `materials/[id]`, `clients/[id]`, `erection/[id]`) →
    `mx-auto max-w-5xl`. **Erection list** dropped its `max-w-3xl` to match the other full-width list pages.
  - **Forms** — the lead create/edit form: centering moved to the *page* wrapper (`mx-auto max-w-3xl`) so the
    PageHeader and the form share one centered column (they were misaligned when only the form was centered);
    `settings` centered too. `documents-card` lost its hardcoded `mt-4` (parent `space-y-4` owns spacing).
- **Working profile / settings** — new `server/services/profile.ts` (`getMyProfile` / `updateProfile` /
  `changePassword`, all scoped to `session.userId`, Zod-validated, audited; password change verifies the
  current scrypt hash, rejects reuse, never logs material) + `settings/actions.ts` + `settings/profile-card.tsx`
  (edit name/phone, change password with confirm). Settings restructured: **My Profile + Password shown to
  every role**; the Users / Company&Thresholds / Milestone-template / Masters cards are gated under a
  "Workspace (admin)" section. Employees can now maintain their own account.
- **Sidebar** — removed the dev-only **"as EMPLOYEE" role-switch pill** (`RoleSwitcher`) now that real
  credentials login exists; the profile block is a clickable link to `/settings`. Dropped the unused `env`
  import from the dashboard layout. (The `/api/dev/role` route is left in place, just unreferenced.)

### v22 — Brand identity: real Green Ecocare logo + redesigned login

Integrated the client's actual logo (source `Green Ecocare/Final Logo File/Green Ecocare.jpg`) across the app
and rebuilt the sign-in page. **Gate: tsc 0 · lint 0 · 72 unit · build clean · 69 Playwright · browser-verified
(login desktop + mobile, dashboard sidebar, end-to-end admin login).**
- **Brand assets** (`public/brand/`, generated with `sharp`) — `logo-mark.png` (the droplet-with-leaves mark,
  cropped from the source + centered on white, 512px), `logo-full.png/.jpg`, `favicon.png`; plus `src/app/icon.png`
  (256px) so Next auto-serves the browser-tab favicon. Note: sharp's `background` needs `alpha`, not `a`.
- **Logo everywhere** — replaced the generic `Droplets` lucide icon with a `next/image` of `logo-mark.png` in the
  sidebar header, the top-bar company chip (`(dashboard)/layout.tsx`), and the mobile drawer header
  (`mobile-nav.tsx`). "GreenEco CRM" → "Green Ecocare" in the shell; root metadata title → "Green Ecocare CRM".
- **Redesigned `/sign-in`** — premium split-screen: left brand panel (green→blue gradient `#0b5e39→#158a53→#1560bd`
  with brand-tinted blur glows, the logo mark in a white badge, headline + 3-feature list + "It's our future."
  tagline), right form panel (Welcome back + email/password `Field`s + Sign-in `Button` + error alert). Mobile
  collapses to a centered logo + form. Wired to the existing `loginAction` (credentials → signed session cookie).
- **e2e fix** — `features.spec.ts` asserted the old "GreenEco CRM" login heading; retargeted to "Welcome back"
  (rename-breaks-tests, same class as earlier waves).

### v2 — Design overhaul + production hardening (built with the GreenEco skills/agents)

- **Design system** (`product-team/skills/ui-design-system`): WCAG token set in `globals.css`
  (brand-green ramp, 8pt grid, modular type scale, elevation, motion) + **light & dark themes**
  (toggle). Refined all primitives (Button w/ loading, Card, Badge, Input/Field) and added
  Skeleton, EmptyState, Spinner, Dialog, Tabs, **Toast**. Polished shell (sidebar/header/bottom-nav),
  Recharts dashboard (pipeline + receivables donut), error/loading/404 states. Verified by
  screenshotting light/dark/mobile + list/detail/dense and fixing regressions.
- **Global search** (⌘K) across leads/proposals/projects/items/invoices, RBAC-scoped
  (`server/services/search.ts` + `/api/search` + header component).
- **Team-assignment** UI on projects; **materials feature-screens** (Transfer / Issue-to-site /
  Material Requests / Stock Audit — `materials-tools.tsx`, built by a delegated agent).
- **Playwright E2E** (`e2e/`, `playwright.config.ts`): 14 tests — smoke (all pages 200), lead+follow-up
  create, RBAC (employee ≠ admin tiles), REST field actions. `npm run test:e2e`.
- **Security**: `src/middleware.ts` (security headers + Clerk-gated route protection).
  **Clerk installed & wired** — middleware protects routes when `AUTH_MODE=clerk`, `auth.ts` reads the
  Clerk session; build-verified on Next 16. Remaining to go live: set Clerk keys, add `<ClerkProvider>`
  in the root layout + a `/sign-in` page (couldn't test the live auth flow without keys).
- **Gate: green** — `tsc` 0 · 31 Vitest · `next build` clean · verify-{sell,execute,control} · 14/14 Playwright.

### v4 — Premium dashboard + shell redesign (AquaFlow-style)

Rebuilt the home + shell to a rich, data-dense SaaS design (reference-driven).
- **Gradient sidebar** (deep emerald→teal, `.gc-sidebar`) with logo, nav, promo card + profile card;
  richer top bar (wide ⌘K search, notification icons, company chip, theme toggle).
- **Dashboard** (`dashboard-rich.ts` service + `page.tsx`): greeting header (weather/date), 4 colored
  hero stat cards, Project-Overview donut + Revenue area chart (Recharts), Site-Health panel, Recent
  Projects with progress, right rail (Upcoming Tasks / Recent Activity / Top Clients), Environmental-
  Impact strip, Critical-Alert card — all wired to real data (orders/proposals/tickets/receipts/audit).
- **Dark mode fix**: bound Tailwind's `dark:` variant to `[data-theme="dark"]` via `@custom-variant`
  so utility `dark:` classes flip with the in-app toggle (not just OS preference). Verified light+dark.
- Gate: `tsc` 0 · 42 Vitest · `next build` clean.

### v4.1 — Fully responsive shell (desktop / laptop / tablet / mobile)

- **Fixed the sidebar scroll bug**: app shell is now `h-[100dvh] overflow-hidden` with the sidebar and
  main **scrolling independently** — the sidebar + header never move (verified: logo stays visible
  after scrolling main to the bottom).
- **Mobile/tablet hamburger drawer** (`components/shell/mobile-nav.tsx`) with the **full nav** so every
  section is reachable below 1024px (previously only 5 bottom-nav items were accessible). Rendered via
  `createPortal(document.body)` to escape the header's `backdrop-blur` stacking context (fixed a
  content-bleed-through bug).
- Responsive breakpoints: sidebar ≥1024 (`lg`), hamburger drawer <1024, bottom-nav <768 (`md`).
  Header collapses icons progressively; content grids stack. Verified at 390 / 834 / 1280 with **no
  horizontal overflow** on any content page. Gate: `tsc` 0 · 42 Vitest · `next build` clean.

### v3 — AMC / O&M lifecycle module (post-handover recurring revenue)

Extends the CRM past "Handover" into the service lifecycle — the #1 strategic expansion.
- **Service contracts (AMC)** with auto-generated **preventive-maintenance visit schedule**
  (`lib/domain/amc.ts` — schedule gen, visit-status engine, ticket SLA, contract status;
  11 unit tests). **Maintenance visits** capture plant readings (pH/DO/flow/blower), checklist,
  geo-photos. **Service tickets** with priority→SLA (CRITICAL 4h … LOW 7d) + breach flags.
  **Recurring AMC GST invoicing** (reuses the invoice/GST engine). `Service / AMC` nav + hub +
  contract detail; cron reminders (visits-due, contracts-expiring-30d). RBAC: `annualValue` is
  admin-only (stripped for EMPLOYEE). Verified end-to-end: `scripts/verify-amc.ts`.
- Gate: `tsc` 0 · **42 Vitest** · `next build` clean · verify-amc green.

### Phase status

- **Phase 0 — Foundation: DONE** (schema+migration, rbac, gst, money, domain logic, seed, app
  shell, role-aware nav, dashboard; 28 unit tests green; `next build` clean; runs both roles).
- **Phase 1 — Sell: core DONE & verified.**
  - Leads: full CRUD, duplicate check + override, follow-ups + SpeakButton (Web Speech ta-IN/en-IN)
    + geo, RBAC scoping, convert→proposal. Verified via REST smoke tests.
  - Proposals: versioning (bump on ≥SENT), AI generator (`lib/ai.ts` — Claude API when
    `ANTHROPIC_API_KEY` set, else KLD-band template fallback, `aiSuggested` review badges),
    editor UI, admin approval + margin guard, Won→Order transaction (order + 9 stages + milestones
    from payment terms + SITE location + budget). Full flow verified end-to-end against live DB
    (`scripts/verify-sell.ts`): lead→proposal→AI→approve→Won→Order, employee cannot see estimatedCost.
- **Phase 1 tail: DONE.** Branded PDF via print routes (`/print/proposal`, `/print/invoice`,
  `/print/closeout` — brand header, `@media print`, Print/Save-PDF button); Excel lead import/export
  (`lib/excel.ts` + SheetJS); reminder cron (`/api/cron`).
- **Phase 2 — Execute: DONE & verified.** Orders/projects (progress %, RBAC project-access), stage
  updates + geo photos + delay-reason gate, drawing revisions (supersede), milestones + receipts +
  milestone status engine, **GST invoices** (place-of-supply CGST/SGST vs IGST, amount-in-words,
  sequential no.), credit notes, Client 360 timeline, receivables report + Excel + reference
  analytics, local upload route + image compression. Verified `scripts/verify-execute.ts`.
- **Phase 3 — Control: DONE & verified.** Item/vendor masters (purchasePrice admin-only), PO→GRN→
  immutable StockMovement, multi-location balances (derived), transfers (paired), consumption
  (`valueAtCost`), material requests (no prices), low stock, stock audit (variance→ADJUST), erection
  entries (SITE_PURCHASE bill-image gate, auto-approve limit), verification queue, **Budget vs Actual**
  (spent = labour+purchase+other+consumption; committed = open POs to site; 70/90/100% alerts),
  close-out PDF. Verified `scripts/verify-control.ts`; **field-stripping tests pass** (31 total).
- **Phase 4 — Automate: core DONE.** WhatsApp via n8n (`lib/whatsapp.ts`, no-op without webhook) wired
  into cron (payment reminders + admin digest); offline PWA (service worker app-shell cache +
  IndexedDB queue `lib/offline-queue.ts` + REST replay endpoints + online/offline indicator +
  offline-tolerant follow-up form); AI learning loop (past-WON retrieval into the generator); cron
  jobs (follow-up digest, −7/−3/0 due-date alerts, 90-day audio purge).
- **Remaining polish:** Tally export, full offline coverage for stage/erection forms (REST endpoints
  exist), WhatsApp Cloud API live numbers. Confirm with client: 50/30/20 milestone template, GSTIN/SAC.

### v5 — Phase 0: go-live blockers (all four closed; see `PRODUCTION-REPORT.md`)

Closes the P0 list from the production audit. **Gate: `tsc` 0 · `next build` clean · 42 Vitest ·
15 Playwright · verify-{sell,execute,control,amc} all green.**

- **Fail-fast env validation** (`src/lib/env.ts`) — Zod schema with a `superRefine` that makes keys
  *conditionally* required: `AUTH_MODE=clerk` ⇒ `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`;
  `STORAGE_DRIVER=s3` ⇒ all four `S3_*`. Boot throws with the offending vars named. Server-only (no
  client import). Proven with negative tests, not just a passing build.
- **Storage adapter + upload guardrails** (`src/lib/storage.ts`, `api/uploads/route.ts`) — `local` |
  `s3` driver (S3/R2, `forcePathStyle`); size ceiling (`MAX_UPLOAD_MB`) + MIME/extension allowlist
  (images, PDF, `.dwg`/`.dxf`). Curl-verified: **200 / 413 / 415 / 200**. `content-length` is checked
  *before* `req.formData()` — otherwise Next truncates the body and the real 413 surfaces as a 500.
  `next.config.ts` sets `experimental.proxyClientMaxBodySize: "32mb"` (that key was **renamed** from
  `middlewareClientMaxBodySize`; the runtime warning text is stale — confirmed in
  `node_modules/next/dist/docs/`) so the *app's* limit is the authoritative one.
- **Real tenant scoping** — new `Company` model + `company_tenant` migration + seed. `companyId` now
  comes from the authenticated **User row**, never from env (env is only a pre-seed bootstrap).
  `getSession()` is wrapped in React `cache()` so it runs once per request.
- **Real Clerk auth** — `<ClerkProvider>` in the root layout (rendered *only* when `AUTH_MODE=clerk`),
  `/sign-in` route, and a **svix-verified** `/api/webhooks/clerk` that provisions `User` rows from
  `public_metadata` (`role`, `companyId`), rejects an unknown company with 422, and deactivates on
  `user.deleted`. ⚠️ **Not end-to-end tested** — no Clerk keys available here. Build- and
  type-verified, env-gated. Runbook: `PRODUCTION-REPORT.md` → "Go-live runbook".

### v6 — Phase 1: production hardening (verifiable set complete; see `PRODUCTION-REPORT.md`)

**Gate: `tsc` 0 · `next build` clean · 58 Vitest · 26 Playwright · verify-pdf · backup+restore.**

- **Real PDF generation** — headless Chromium (`playwright-core`) renders the branded `/print/*`
  route to a real PDF, stored via the storage adapter, durable URL persisted to `pdfUrl`, surfaced as
  a "PDF" button (`components/pdf/download-pdf-button.tsx`). Admin-only + rate-limited. **The auth
  boundary is the hard part**: the renderer carries no session cookie, so `/print/*` also accepts a
  short-lived **HMAC print token** (`lib/print-token.ts`) bound to `docType+docId+userId`. A forged
  token → clean **404**, never the document. `/print/*` is deliberately NOT in the Clerk protected
  matcher (token-authed instead); `/api/webhooks|cron|healthz` are also excluded (own auth). Verified
  end-to-end: `scripts/verify-pdf.ts` (111 KB, `%PDF-`), forged-token 404, EMPLOYEE 403.
- **Delivery channels** — `lib/whatsapp.ts` (direct **WhatsApp Cloud API** → n8n fallback → no-op) and
  `lib/email.ts` (**Resend** HTTP, no SDK). Env-gated; message rendering + transport selection + gating
  unit-tested. ⚠️ **Live send untested — no keys here.**
- **Ops** — `/api/healthz` (DB check, 200/503), JSON-line `lib/logger.ts` (+ optional `ERROR_WEBHOOK_URL`
  forwarding; documented Sentry upgrade path), `scripts/backup.sh` (`pg_dump -Fc` + retention).
  **Backup+restore proven** (live DB → scratch DB, 7 table counts matched). Fixed a real bug: Prisma's
  `?schema=` param is libpq-invalid — the script strips it and maps schema → `PGOPTIONS`.
- **Rate limiting** — `lib/rate-limit.ts` fixed-window (single-instance; Redis seam documented) on
  `/api/pdf` (10/min) + `/api/uploads` (30/min). **Verified live: 10×200 then 429.** Unit-tested.
- **Broadened E2E** — `e2e/api-rbac.spec.ts` (EMPLOYEE search of a *non-empty* result set deep-scanned
  for pricing keys → none; `/api/pdf` 403; forged print token 404; **stored PDFs not enumerable by
  sequential number**; healthz), `e2e/features.spec.ts` (proposal editor, materials tools, service
  detail, AMC-revenue RBAC, invoice PDF button). 15 → **26 tests**.
- **At-rest PDF leak (found in review, fixed)** — stored PDFs were public at a *guessable* sequential
  path, so invoices/closeout costs were enumerable with no auth. These URLs must stay auth-free (a
  customer receiving a WhatsApp invoice has no login), so the **key** is the capability now: an
  unguessable `randomUUID` segment (like `saveUpload`). `src/server/services/pdf.ts` `randomKey()`.
  Never key a public artifact on a guessable id. Guessable → 404, random → 200; regression-tested.
- **Env**: every new var flows through `lib/env.ts` (`PRINT_TOKEN_SECRET` is hard-required ≥32 chars when
  `AUTH_MODE=clerk`). Only three files read `process.env` directly, all documented in `AGENTS.md`.
- **CI pipeline** — `.github/workflows/ci.yml` (Postgres 18 service → `migrate deploy` → seed →
  run the 4 verify scripts for fixtures → lint · tsc · unit · build · Playwright). Ready to run on
  first push. The new e2e specs are **portable** — they discover invoice/proposal/contract IDs at
  runtime (no hardcoded local cuids), so they pass against any freshly-seeded DB.
- **Lint is clean (0 errors)** — downgraded `react-hooks/set-state-in-effect` to *warn* (legitimate
  mount-time browser-API reads: theme/localStorage, `window` checks, online status), and **fixed** the
  one real `react-hooks/purity` error (a `new Date()` in a client component → SSR/hydration mismatch
  risk) by moving the date defaults into a lazy `useState` initializer.
- **Remaining P1:** Sentry SDK + staging env — env plumbing + runbook ready, need a DSN + host to
  verify. User is standing up the git remote; CI runs on first push.

### v7 — Leads module P0 fixes (module audit → `LEADS-MODULE-REPORT.md`)

Closed the three P0 bugs from the leads gap analysis. **Gate: `tsc` 0 · lint 0 · 58 unit · 27 Playwright ·
`verify-leads-p0` (15 checks) · sell flow intact.**

- **Pagination** — the list hard-capped at 50 and ignored the cursor `listLeads` returns; leads #51+ were
  invisible. Extracted `leads-list.tsx` (client) with **Load more** using `nextCursor`.
- **`QUOTE_REQUESTED` was unreachable** — a tab no code populated. `advanceLeadStatus()` (forward-only) in
  `lead.ts` promotes NEW/IN_FOLLOWUP → QUOTE_REQUESTED on a `PRICE_DISCUSSION` follow-up; never regresses.
- **Lead editing** — leads were immutable after create. Added `updateLead` (RBAC-scoped, dedup-on-edit
  excluding self, audited, collapses not-found/no-access to avoid an existence leak), `updateLeadAction`,
  `PATCH /api/leads/[id]`, dual-mode `LeadForm`, `/leads/[id]/edit`, Edit button on detail. Core fields only
  (contacts/reference deferred to P1). E2E gotcha logged: `getByRole("textbox").first()` grabs the header
  search box — target form fields by placeholder.

### v8 — Leads P1 wave 1 (ownership + list-that-scales + urgency)

First world-class-core slice from `LEADS-MODULE-REPORT.md`. **Gate: `tsc` 0 · lint 0 · 58 unit ·
29 Playwright · `verify-leads-p1` (17) · browser-verified desktop+mobile, both roles.**

- **Ownership without a migration** — the repo keeps `assignedToId`/`createdById` as bare strings on
  *every* model (Receipt, PO, StockMovement…); adding a `User` relation to only Lead would break that
  convention. Instead `listCompanyUsers` + a `userNameMap` resolve owner names; `listLeads`/`getLead`
  attach `assignedToName` + derived `urgency`. `assignLead` (admin-only, same-company + active target,
  audited) reassigns; **reassigning transfers access** (verified). Owner shown per row + detail; admin
  assign dropdown (`assign-control.tsx`).
- **Filters (all URL-driven)** — `leads-filters.tsx`: debounced search + Source + (admin) Owner + "My
  leads". Compose with status tabs and survive "Load more" (query threaded through). `listLeads` already
  accepted these args; only the UI was missing.
- **Urgency + KPIs** — `leadUrgency()` (pure): Overdue Nd / Un-actioned Nd / No next-date. `leadStats()`
  powers 4 StatTiles (New / Due today / Going cold / Converted this month), RBAC-scoped.
- **Bug caught in-browser, not by tsc** — `LeadsList` seeds `useState` from `initialItems` once, so a
  soft-nav filter change left stale rows (filters only worked on full page load). Fixed with
  `key={query}` on the list so it remounts. The e2e asserts the row count actually drops. Lesson:
  **a green build is not a working filter — verify UI in the browser.**

### v9 — Leads P1 wave 2 (lifecycle + activity timeline + export-all)

**Gate: `tsc` 0 · lint 0 · 58 unit · 30 Playwright · `verify-leads-p2` (18) · browser-verified (clicked).**

- **Lifecycle** — `setLeadStatus` (reopen LOST/ON_HOLD→IN_FOLLOWUP, on-hold, mark-lost with required
  reason; CONVERTED terminal; admin+owner; audited) + `archiveLead` (soft-delete via `deletedAt`,
  admin-only). Detail `status-control.tsx` (Reopen / On hold / Mark-lost `Dialog` / Archive).
- **Unified activity timeline** — `leadActivity` merges follow-ups + interpreted audit rows (created/
  edited/reassigned/status/converted), newest-first (`activity-timeline.tsx`). Replaced the
  follow-ups-only list; the "Follow-up Timeline" heading is now "Activity" (updated the e2e that asserted
  the old heading — a rename can break existing tests).
- **Export-all** — `allLeadsForExport` (all matching leads, not the visible 50; +owner column; 5000 cap);
  the Excel button now respects the active filters. Bare empty cards → `EmptyState`; inline errors → `toast`.

### v10 — Leads P2 domain fields (structured sizing + scoring + pre-quote BOQ preview)

The wastewater-specific differentiator. **Gate: `tsc` 0 · lint 0 · 64 unit · 31 Playwright ·
`verify-leads-p3` (11) · browser-verified.** Migration `lead_plant_sizing`.

- **Structured sizing on `Lead`** (all nullable): `plantType/technology/capacityKLD/segment/budgetBand/
  decisionTimeline` + inlet `BOD/COD/TSS/TDS`. Free-text `requirement` demoted to a Notes field. Form
  cards in create + edit; sizing panel on detail. `convertToProposal` carries them into the proposal,
  **coalescing to STP/MBBR/0 for pre-P2 leads** (Proposal columns are non-nullable — tested with a
  NULL-sizing lead so conversion can't crash).
- **Pre-quote BOQ preview** — `boqPreview()` (lib/constants) scales the KLD-band template → indicative ₹
  range on the lead before conversion. **These template rates are the SELL/quote rate** (→ `BOQItem.rate`,
  employee-visible; NOT `estimatedCost`), so the indicative total is legitimately shown to all roles,
  computed server-side, labeled "estimate only." Do not confuse with the admin-only cost basis.
- **Lead scoring** — `lib/domain/lead-score.ts` pure/deterministic HOT/WARM/COLD (unit-tested); temperature
  badge on list + detail. Not pricing → visible to all.
- **Lost-reason picklist** (`LOST_REASONS`) in the Mark-lost dialog.
- **Gotchas logged:** after a Prisma migration, **restart the dev server** — the running Next process
  caches the old generated client (submit failed "Unknown argument plantType" until restart; fresh `tsx`
  scripts were unaffected). And `Label` isn't tied to inputs via `htmlFor` — `getByLabel` fails in tests
  (target by placeholder/position); wiring labels is a pending a11y task.

### v11 — Lead analytics (win-loss + pipeline value)

`/leads/analytics` (RBAC-scoped, sales-team + admin). `leadAnalytics()` aggregates the funnel, win rate,
**open pipeline ₹** (Σ `boqPreview().mid` for open leads — the same sell-side estimate as the detail),
why-we-lose (grouped by the structured lost-reason base, stripping the "— note" suffix), by-source +
by-segment conversion, and temperature mix. **Verified against raw DB counts** (`verify-leads-p4`, 11
checks: totals/won/lost/funnel-sum/winRate/temperature-sum/RBAC-scope). Gate: `tsc` 0 · lint 0 · 64 unit ·
32 Playwright. Browser catch: a ₹1.97 Cr pipeline value overflowed its StatTile → added a compact
crore/lakh formatter for KPI tiles.

### v12 — Lead communications (log + in-app send + two-way inbound)

Closed the leads' biggest gap (Communication 4.0 → ~7.5). Migration `lead_communications`.
**Gate: `tsc` 0 · lint 0 · 67 unit · 33 Playwright · `verify-leads-p5` (8) · browser-verified.**

- **`Communication` model** (channel/direction/body/sentStatus) — a record of a touch (vs. FollowUp which
  schedules the next action). `logCommunication` / `sendLeadWhatsApp` / `sendLeadEmail` in `lead.ts`.
- **In-app comm panel** (`[id]/comm-panel.tsx`): Log call / WhatsApp / Email. Send reuses the Phase-1
  `sendWhatsAppText` / `sendEmail`; **gated** — no provider → recorded `LOGGED (not sent)`, never crashes.
  Live delivery untested (no keys). Merged into the activity timeline (`kind: "comm"`).
- **Two-way inbound** — `/api/webhooks/whatsapp` (Meta hub verify + `x-hub-signature-256` HMAC) →
  `parseInboundWhatsApp` (pure, unit-tested) → `recordInboundWhatsApp` matches lead by last-10 digits →
  IN communication. Synthetic-payload tested (`received:1, recorded:1`); live receive needs a Meta number.
  Runbook in the route. Excluded from Clerk auth via the existing `/api/webhooks/*` matcher rule.
- **A11y**: `Field` now auto-wires `<label htmlFor>`↔input `id` (`useId`) so `getByLabel` works + screen
  readers announce. Used in the comm panel; older forms' broad retrofit still pending.

### v13 — Lead documents

`LeadDocument` model + migration `lead_documents`. Documents card on the detail (`[id]/documents-card.tsx`)
uses the shared `Uploader` → `/api/uploads` → `addLeadDocumentAction`; delete + RBAC + audit.
`getLead` includes `documents`. Verified: `verify-leads-p6` (6 checks) + browser file-upload e2e.
**Gate: `tsc` 0 · lint 0 · 67 unit · 34 Playwright.**

### v14 — Leads final polish (follow-up edit/delete · bulk + table · a11y)

Closes the last leads gaps. **Gate: `tsc` 0 · lint 0 · 67 unit · 34 Playwright · verify-leads-p7 (6) +
p8 (6) · browser-verified.**
- **Follow-up edit/delete** — `updateFollowUp`/`deleteFollowUp` (RBAC + audited); per-card controls
  (`[id]/follow-up-actions.tsx`). Editing a historical follow-up does NOT re-run status progression.
- **Bulk + table view** — `leads-list.tsx` gains a Cards/Table toggle; table has select-all + row checkboxes
  + a bulk bar. `bulkAssign` (admin) / `bulkSetStatus` apply per-lead through the single-lead services
  (RBAC + audit preserved; out-of-scope ids skipped, not a failed batch).
- **A11y** — `Field` (`components/ui/input.tsx`) auto-wires `<label htmlFor>`↔input `id` via `useId`;
  retrofitted the follow-up form + core lead form (tests now use `getByLabel`). Gotcha: two forms with a
  "Notes" label on one page collide under `getByLabel` — scope to `getByRole("dialog")`. Remaining legacy
  labels (address map-field, sizing selects) are functional; incremental cleanup.

### v15 — Lead detail declutter + timeline fix (UI polish)

The lead detail had grown overloaded as features stacked. **Gate: `tsc` 0 · lint 0 · 67 unit · 34 Playwright.**
- **Removed redundant actions** — the header's Call + WhatsApp icon buttons duplicated the comm panel's
  Log call / WhatsApp. Header is now just **Edit**; quick-dial moved to the phone number in Details
  (tap-to-dial `tel:` + a small WhatsApp icon).
- **Fixed a timeline clipping bug** — the activity timeline used `absolute -left-[27px]` icons that clipped
  leading text at the container edge ("Converted" → "nverted"). Rewrote as a two-column flex (icon-rail +
  content) — no negative margins, nothing clips (`[id]/activity-timeline.tsx`).
- **Temperature badge hidden on CONVERTED/LOST** leads (a score is meaningless once won/lost — matches the
  list behavior). Also dropped the raw lat/lng from the badges row.

### v16 — Proposals module upgrade (started) — P0: dead statuses + pagination + list UX

Same treatment as Leads, driven by `PROPOSALS-MODULE-REPORT.md` (gap analysis of the Proposals module).
**Gate: `tsc` 0 · lint 0 · 72 unit · 34 Playwright · `verify-proposals-p0` (12) · browser-verified.**
- **Two dead statuses fixed** (same class as the leads `QUOTE_REQUESTED` bug): `setProposalStatus`
  (`proposal.ts`, admin/audited) makes **UNDER_NEGOTIATION** reachable + **reopen from LOST**; **EXPIRED**
  is derived via `lib/domain/proposal-aging.ts` `proposalExpiry()` (pure, unit-tested) → "Expiring" worklist
  tab + per-row badges from `validityDays` (previously stored-but-never-surfaced).
- **Pagination** — `listProposals` returns `{items, nextCursor}` + `/api/proposals` GET + client "Load more"
  (`proposals-list.tsx`), replacing a silent 100-row cap.
- **List parity with Leads** — KPI StatTiles (`proposalStats()`), search (`proposals-search.tsx`),
  `EmptyState`, expiry badges. Editor gets Mark-under-negotiation / Back-to-sent / Reopen buttons.
**v16 P1-1 — version/activity timeline (shipped).** `proposalActivity()` merges created → each version
(v{n} + changeNote + **grand-total delta = the negotiation price trail**) → AI → approve&send → follow-ups
(loaded but never shown) → status → Won/Lost. `proposal-timeline.tsx` (v15 two-column rail) in a new
**Activity tab** (`Tabs` split = the report's #1 editor declutter). Verified: `verify-proposals-p1` (8) +
browser (v1 ₹1,18,000 → v2 ↑₹23,600 → ₹1,41,600 with change note). Gate: tsc 0 · lint 0 · 72 unit · 34 e2e.

**v16 P1-4 — proposal analytics (shipped).** `/proposals/analytics` + `proposalAnalytics()`: win rate
(count + **by value**), avg deal size, open pipeline ₹, **AI-vs-manual win rate**, avg quote→order cycle,
why-we-lose, by-plant-type — company-wide, sell-side only (role-agnostic). Verified `verify-proposals-p2`
(10 checks vs raw DB) + browser. Gate: lint 0 · 72 unit · 37 e2e.

**v16 P2 — documents + send-tracking (shipped).** `ProposalDocument` model + Documents tab
(`proposal-documents-card.tsx`). `sendProposalToClient(channel)` sends the proposal (durable PDF link) to
the lead's phone/email via the wired providers (gated → LOGGED), records a `Communication` **against the
proposal**, merged into the timeline. Migration made `Communication` **polymorphic** (`leadId?` +
`proposalId?`) — leads comms verified unaffected. Migration `proposal_docs_and_comms`. Verified
`verify-proposals-p3` (8) + `verify-leads-p5` still green + browser. Gate: lint 0 · 72 unit · 38 e2e.

**v16 P2-7/P2-8 — editor polish + hidden fields (shipped).** Basics retrofitted to auto-wiring `Field`
(getByLabel works); `msg` banner → `toast`; mark-lost → shared `Dialog` + `LOST_REASONS` picklist (feeds
why-we-lose). **Editable payment terms + validity** (the big one — they seed the order milestones on Win, were
AI-or-nothing): a milestone editor (desc/%/trigger + 100% check) + validity, saved with the BOQ under one
"Save proposal" button (2 saves, was 3). Verified `verify-proposals-p4` (5): custom 50/30/20 → 3 order
milestones summing to grand total. Gate: lint 0 · 72 unit · 38 e2e. Deferred (low value): DownloadPdfButton
swap, full basics-save consolidation, editable scope/technicalText.

**Proposals module: complete.** ~6.0 → ~9.0. P0 (dead statuses + pagination + list parity) · P1-1
(version/activity timeline + price trail + tab-split) · P1-4 (analytics) · P2 (documents + send-tracking +
editor polish + payment-terms editor). 5 verify scripts (43 checks) + 5 proposal e2e + browser-verified.
Report: `PROPOSALS-MODULE-REPORT.md`.

### v21 — Final three modules P0 + P1 (Invoices · Clients · Dashboard/Reports) — COMPLETE

**P1 (all three shipped).** Combined P1 gate: **tsc 0 · lint 0 · 72 unit · 66 Playwright · verify-invoices-p1(14) +
verify-clients-p1(8) + verify-dashboard-p1(8) · browser (GST report reconciles).**
- **Invoices P1 — real IGST + GST-filing report.** `Order.clientStateCode`/`clientGstin` (migration `order_client_gst`)
  drive place-of-supply → inter-state IGST / intra-state CGST-SGST (both verified); `GstControl` on the project
  Overview sets them; GSTIN prints on the invoice (PDF re-verified 200). ⚠️ Correct IGST is per-order but not default —
  an **unset** `clientStateCode` still defaults to intra-state (Won→Order seeding / warn-when-null deferred). `getGstSummary` (by rate, **nets negated credit notes**, reconciles
  taxable+GST==total) + `getCollectionSummary` (invoiced-net/collected/canonical-receivables) on `/reports` + Export GST.
  The 4 receivables definitions collapsed (getReceivables == orderStats == projectAnalytics = all non-PAID; invoiceStats
  deliberately distinct + relabeled "Invoiced outstanding").
- **Clients P1 — analytics.** `clientAnalytics` + `/clients/analytics`: phone-keyed dedup (unique/repeat customers, LTV,
  top-by-revenue) — the dedup the flat list doesn't do. *(List dedup + full 360 detail = smaller follow-up.)*
- **Dashboard P1 — new-module KPIs.** `getOpsKpis` **reuses** orderStats/amcAnalytics/materialsStats/erectionStats
  (verified equal → tiles match each module's page) → an across-the-business strip (Receivables · AMC run-rate · Stock
  value · Budget overruns), money admin-only.

### v21 — Final three modules P0 (Invoices · Clients · Dashboard/Reports)

Driven by `INVOICES-MODULE-REPORT.md`, `CLIENTS-MODULE-REPORT.md`, `DASHBOARD-REPORTS-MODULE-REPORT.md`. Combined
gate: **tsc 0 · lint 0 · 72 unit · 63 Playwright · verify-invoices-p0(17) + verify-clients-p0(11) + verify-dashboard-p0(13)
· sell+execute regression · credit-note PDF 200 · build clean · browser (admin + employee).**
- **Clients P0** — `listClients` → `{items,nextCursor}` + cursor + search + `/api/clients` GET + `ClientsList` "Load
  more"; `clientStats` tiles (clients · active projects · lifetime value ₹). Employee scoping + `getClient360`
  stripping preserved. (35 clients — uncapped list was real.) *Remaining P1: phone-keyed identity 360, analytics.*
- **Dashboard/Reports P0** — deleted dead `dashboard.ts` (zero callers, latent money bug); bounded the two unbounded
  dashboard scans (all-orders + whole-receipt-ledger) → 5 bounded queries (ACTIVE-only for health, take-4 recent/top,
  `receipt.aggregate` for total, 7-month window for series) with numbers verified unchanged + RBAC money-gate intact;
  added `reports/loading.tsx`. *Remaining P1: wire new-module KPIs (AMC/materials/erection), one receivables def, GST/
  collection reports.*

### v21 — Invoices module upgrade (started) — P0: credit-note money fixes + over-payment guard + list parity

Driven by `INVOICES-MODULE-REPORT.md` (Invoices was the lowest, ~2.5 — money-out-the-door with active bugs).
**Gate: tsc 0 · lint 0 · 72 unit · 62 Playwright · `verify-invoices-p0` (17) · sell+execute regression · credit-note
PDF 200 · browser (admin + employee gate).**
- **Credit-note cluster fixed** (`createCreditNote`) — fully negates total + `gstBreakup` (was copied positive) +
  line item (taxable-exclusive), links via `creditNoteOfId` FK (migration `invoice_credit_note_link`), tenant-scoped,
  audited, guards CN-of-CN **and over-reversal** (one CN per invoice — calling twice would book −2×). Reconciliation
  invariant (`lineItems + cgst+sgst+igst == total`, all ≤ 0) is the verify spine.
- **`addReceipt` over-payment guard** — rejects ≤ 0 or exceeding the milestone balance (fixed a latent test that
  over-paid an odd milestone by ₹1 via double round-up).
- **List parity** — `{items,nextCursor}` + `/api/invoices` GET + `invoiceStats` tiles (count/invoiced-net/outstanding/
  credit-notes) + search + Load-more. Tenant-scoped the milestone lookup (dedup guard preserved).
- **Remaining (report P1):** customer state/GSTIN + real IGST (schema + Won→Order); invoice analytics + GST-filing report.

### v20 — Erection module upgrade (COMPLETE: P0 → P2) — ~4.0 → ~8.7

**P2 — stripPricing net + Excel export (shipped).** Added a `stripPricing(…, ctx.role)` defense-in-depth net on
`budgetVsActual`/`closeoutData` (were `requireAdmin`-only): no-op for the admin caller (full object; closeout PDF
still 200), but drops ADMIN_ONLY keys (budget/committed/grossMargin) if a future non-admin caller reaches the return
— verified the net's effect + that requireAdmin still hard-blocks (belt AND suspenders). Excel export of entries +
budget-vs-actual on the main page. Verified `verify-erection-p2` (11) + control-flow regression + closeout PDF.
Gate: tsc 0 · lint 0 · 72 unit · 61 e2e. *(Full main-page tab-split deferred.)*

### v20 — Erection module upgrade (started) — P0 · P1 · P1-4: pagination · timeline · QUERIED-fix · a11y · analytics

**P1-4 — analytics (shipped).** `/erection/analytics` + `erectionAnalytics()`: Entries · total spend ₹ · approval
rate · overrun projects; spend-by-type (labour/site-purchase/other/consumption) · entries-by-status · budget burn
(active projects by pctConsumed, overruns flagged) — the aggregated-once version of the main-page N-order
budgetVsActual fan-out. Admin-only (all cost aggregates; employee 404s + service throws). `overrunCount` verified ==
`erectionStats.overrunProjects`. Consumption in the spend total is summed company-wide (matches company-wide
labour/purchase; budget-burn stays active+budgeted). Verified `verify-erection-p1-4` (12 vs raw DB) + browser.
Gate: tsc 0 · lint 0 · 72 unit · 61 e2e.

### v20 — Erection module upgrade (started) — P0 + P1: pagination · audit · timeline · QUERIED-fix · a11y

**P1 — approval timeline + per-project detail + QUERIED fix + a11y (shipped).** `erectionActivity()` merges
entry-logged → reviewed (approved/queried/rejected) → overrun acks (newest-first, `requireProjectAccess`), rendered
on a new `/erection/[id]` per-project detail page (BvA + entries + timeline; main-page BvA cards link to it).
`erectionActivity` + the detail page are **admin-only** (cross-author cost view — surfaces teammates' amounts; an
assigned employee is 404'd + the service throws), coherent with the creator-scoped entries card. QUERIED
dead-end resolved — review queue uses `needsReview` (PENDING+QUERIED) + `VerificationCard` shows actions for QUERIED,
so a queried entry can be resolved. A11y: `erection-widgets.tsx` raw inputs → `Field`, icon buttons got aria-labels,
inline errors → `toast` + success. Verified `verify-erection-p1` (11) + browser. Gate: tsc 0 · lint 0 · 72 unit · 58 e2e.
*(Full main-page tab-split deferred — per-project detail delivered the drill-in.)*

### v20 — Erection module upgrade (started) — P0: pagination + list parity + audit + terminal-state guard

Driven by `ERECTION-MODULE-REPORT.md` (Erection was the least-upgraded module, ~4.0). **Gate: tsc 0 · lint 0 ·
72 unit · 57 Playwright · `verify-erection-p0` (21) · control-flow regression · browser (admin + employee).**
- **Uncapped list + fan-out → bounded** — `listEntries` was an unbounded findMany (bare array, called twice/page)
  + the page fanned out `budgetVsActual` over every active order. Now `{items,nextCursor}` + cursor + search +
  type/status filter + `/api/erection` GET + `entry-list.tsx` "Load more"; BvA fan-out capped (`BVA_LIMIT=10`, "showing
  N of M"). `erectionStats` for the KPI tiles (pending/queried-rejected/approved-spend₹ admin/overrun-projects admin).
- **acknowledgeOverrun audited + transactional** (was an unaudited read-then-update).
- **reviewEntry terminal-state guard** — APPROVED/REJECTED entries can't be silently re-reviewed (QUERIED still can).
- **Coherence fix** — the overrun-projects KPI now uses the same definition as the BvA cards (approved erection +
  consumption + committed ≥ budget), verified tile==cards. RBAC held (approved-spend/overrun null for employee,
  verification + BvA admin-gated, employees creator-scoped, `amount` stays visible to its author — not a leak).
- **Remaining (report P1/P1-4/P2):** approval-activity timeline + tab-split + per-project detail + a11y/`toast`
  retrofit; `/erection/analytics`; `stripPricing` net + Excel export.

### v19 — Materials/Inventory module upgrade (P0 → P2; PO/vendor detail deferred) — ~4.5 → ~8.5

**P2 — dead-automation + over-issue guard (shipped).** Low-stock cron digest (`lowStockItems` was dead code →
now runs in `job=lowstock`, gated). GRN sequential number (`grnNo`, migration `grn_number` + `GEC-GRN` prefix,
allocated race-free in the receive tx, audited). PO Excel export. **Over-issue guard** — `transferStock`/
`consumeStock` reject issuing more than the source location holds (`onHandAt`) → no negative balances (control-flow
regression still green). Deferred: the materialized stock-balance snapshot (per-load full scan is fine at volume —
documented) + PO/vendor detail + admin tab-split. Verified `verify-materials-p2` (10) + cron smoke + browser.
Gate: tsc 0 · lint 0 · 72 unit · 55 e2e.

### v19 — Materials/Inventory module upgrade (started) — P0 · P1 · P1-4: pagination · ledger · a11y · analytics

**P1-4 — analytics (shipped).** `/materials/analytics` + `materialsAnalytics()`: Items · Low stock · stock value ₹
(admin) · issued-to-sites ₹ (consumption, admin); stock-value-by-category (admin) · open-PO aging (≤7/8–30/>30d)
· top vendor spend (admin) · ledger activity (movement counts). Every ₹ surface admin-only (null/[] for EMPLOYEE,
verified no leak). Verified `verify-materials-p1-4` (20 vs raw DB, incl. PO-aging fixtures at 3d/15d/45d) + browser.
Gate: tsc 0 · lint 0 · 72 unit · 55 e2e.

### v19 — Materials/Inventory module upgrade (started) — P0 + P1: pagination · dead statuses · audit · ledger · a11y

**P1 — stock-movement ledger + item detail + a11y retrofit (shipped).** `itemLedger()` surfaces the append-only
`StockMovement` ledger (was read only to derive balances) — newest-first with a **running on-hand total**,
from→to locations, `valueAtCost` (admin) — on a new `materials/[id]` item detail page (item names in the stock
list link to it) with on-hand-by-location + vendor-price history (admin). RBAC: valueAtCost/vendorPrices/
purchasePrice stripped for EMPLOYEE (employee still sees the ledger, no money — verified). Ledger ordered
`[createdAt asc, id asc]` — the id tiebreak makes the running balance deterministic across a transfer's paired
OUT+IN rows (same-transaction createdAt), no phantom intermediate balance (regression-guarded). A11y:
`materials-admin.tsx` raw inputs → `Field`, `msg` banner → `toast`, buttons gained `loading`. Verified
`verify-materials-p1` (18) + browser (admin + employee). Gate: tsc 0 · lint 0 · 72 unit · 53 e2e. *(PO/vendor
detail + admin tab-split deferred.)*

### v19 — Materials/Inventory module upgrade (started) — P0: pagination + list parity + dead statuses + audit

Driven by `MATERIALS-MODULE-REPORT.md` (Materials was the least-upgraded module, ~4.5). **Gate: tsc 0 · lint 0 ·
72 unit · 51 Playwright · `verify-materials-p0` (20, incl. RBAC no-leak) · control-flow regression · browser
(admin + employee).**
- **Uncapped lists → paginated** — `listItems` was an unbounded findMany that pulled the ENTIRE StockMovement
  ledger into memory every request; now `{items,nextCursor}` + cursor + search + category filter, deriving
  balances **only for the page's items** (scoped scan) + `/api/materials` GET + `stock-list.tsx` "Load more".
  `materialsStats` does the one bounded ledger pass for the KPI tiles (items/low-stock/open-POs/stock-value₹).
  Added `itemOptions` (dropdowns) + `materialCategories` (tabs).
- **Dead `MaterialRequest` statuses** — `setRequestStatus` (admin, audited) makes TRANSFERRED/CONVERTED_PO/
  REJECTED reachable (only PENDING was ever written) + request controls in `materials-tools.tsx`.
- **List parity** — KPI tiles + category tabs + `MaterialsSearch` + `EmptyState` + `loading.tsx`.
- **Audited the 6 unaudited mutations** (createVendor/setPOStatus/transferStock/consumeStock/
  createMaterialRequest/stockAudit). **RBAC held** — purchasePrice/stockValue stripped for EMPLOYEE, verified.
- **Kept safe:** immutable ledger (no update/delete), correct balance derivation (control-flow regression green).
- **Remaining (report P1/P1-4/P2):** stock-movement ledger view + item/PO detail + tab-split + a11y retrofit of
  `materials-admin.tsx`; `/materials/analytics`; low-stock cron + GRN numbering + export-everywhere.

### v18 — Service/AMC module upgrade (COMPLETE: P0 → P2) — ~5.5 → ~9.0

**P2 — renewal + cron notifications + export + a11y (shipped).** `renewContract` (admin, audited) mints the
next-term contract from an expiring/expired one (copies scope/frequency/value, term chained to old endDate,
next visit cycle generated) + links the **renewal chain** (`renewedFromId` self-relation, migration
`amc_renewal_chain`) → lights up the **true renewal rate** in analytics (`renewalRatePct` = renewed ÷ lapsed,
replacing the P1-4 pipeline stand-in). Renew control on the detail (EXPIRED or ≤90d). AMC cron now resolves the
client phone + sends visit-due/expiry WhatsApp reminders on **exact day thresholds** (due-day; 30/7/1d — fires
once, not daily-in-window, mirroring the payment `due_in_0d` idempotency); gated (no-op until a token is set —
live delivery untested). Excel `ExportButton` on the list (RBAC-safe); visit Notes → `Field` (last a11y gap).
Verified `verify-service-p2` (12) + cron amc smoke + browser. Gate: tsc 0 · lint 0 · 72 unit · 49 e2e.


**P1-4 — analytics (shipped).** `/service/analytics` + `amcAnalytics()`: active + expiring-≤90d pipeline ·
recurring-revenue run-rate ₹ (Σ active annualValue, admin-only) · visit-compliance % (done ÷ terminal, derived)
· SLA-breach % (`isSlaBreached` finally wired) · status funnel + by-frequency. Company-wide; revenue null for
EMPLOYEE. Verified `verify-service-p1-4` (12 vs raw DB) + browser. Gate: tsc 0 · lint 0 · 72 unit · 49 e2e.
(True renewal rate deferred to P2 — needs renewal linkage.)


**P1 — activity timeline + tab-split + comms (shipped).** `amcActivity()` merges created → visits (readings) →
tickets (raised/resolved + SLA) → AMC invoices → status changes → comms (newest-first, `amc-timeline.tsx` in an
Activity tab). Detail tab-split into Overview/Schedule/Tickets/Activity (`tab-panels.tsx`). `Communication`
extended with `contractId?` (migration `amc_communications`) + `logContractComm`/`sendContractWhatsApp`/
`sendContractEmail` (contact via contract→order→proposal→lead; bare contracts log but can't send). Verified
`verify-service-p1` (16, incl. employee getContract stripping) + browser (admin + employee). AMC-invoice
events carry the joined ₹ total (money-in trail). Gate: tsc 0 · lint 0 · 72 unit · 48 e2e.


Same treatment as Leads/Proposals/Projects, driven by `SERVICE-MODULE-REPORT.md`. **Gate: `tsc` 0 · lint 0 ·
72 unit · 46 Playwright · `verify-service-p0` (18 vs raw DB) · browser-verified (admin + employee).**
- **Uncapped lists → paginated** — `listContracts`/`listTickets` were unbounded/cursorless; now `{items,
  nextCursor}` + cursor + search + status filter + `/api/service` GET (`kind=contracts|tickets`) +
  `contracts-list.tsx`/`tickets-list.tsx` "Load more".
- **Status state machine (was inert)** — the module *derived* EXPIRED/DUE/MISSED at read time but never
  persisted them, and the AMC cron was report-only. Added `setContractStatus` (admin, audited: cancel/
  reactivate) + `transitionAmcStatuses` (the cron now persists ACTIVE→EXPIRED past endDate, UPCOMING→DUE/MISSED
  past scheduledDate±grace). `contractWhere` reconciles persisted status with derived expiry so filtering is
  correct between cron runs. Detail shows `liveStatus` + a status control.
- **List parity** — clickable KPI tiles, status tabs (All/Active/Expiring/Expired/Cancelled), `ServiceSearch`,
  service-tuned `loading.tsx`; fixed `TicketRow.advance` (try/catch — a failed advance no longer toasts success).
- **Remaining (report P1/P2):** contract activity timeline + tab-split detail + comms (extend `Communication`
  with contractId/ticketId) + `/service/analytics` (renewal/SLA/compliance/run-rate) + renewal & recurring-visit
  generation + cron notifications + Excel export.

### v17 — Projects/Orders module upgrade (COMPLETE: P0 → P2) — ~5.5 → ~9.0

Same treatment as Leads/Proposals, driven by `PROJECTS-MODULE-REPORT.md`. **Gate: `tsc` 0 · lint 0 · 72 unit
· 38 Playwright · `verify-projects-p0` (12) · browser-verified.**
- **Uncapped list → paginated** — `listOrders` was an unbounded `findMany` (every order every request);
  now `{items, nextCursor}` + cursor + search + status filter + `/api/projects` GET + `projects-list.tsx`
  "Load more". Fixed the 3 other callers (materials/erection/service `.items`). Row `overdue` computed
  server-side (avoids `Date.now()` in render / the `react-hooks/purity` lint error).
- **Dead OrderStatus fixed** — `setOrderStatus` (admin/audited) makes ON_HOLD/COMPLETED/CANCELLED reachable +
  reopen; `status-control.tsx` on the detail; 4-state badge (was hardcoded 2-value). Same class as the
  leads/proposals dead-status bugs.
- **List parity** — KPI StatTiles (`orderStats()`: Active/On-hold/Payments-overdue/**Receivables ₹**),
  search (`projects-search.tsx`), status tabs, `EmptyState`.
**v17 P1 — timeline + tab-split + documents (shipped).** `orderActivity()` merges created → completed stages
(delay reasons) → drawing revisions → **payments received (₹ money-in trail)** → status changes
(`project-timeline.tsx`, v15 rail) in an **Activity tab**. Detail tab-split (Overview / Stages / Payments /
Drawings & Docs / Activity) via `TabPanels` (server content → client tab switcher). Documents card renders
the generic `Document` model that `getOrder` already fetched but the UI discarded (`addOrderDocument`/
`deleteOrderDocument`, RBAC + audit). Verified `verify-projects-p1` (10) + browser. Gate: tsc 0 · lint 0 ·
72 unit · 40 e2e.

**v17 P1-4 — project analytics (shipped).** `/projects/analytics` + `projectAnalytics()`: active/completed ·
**value in execution ₹** · avg progress · **on-time stages %** (from delay reasons); status funnel +
receivables panel (outstanding/overdue/overdue-milestones/stages-completed). Company-wide, sell-side
(role-agnostic). Verified `verify-projects-p2` (8 checks vs raw DB) + browser. Gate: lint 0 · 72 unit · 41 e2e.

**v17 P2 — comms + a11y + wire the dead data (shipped).** `Communication` made **tri-polymorphic**
(`project_comms_and_archive` migration: `orderId?` + relation + index). `logProjectComm`/`sendProjectWhatsApp`/
`sendProjectEmail` resolve the client via **order → proposal → lead**, gate the send, audit, and merge into
`orderActivity` as a `comm` event (comm-panel on the Activity tab). **Archive/soft-delete**: `Order.deletedAt`
+ `archiveOrder` (admin) + `deletedAt: null` filter across list/stats/analytics/getOrder/activity + confirm-
dialog `ArchiveButton`. **Wired dead data**: start/target dates surfaced (Overview Schedule card); stage
`plannedDate` settable (arms the delay-reason gate); milestone `dueDate`+`linkedStageId` settable via
`setMilestoneSchedule` (admin, audited, recompute — turns on the DATE receivables + STAGE_COMPLETION triggers);
team un-assign (`removeTeam`); `setDrawingApproval`/`assignTeam` now audited. **A11y**: milestone receipt inputs
→ `Field`, placeholder-only controls given `aria-label`s. Verified `verify-projects-p3` (19) + browser (admin
**and** employee context). **Projects module ~5.5 → ~9.0.** Gate: tsc 0 · lint 0 · 72 unit · **43 Playwright**.

### Verification scripts
`npx tsx scripts/verify-sell.ts` · `verify-execute.ts` · `verify-control.ts` · `verify-amc.ts` ·
`verify-pdf.ts` · `verify-leads-p0.ts` … `verify-leads-p8.ts` · `verify-proposals-p0.ts` …
`verify-proposals-p4.ts` · `verify-projects-p0.ts` … `verify-projects-p3.ts` · `verify-service-p0.ts` · `verify-service-p1.ts` · `verify-service-p1-4.ts` · `verify-service-p2.ts` · `verify-materials-p0.ts` · `verify-materials-p1.ts` · `verify-materials-p1-4.ts` · `verify-materials-p2.ts` · `verify-erection-p0.ts` · `verify-erection-p1.ts` · `verify-erection-p1-4.ts` · `verify-erection-p2.ts` · `verify-invoices-p0.ts` · `verify-invoices-p1.ts` · `verify-clients-p0.ts` · `verify-clients-p1.ts` · `verify-dashboard-p0.ts` · `verify-dashboard-p1.ts` — exercise each area end-to-end against the live DB.
