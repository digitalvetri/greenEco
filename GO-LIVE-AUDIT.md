# Green Ecocare CRM — Pre-Deployment Audit (go/no-go)

**Date:** 2026-07-14 · **Method:** 12-lens parallel audit → adversarial verification (each finding a second
agent tried to refute) → completeness sweep. Every finding below survived that verification, and I
independently re-confirmed the 7 blockers myself against the code and the live DB.

Totals after verification: **8 BLOCKER · 12 HIGH · 23 MEDIUM · 40 LOW** (13 findings were refuted or downgraded).

---

---

## ✅ FIXES APPLIED (2026-07-14, after the audit)

Code-level blockers and safe HIGH items are now fixed and verified. **Gate: tsc 0 · lint 0 errors · 75 unit
(+3 GST) · 70 e2e · verify-invoices-p0/p1 + sell/execute/amc + materials green.** What's left for you is the
**configuration** in the checklist below (secrets, S3, cron scheduler) — the code no longer lets those fail silently.

| # | Blocker | Status | What changed |
|---|---|---|---|
| B1 | GST double-taxation | ✅ **FIXED** | New `computeGstInclusive()` backs GST out of the GST-inclusive milestone amount; both invoice paths use it. Verified live: invoice total now == milestone receivable, Σ invoices == grandTotal (GST charged once). +3 unit tests. |
| B2 | Forgeable session (`SESSION_SECRET`) | ✅ **FIXED** | `env.ts` refuses to boot at **runtime** in production with the default/short secret (verified: throws under `NODE_ENV=production` / `AUTH_DEV_BYPASS=0`; **skipped during `next build`** so CI/build don't need the secret — verified the prod build still succeeds). **You still must set a real value before `next start`.** |
| B3 | `AUTH_DEV_BYPASS` default | ✅ **HARDENED** | Setting `AUTH_DEV_BYPASS=0` now also triggers secret enforcement, so the prod signal can't be half-set. **Set `AUTH_DEV_BYPASS=0` + `NODE_ENV=production`.** |
| B4 | Forgeable print token | ✅ **FIXED** | Same enforcement as B2 for `PRINT_TOKEN_SECRET`. **Set a real value.** |
| B5 | Ephemeral storage | ⚙️ **CONFIG** | Cannot fix without your bucket — set `STORAGE_DRIVER=s3` + `S3_*` (env already validates them). |
| B6 | Public `/api/cron` | ✅ **FIXED** | Route now **fails closed** in production when `CRON_KEY` is unset (was fail-open). Dev stays open. **Set `CRON_KEY`.** |
| B7 | Published admin password | ✅ **FIXED** | Seed reads `SEED_ADMIN_PASSWORD`/`SEED_EMPLOYEE_PASSWORD` (required in prod, refuses the default), and re-seeding no longer resets a rotated password. **Still change it after first login.** |

**HIGH also fixed:** dry-run isolation (legacy cron jobs no longer send/write under `?dryRun=1`); new Won orders now
capture `clientPhone` (payment reminders A4 will fire); WhatsApp inbound webhook fails closed in prod when
`WHATSAPP_APP_SECRET` is unset; mobile CTA clipping on `/leads`, `/service`, `/erection`, `/reports` fixed (stacks below the title at ≤sm).

**Deliberately NOT changed before launch (documented, lower risk):** 40px touch targets (an app-wide 44px bump ripples
across 30 pages + the spacing grid — wants its own visual-verify pass); AMC legacy-reminder idempotency (double-*send*
only, and WhatsApp is off day-one so no blast radius); PDF Chromium provisioning + `ERROR_WEBHOOK_URL` + place-of-supply
capture (config/deploy-step — see below). Full MEDIUM/LOW list unchanged.

---

## VERDICT (original): 🔴 NO-GO as-is — now ⚙️ GO once the checklist config is set (code blockers fixed).

**Do not deploy on the current `.env`.** Two independent problems each make it unsafe: (1) a **GST double-taxation
bug over-charges every customer tax invoice by 18%** — a compliance and money problem, not a crash; and (2) the app
**boots silently insecure in `AUTH_MODE=dev`** — admin sessions and invoice PDFs are forgeable, `/api/cron` is
public, and the seeded admin password is printed in the repo. The good news: the codebase's *core* is sound —
RBAC field-stripping, money primitives, immutable ledgers, transactions, tenant scoping all verified solid. The
blockers are almost all **configuration + one calculation fix**. Fix the 7 below and it's a **GO**.

---

## 🔴 BLOCKERS — must fix before deploy (ordered by what hurts first)

### B1 — GST is charged twice on every milestone invoice (customers over-billed 18%)
- **Where:** `src/server/services/proposal.ts:490,529-538` (markWon) → `src/server/services/invoice.ts:38-43` (createInvoiceFromMilestone).
- **Proven with your live data (invoice GEC-INV-2026-035):** proposal subtotal ₹20,46,875 + 18% GST = grandTotal
  **₹24,15,312.50** (ratio exactly 1.1800 → grandTotal already includes GST). The 30% milestone seeds its amount as
  30% of that *GST-inclusive* total = ₹7,24,593.75, and the invoice then treats **that** as the taxable base and adds
  18% GST again → customer billed **₹8,55,020.63**. Correct is **₹7,24,593.75**. Over-charge: **₹1,30,426.88** on one milestone.
- **Impact:** Every tax invoice you send is legally wrong and over-bills the customer by 18%. Worst possible bug to ship for a company issuing GST invoices.
- **Fix:** Seed milestone `amount` from the **GST-exclusive** `version.subtotal`, not `version.grandTotal`
  (`markWon`), so the invoice's `+18%` lands on a pre-tax base. Then re-verify: milestone amounts should sum to
  `subtotal`, and invoice totals should sum to `grandTotal`. Add a unit test asserting `Σ invoice.total == grandTotal`.

### B2 — Forgeable ADMIN session: `SESSION_SECRET` default is not enforced in `AUTH_MODE=dev`
- **Where:** `src/lib/env.ts:82` (`SESSION_SECRET` defaults to the public string `"dev-insecure-session-secret"`); the
  `superRefine` at `:88-105` only enforces it when `AUTH_MODE=clerk`. This deploy is `AUTH_MODE=dev`.
- **Impact:** The session cookie is HMAC-signed with a **publicly-known** key, so anyone can forge an `ADMIN` session cookie → full takeover. `session.ts:16` signs with this value.
- **Fix:** Set `SESSION_SECRET` to 32+ random chars (`openssl rand -base64 48`) **and** make `env.ts` reject the
  default/short value in `AUTH_MODE=dev` too (move the check out of the `clerk`-only branch).

### B3 — Anonymous admin via `dev_role` cookie unless `NODE_ENV` is exactly `production`
- **Where:** `src/lib/env.ts:175` — `authDevBypass = e.AUTH_DEV_BYPASS ? … : process.env.NODE_ENV !== "production"`.
- **Impact:** If `NODE_ENV` is unset/`development`/anything but `production`, an anonymous request setting a
  `dev_role=ADMIN` cookie is served as admin (`auth.ts` getDevSession step 2). One curl = full admin.
- **Fix:** Set `AUTH_DEV_BYPASS=0` explicitly in the production env (don't rely on `NODE_ENV`), and ensure `NODE_ENV=production`.

### B4 — Forgeable print token → anonymous invoice/proposal PDF leak
- **Where:** `src/lib/env.ts:81` (`PRINT_TOKEN_SECRET` defaults to `"dev-insecure-print-secret"`); enforced only under
  `AUTH_MODE=clerk` (`:97-105`). `print-token.ts:41` signs with it.
- **Impact:** `/print/invoice/[…]`, `/print/proposal`, `/print/closeout` accept an HMAC token as auth. With the public
  default key, anyone can mint a token and pull any customer's priced invoice/closeout PDF — the exact pricing leak the token was designed to prevent.
- **Fix:** Set `PRINT_TOKEN_SECRET` to 32+ random chars and enforce it in `AUTH_MODE=dev` too (same fix shape as B2).

### B5 — Uploaded files and generated PDFs are ephemeral (`STORAGE_DRIVER` unset → local disk)
- **Where:** `src/lib/env.ts:21` (`STORAGE_DRIVER` defaults to `"local"`); not set in `.env`. `storage.ts` writes to `public/`.
- **Impact:** Bill photos, lead documents, and every generated invoice/proposal PDF are written to local disk →
  **lost on every redeploy**, and on a read-only/serverless filesystem the write **fails outright** (500s). GO-LIVE.md already says "local disk is lost on redeploy."
- **Fix:** Set `STORAGE_DRIVER=s3` + `S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY/S3_BUCKET` (+ `S3_PUBLIC_URL`). Any S3/R2 bucket works; `env.ts` already validates all four are present when driver=s3.

### B6 — `/api/cron` is publicly callable (no `CRON_KEY`)
- **Where:** `src/app/api/cron/route.ts:34-36` — `if (cronKey && key !== cronKey) return 401`; the guard is skipped
  entirely when `cronKey` is empty. `env.ts:49` defaults `CRON_KEY` to `""`.
- **Proven live:** `GET /api/cron?job=all → 200` with no auth header.
- **Impact:** Anyone on the internet can trigger all automations (payment reminders, AMC billing, WhatsApp sends). Two problems in one: unauthenticated, **and** it never runs unless you wire an external scheduler.
- **Fix:** Set `CRON_KEY` (random 32+ chars) and schedule the host cron to call `/api/cron?job=all` with header `x-cron-key: $CRON_KEY`. (Also fix the fail-open: reject when `cronKey` is unset — see H-list.)

### B7 — Seeded admin password is published in the repo, with no forced rotation
- **Where:** `prisma/seed.ts:33` (`hashPassword("Admin@123")`, `upsert`); the credential is printed in `AGENTS.md`,
  `CLAUDE.md`, and `GO-LIVE.md`.
- **Impact:** Even with a *perfect* secret config, the app ships with `admin@greeneco.in / Admin@123` — a public
  password → instant admin takeover. Re-running the seed **resets** the password back to it.
- **Fix:** Change the admin password immediately after first login (Settings → Profile → Password), and don't
  re-run `db:seed` against prod. Ideally seed from an env var and delete the printed credential from the docs.

---

## ✅ Pre-deploy checklist (copy-paste, tomorrow morning)

```bash
# 1. Generate strong secrets
openssl rand -base64 48   # → SESSION_SECRET
openssl rand -base64 48   # → PRINT_TOKEN_SECRET
openssl rand -base64 32   # → CRON_KEY

# 2. Production .env MUST set (in addition to DATABASE_URL, COMPANY_* etc. already present):
#   SESSION_SECRET=<48-char>            # B2
#   PRINT_TOKEN_SECRET=<48-char>        # B4
#   CRON_KEY=<32-char>                  # B6
#   AUTH_DEV_BYPASS=0                   # B3   (explicit, don't trust NODE_ENV)
#   NODE_ENV=production                 # B3
#   STORAGE_DRIVER=s3                   # B5
#   S3_ENDPOINT=…  S3_ACCESS_KEY=…  S3_SECRET_KEY=…  S3_BUCKET=…  S3_PUBLIC_URL=…
#   NEXT_PUBLIC_APP_URL=https://<your-domain>

# 3. Fix B1 (GST) in code — seed milestones from subtotal, not grandTotal — then:
npm test && npx tsc --noEmit && npx next build

# 4. Migrate + seed the production DB (once)
#   Seed now REQUIRES a real admin password in production (refuses the public default):
export SEED_ADMIN_PASSWORD='<a-strong-password>'
export SEED_EMPLOYEE_PASSWORD='<another-strong-password>'
npx prisma migrate deploy
npm run db:seed          # creates Company + admin/employee (uses the passwords above)

# 4b. PDF rendering needs a Chromium binary (playwright-core does NOT bundle one) — install it
#     on the host/image or invoice & proposal PDFs will 500:
npx playwright install chromium

# 5. Boot  (env.ts now FAILS FAST if SESSION_SECRET/PRINT_TOKEN_SECRET are the defaults in prod)
npx next start

# 6. FIRST login → immediately change the admin password (B7). Then verify:
#    - a NEW proposal → Won → milestone invoice: total must equal the pre-tax milestone + 18% ONCE
#    - curl https://<domain>/api/cron?job=all  → 401 without the key (B6 fixed)
#    - PDFs land in the S3 bucket, not local disk (B5 fixed)

# 7. Wire the host scheduler to hit /api/cron?job=all daily with the x-cron-key header
```

**Also decide before launch:** the ~13 leftover `Verify Cement` test rows + orders/invoices are in the DB. If you
seed a *fresh* prod DB you avoid them; if you deploy against this same DB, clean them first (you chose to leave them earlier).

---

## 🟠 HIGH — will cause an incident soon after launch

- **Cron auth fails open** — even after setting `CRON_KEY`, the `if (cronKey && …)` shape means an accidental unset re-opens it. Change to reject when unset. `cron/route.ts:34`.
- **Dry-run is NOT isolated for legacy inline cron jobs** — `?dryRun=1` actually sends WhatsApp and writes the DB for the `amc`/`whatsapp`/`lowstock`/`purgeAudio` branches. `cron/route.ts:78-131`. Don't trust dry-run until fixed.
- **Legacy AMC visit/expiry WhatsApp reminders have no idempotency + no kill switch** — re-send on every cron run. `cron/route.ts:96-111`.
- **New Won orders never capture `clientPhone`** → payment-reminder automation (A4) permanently skips them even after WhatsApp is on. `proposal.ts:496` → `payment-reminders.ts:49`.
- **Unset place-of-supply silently defaults to intra-state CGST/SGST** → wrong tax *type* (should be IGST) on inter-state B2B invoices. Set `order.clientStateCode` on every order. `gst.ts:37-41`.
- **PDF needs a Chromium binary that isn't provisioned** — `playwright-core` (a dependency) calls `chromium.launch()` but nothing installs the browser at build. PDFs will 500 in prod until you add `npx playwright install chromium` (or a Docker base image with Chromium). `src/lib/pdf.ts:31`.
- **WhatsApp inbound webhook fails open when `WHATSAPP_APP_SECRET` is unset** — accepts spoofed inbound messages. `webhooks/whatsapp/route.ts:32`.
- **Zero live-execution coverage** for WhatsApp/email/AI/S3/PDF-in-prod — all activate for the first time in production, and failures are logged but never alerted. Set `ERROR_WEBHOOK_URL`.
- **Mobile CTA clipped at 390px** on `/leads` and `/service` (New-lead/New-AMC button off-screen). `stat.tsx:76` PageHeader action wrapping.
- **Touch targets 40px (some 32–36px)** app-wide vs the 44px non-negotiable — `button.tsx`, `input.tsx`. Field-staff usability.

## 🟡 MEDIUM — fix soon, survivable at launch

- **Order soft-delete (`deletedAt`) not filtered** in global search, dashboard KPIs, and erection analytics — archived projects reappear and still count money. `search.ts:35`, `dashboard-rich.ts`, `erection.ts:147`.
- **AMC recurring invoicing has no per-period idempotency** → double-billing the same AMC period. `amc.ts:542`.
- **markWon trusts `paymentTerms` blindly** → can create an order with zero (uncollectable) milestones or milestones that don't reconcile to project value; no validation. `proposal.ts:492`.
- **markWon seeds milestones with no `dueDate`/`linkedStageId`** → receivables automation does nothing until an admin manually sets them, with no UI cue.
- **Latent cross-tenant writes** — several admin mutations read caller-supplied ids without a `companyId` filter (same class as the createMaterialRequest bug already fixed): `receiveGRN`, `setDrawingApproval`, `removeTeam`, `setMilestoneSchedule`, `updateStage`, `createErectionEntry`. Admin-only so lower risk, but should be scoped.
- **Credit-note over-reversal guard is TOCTOU** (no unique constraint on `creditNoteOfId`); **receipt over-payment guard** reads balance outside the txn. Add a unique index + move checks inside the transaction. `invoice.ts:225`, `order.ts:658`.
- **Stored-XSS via upload** — MIME allowlist bypassable with a spoofed type + preserved extension, served same-origin without `nosniff`. Add `X-Content-Type-Options: nosniff` + validate real content. `storage.ts:37`, `middleware.ts:76`.
- **`deliver()` has no overlap lock** — overlapping cron runs can double-send. `deliver.ts:40`.
- **StockMovement ledger fully scanned on every `/materials` and `/dashboard` load**, and the table has **no `companyId` index** (sequential scan). Fine now (46 rows); add the index + a materialized balance before volume grows. `materials.ts:198`, `schema.prisma:596`.
- **Config-store secrets are encrypted with a key derived from `SESSION_SECRET`** — so rotating `SESSION_SECRET` (the B2 fix) silently wipes every integration key pasted into Settings. Set integration keys via `.env` OR set `SESSION_SECRET` *first*, then paste keys. `secrets-crypto.ts:15`.
- **`/api/erection` POST accepts unvalidated JSON** (no Zod). `erection/route.ts:5`.
- **Due-date thresholds bucket by server-local midnight, not IST** — off-by-one on a UTC server. `automations/util.ts:11`.
- **PWA manifest icons 404** (`icon-192`/`icon-512` don't exist) — installable PWA has no icon. `manifest.ts:13`.

## ⚪ LOW (40 found) — polish, not launch-critical
Inconsistent date format on invoices (d/m/yyyy vs "14 Jul 2026"); EMPLOYEE sees a Receivables ₹ tile on Projects
(contradicts the admin-only rule, but it's a sell-side aggregate not a cost leak); follow-up creation / proposal
search not owner-scoped within the tenant; numbering never load-tested for concurrent allocation; `getClient360`
doesn't filter `deletedAt`; and the previously-reported items (negative Air-Blower balance, over-issue TOCTOU, test-data). Full list in the audit run.

---

## What was checked and found genuinely CLEAN (coverage was real)

- **RBAC field-stripping** — verified live as a real EMPLOYEE: not one pricing key (`purchasePrice`, `estimatedCost`, `valueAtCost`, `totalValue`, `budget`, `grossMargin`, `annualValue`) leaks from `/api/materials`, `/api/projects`, `/api/erection`, `/api/invoices`, `/api/clients`, `/api/search`, `/api/service`. `/api/pdf` → 403. This is the #1 non-negotiable and it holds.
- **Money primitives** — `money.ts`/`gst.ts` use `decimal.js` throughout, zero float arithmetic. CGST/SGST split sums exactly. (The B1 bug is in the *milestone base*, not the GST math itself.)
- **Immutable ledgers** — `StockMovement` and `Receipt` are truly append-only (grep finds zero update/delete/upsert).
- **Transactions** — every multi-step write (Won→Order, GRN, invoice+numbering, credit note, transfer, audit) is wrapped in `$transaction`; sequential numbering is race-free (`INSERT … ON CONFLICT … RETURNING`).
- **Business guards** — second-Won blocked (`Order.proposalId @unique`), margin guard works, credit notes fully negate + over-reversal-guarded, addReceipt blocks over-payment, A5 draft invoices burn no sequential number until issued and are excluded from money aggregates.
- **Build gate** — `tsc` clean, 72/72 unit, lint 0 errors, `next build` clean, all 4 new materials routes compile.
- **Every route renders** — all ~30 pages returned 200 for both roles at 1280px and 390px; no error boundaries, no client crashes; heavy pages 34–95ms warm.
- **API surface** — mutations Zod-validated, `getSession` fails closed in prod, `take` clamped to 100, errors mapped to 422/403 without stack traces.

### Refuted / dismissed by verification (checked, cleared)
13 findings were killed on a second look — e.g. claims that the session cookie was unsigned, that RBAC leaked from an API, that numbering could reuse a number, and several inflated severities. They're not in the list above because they didn't survive scrutiny.

---

*Audit note: the 12-agent workflow completed all finder + verification passes; only the auto-synthesis step died on
an API error, so this report was assembled from the verified cached findings + independent re-confirmation of every
blocker against the code and live DB.*
