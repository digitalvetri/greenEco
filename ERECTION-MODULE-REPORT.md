# Erection Module — World-Class Gap Analysis & Upgrade Plan

Same treatment as Leads / Proposals / Projects / Service / Materials (`*-MODULE-REPORT.md`). Two deep passes
(data/service + UI) against the now-upgraded modules. Every recommendation names the **in-repo pattern to copy**.
Erection is the site-execution ledger: field staff log `ErectionEntry` rows (LABOUR / SITE_PURCHASE / OTHER) per
project, admin verifies (approve / query / reject), and `budgetVsActual` rolls approved spend + stock consumption +
open POs against the project `Budget` (feeding the closeout PDF). It closes the Projects → site-work loop.

## Verdict

**Current Erection module: ~4.0 / 10 — the least-upgraded module in the app.** It's a Phase-3 prototype that never
got the v17–v19 treatment. **Foundations are sound** (don't regress): create is `requireProjectAccess`-gated +
audited, the SITE_PURCHASE bill-image gate is enforced in the service, `budgetVsActual` is `requireAdmin`-gated
(employees never see budget/margin), employees are creator-scoped, money is Decimal end-to-end, there are **no dead
statuses**, and the budget-vs-actual card (progress bar + overrun alert + category breakdown + closeout link) has
good bones. But the entire presentation / scale / insight layer is missing, plus a few real defects.

**After P0 → P2: ~8.7 / 10.** All dimensions at/near target (full main-page tab-split deferred).

| Dimension | Start | Now | Target |
|---|---|---|---|
| RBAC & money safety (capability-gating / stripPricing net / bill gate / Decimal) | 7.5 | 9.0 | 9.0 |
| List UX (search/filters/KPIs/pagination) | 1.5 | 9.0 | 9.0 |
| Lifecycle & correctness (approval state-machine / audit / QUERIED-fix) | 4.0 | 9.0 | 9.0 |
| Approval-activity timeline & history | 1.0 | 9.0 | 9.0 |
| Analytics & reporting (spend/approval-rate/budget-burn) | 1.5 | 8.5 | 8.5 |
| Budget-vs-actual (compute + per-project detail) | 6.0 | 8.5 | 8.5 |
| Detail UX / a11y / density | 3.0 | 8.5 | 8.5 |

---

## P0 — Bugs & blockers ✅ SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **57 Playwright** · `verify-erection-p0` (21 checks) · control-flow regression · browser-verified (admin **and** employee).
- **P0-1 Uncapped list + fan-out → bounded.** `listEntries` now returns `{items,nextCursor}` with cursor + search +
  type/status filter + `/api/erection` **GET** + client "Load more" (`entry-list.tsx`). The BvA per-project fan-out is
  capped (`BVA_LIMIT=10`, "showing 10 of N" disclosed; full budget-burn moves to `/erection/analytics` in P1-4).
- **P0-2 List parity.** KPI StatTiles (`erectionStats`: pending review · queried/rejected · **approved spend ₹**
  admin · **overrun projects** admin) + `ErectionSearch` + status tabs + type tabs + `EmptyState` + `loading.tsx`.
- **P0-3 `acknowledgeOverrun` audited + transactional** (was an unaudited read-then-update).
- **P0-4 `reviewEntry` terminal-state guard** — an APPROVED/REJECTED entry can no longer be silently flipped
  (throws; QUERIED stays reviewable); audit now records before/after status.
- **Coherence fix (caught in browser):** the "Overrun projects" KPI first used erection-spend-only, contradicting a
  BvA card showing 120% OVER BUDGET. Reworked `overrunProjects` to the **same definition as the cards** (approved
  erection + consumption + committed ≥ budget), via a few grouped queries (not a per-order fan-out) — verified the
  tile matches the cards (1==1).
- **RBAC held:** `approvedSpend`/`overrunProjects` null for employee; verification queue + BvA admin-gated;
  employees creator-scoped; `amount` stays visible to its author (correct — not a leak).

## P0 — Bugs & blockers (original analysis)

| # | Defect | Evidence | Fix (pattern) |
|---|---|---|---|
| P0-1 | **Uncapped list + uncapped fan-out.** `listEntries` is an unbounded `findMany` (bare array), called **twice** per page; and the page runs `budgetVsActual` in a `Promise.all` over **every ACTIVE order** — an N-query fan-out, each of which itself does 3 unbounded scans. | `erection.ts:53,60`; `page.tsx:18-27` | Cursor-paginate `listEntries` → `{items,nextCursor}` + `/api/erection` **GET** + client "Load more". Cap/scope the BvA fan-out (move it behind a filter or the analytics page). Copy `listOrders`/`projects-list.tsx`. |
| P0-2 | **Bare list.** No KPI tiles, no search, no type/status/project filter tabs, no `EmptyState` primitive (bare cards), no `loading.tsx`/`error.tsx`, no `/api/erection` GET. | `page.tsx` | KPI StatTiles (`erectionStats`: pending review · approved spend ₹ admin · queried/rejected · project overruns admin) + search + type/status tabs + `EmptyState` + boundaries. Copy the Service `page.tsx`. |
| P0-3 | **`acknowledgeOverrun` is an unaudited financial mutation** (writes `Budget.adjustments`) — and it's a read-then-update with no `$transaction`. | `erection.ts:175` | Add `logAudit`; wrap in `$transaction`. |
| P0-4 | **`reviewEntry` has no terminal-state guard** — an admin can flip an APPROVED entry to REJECTED (or re-approve a rejected one) with no state-machine check. | `erection.ts:67-81` | Guard: only PENDING/QUERIED are reviewable (or explicitly allow re-open with an audit trail). Copy the lead/order status guards. |

---

## P1 — World-class core ✅ P1-1 + P1-1b + detail + P1-3 SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **58 Playwright** · `verify-erection-p1` (11 checks) · browser-verified (admin **and** employee).
- **P1-1 Approval-activity timeline** — `erectionActivity()` merges entry-logged (type + ₹) → reviewed (approved/
  queried/rejected) → overrun acknowledgements, newest-first. Rendered on a new **`/erection/[id]` per-project
  detail** page (BvA card + entries + the approval timeline); the main-page BvA cards link to it. **RBAC decision
  (advisor-caught):** the timeline is a **cross-author cost view** (it surfaces every teammate's entry amounts), so
  both `erectionActivity` and the detail page are **admin-only** — a field employee (even an assigned one) is 404'd
  and the service throws. This keeps it coherent with the creator-scoped entries card (an employee never sees a
  teammate's amount). Verified with a discriminating cross-author assertion (a second author's ₹777 entry shows in
  the admin timeline) + an employee-blocked e2e. (Deferred nicety: review events show the entry description, not the
  admin's note.)
- **P1-1b QUERIED dead-end resolved** — the review queue now uses `needsReview` (PENDING **+** QUERIED), and
  `VerificationCard` renders review actions for QUERIED too, so a queried entry can be approved/rejected (was stuck
  forever). Verified: queried entry reappears in the queue → APPROVE resolves it.
- **P1-3 A11y + `toast` retrofit** — `erection-widgets.tsx`: 8 raw/placeholder inputs → auto-wiring `Field`, the 3
  unlabeled icon buttons got `aria-label`s, inline-banner errors → `toast` (with success confirmation). Fixed 2
  pre-existing lint warnings as a side effect.
- *Deferred:* the full main-page tab-split (the per-project detail delivered the higher-value drill-in; main page
  stays a structured scroll with KPIs/queue/BvA/list).

### P1-1 · Approval-activity timeline (the highest-value gap)
- `reviewEntry` audits every approve/query/reject but the UI surfaces **nothing** — no history of who reviewed
  what, when, with which note. Add `erectionActivity()` merging created → approved / queried (with note) / rejected
  (with note) → overrun acknowledgements, newest-first. *Pattern:* `orderActivity`/`amcActivity` → the v15 rail.
  Per-project (or per-entry) approval trail.

### P1-1b · Resolve the QUERIED dead-end (found during P0 review)
- The P0 terminal-state guard permits re-reviewing a QUERIED entry, but **the UI can't reach it**: the Verification
  Queue is `pendingOnly` (PENDING only) and the "All Entries" list is read-only. So once an admin clicks **Query**, the
  entry is stuck QUERIED forever (inflating the queried/rejected KPI) with no approve/reject/resolve path. Pre-existing
  (not a P0 regression). Fix in the tab-split/timeline wave: surface QUERIED entries with review actions (and, ideally,
  an employee clarify-then-resubmit path). Until then the guard's "QUERIED stays reviewable" is service-only.

### P1-2 · Tab-split + per-project erection detail
- The page is a 4-section monolithic scroll (form → verification queue → per-project BvA cards → flat entry list).
  Split into **Entries / Verification / Budget** tabs; add a **per-project erection view** (its entries + BvA +
  approval timeline). *Pattern:* the Service `tab-panels.tsx` + Materials `[id]` detail.

### P1-3 · A11y + `toast` retrofit
- `EntryForm` + `VerificationCard` use **8 raw/placeholder-only inputs + 3 unlabeled icon buttons** (approve/query/
  reject), inline red-banner errors (no `toast`), and **no success feedback**. Retrofit to auto-wiring `Field` +
  `aria-label` on the icon buttons + `toast` (success/error). *Pattern:* the Materials P1-3 / Proposals P2 retrofit.

### P1-4 · Erection analytics ✅ SHIPPED & VERIFIED
`/erection/analytics` + `erectionAnalytics()`. Gate: `tsc` 0 · lint 0 · 72 unit · **61 Playwright** ·
`verify-erection-p1-4` (12 checks vs raw DB) · browser-verified. KPIs: Entries · **Total spend ₹** · **Approval
rate** (approved ÷ reviewed) · **Overrun projects**; **spend-by-type** (labour/site-purchase/other/consumption) ·
entries-by-status · **budget burn** (active projects sorted by pctConsumed, overruns flagged) — this is the
**aggregated-once** version of the main-page N-order fan-out (a few grouped queries). **Admin-only** (all cost
aggregates; employee 404s + service throws), coherent with the detail-page decision. `overrunCount` verified equal
to `erectionStats.overrunProjects` (1==1). **Scope fix (advisor-caught):** consumption in `spendByType`/`totalSpend`
is summed **company-wide** (all site locations), matching the company-wide labour/purchase/other — the first cut
mixed scopes (active-budgeted-only consumption), making "total spend" a hybrid that dropped a completed project's
consumption. Discriminating check: a CONSUME on an off-active site (₹555) now appears in the total (would've been
dropped before). The budget-burn panel stays active+budgeted (correct — you can't burn a nonexistent budget).

### P1-4 · Erection analytics — original analysis
- `erectionAnalytics()` + page: **spend by project** (admin), **labour vs site-purchase vs consumption** mix,
  **approval rate** (approved ÷ reviewed) + queried/rejected counts, **budget burn** (projects by pctConsumed, with
  overruns flagged). The data already exists in `budgetVsActual` + entries. *Pattern:* `materialsAnalytics` +
  `/materials/analytics` (reuse `compactINR`). This is also where the N-project BvA fan-out belongs (aggregated once).

---

## P2 — Safety & polish ✅ SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **61 Playwright** · `verify-erection-p2` (11 checks) · control-flow regression · closeout PDF 200 · browser-verified.
- **`stripPricing` defense-in-depth net** — `budgetVsActual` / `closeoutData` protected budget/margin by `requireAdmin`
  only (no key-stripping). Added a `stripPricing(…, ctx.role)` pass on both returns: a no-op for the admin caller
  (verified full object kept; closeout PDF still 200), but if a future mis-wired caller ever reached the return with
  a non-admin role, the ADMIN_ONLY keys (budget/committed/grossMargin) drop rather than leak. Verified the net's
  effect (stripped for EMPLOYEE) **and** that `requireAdmin` still hard-blocks at the door (belt AND suspenders).
- **Excel export** — entries (Export) + budget-vs-actual (Export BvA) on the main page.

### P2-5 · Defense-in-depth + export
- **`stripPricing` safety net** — `budgetVsActual`/`closeoutData` protect budget/margin by `requireAdmin` only (no
  key-stripping). Add a `stripPricing` pass on the return as belt-and-suspenders (the keys `budget`/`baseAmount`/
  `margin`/`committed` are already in `ADMIN_ONLY_KEYS`), so a future mis-wired caller can't leak. **Excel export** of
  entries + budget-vs-actual (none today). Consider surfacing `budgetVsActual` for **reuse by the Projects module**
  (it's siloed in Erection today — Projects has its own receivables panel but no cost/margin burn).

**Non-negotiables:** `Budget.baseAmount`/`adjustments` + margin stay ADMIN-only (capability-gated — keep, add the
`stripPricing` net); `requireProjectAccess` on create; audit every mutation (P0-3 closes the gap); Decimal money;
the SITE_PURCHASE bill-image gate stays enforced; the closeout PDF (`/print/closeout`) + `closeoutData` margin math
untouched. Note: erection `amount` is the field employee's **own** logged spend (creator-scoped) — showing it to its
author is **not** a pricing leak, so it stays visible (don't strip it).

## Suggested sequence
1. **P0** — paginate `listEntries` (+`/api/erection` GET) + cap the BvA fan-out + list parity (KPIs/search/tabs/
   boundaries) + audit `acknowledgeOverrun` + `reviewEntry` terminal-state guard. *Correctness + scale.*
2. **P1-1 + P1-2 + P1-3** — approval-activity timeline + tab-split + per-project detail + a11y/`toast` retrofit.
3. **P1-4** — analytics (spend / approval-rate / budget-burn).
4. **P2** — `stripPricing` net + Excel export.
