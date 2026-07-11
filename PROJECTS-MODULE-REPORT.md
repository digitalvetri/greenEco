# Projects / Orders Module — World-Class Gap Analysis & Upgrade Plan

Same treatment as Leads (`LEADS-MODULE-REPORT.md`) and Proposals (`PROPOSALS-MODULE-REPORT.md`). Two deep
passes: full inventory + comparison against the now-upgraded Leads (v7–v15) and Proposals (v16). Every
recommendation names the **in-repo pattern to copy**. An "Order" = a project (auto-created by the Won→Order
transaction; there is no standalone create path).

## Verdict

**Current Projects module: ~5.5 / 10.** The *execution primitives* are real and well-built: stage tracking
with a delay-reason gate, drawing revision control (supersede + A→B→C), milestones + immutable receipt
ledger, geo-tagged stage photos, an admin budget-vs-actual engine, and a closeout PDF. But the module is
**roughly where Leads/Proposals were before their overhauls** — a bare, **uncapped** card list and a
5-cards-stacked single-scroll detail — and it carries the **same dead-status bug** plus a data layer that's
stored-but-unwired (order status, `startDate`/`targetDate`, `documents`, milestone `dueDate`/`linkedStageId`,
stage `plannedDate`).

**After P0 → P2: ~9.0 / 10.** All seven dimensions at or near target — see updated scores.

| Dimension | Start | Now | Target |
|---|---|---|---|
| Execution primitives (stages/drawings/milestones/receipts/budget) | 8.0 | 9.0 | 9.0 |
| List UX (search/filters/KPIs/pagination) | 2.5 | 9.0 | 9.0 |
| Lifecycle & status correctness | 3.0 | 9.0 | 9.0 |
| Activity timeline & history | 1.5 | 9.0 | 9.0 |
| Analytics & reporting | 3.0 | 8.5 | 8.5 |
| Documents & engagement | 2.5 | 8.5 | 8.5 |
| Detail UX / a11y / density | 4.0 | 8.5 | 8.5 |

---

## P0 — Bugs ✅ FIXED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **38 Playwright** · `verify-projects-p0` (12 checks) · browser-verified.
- **P0-1 Uncapped list → paginated.** `listOrders` now returns `{items, nextCursor}` with cursor paging +
  search + status filter + `/api/projects` GET + client "Load more" (`projects-list.tsx`). Each row carries
  a server-computed `overdue` flag (no `Date.now()` in render).
- **P0-2 Dead statuses fixed.** `setOrderStatus` (admin, audited) makes ON_HOLD / COMPLETED / CANCELLED
  reachable + reopen; detail control (`status-control.tsx`) + a 4-state badge. Verified: transitions + reopen,
  employee blocked.
- **P0-3 List parity with Leads/Proposals** — KPI StatTiles (`orderStats()`: Active · On hold · Payments
  overdue · **Receivables ₹** + completed count), search, status tabs, `EmptyState`, overdue badge.

## P0 — Bugs (original analysis)

| # | Defect | Evidence | Fix (pattern) |
|---|---|---|---|
| P0-1 | **The list is UNCAPPED** — `listOrders` is an unbounded `findMany` (no cap, no cursor); every order loads every request. *Worse* than the leads-50 / proposals-100 caps. | `order.ts` `listOrders` | Cursor pagination + `{items, nextCursor}` + `/api/projects` GET + client "Load more". Copy `leads-list.tsx`. |
| P0-2 | **Dead order statuses** — `OrderStatus` has ACTIVE/ON_HOLD/COMPLETED/CANCELLED but **no code ever sets them** (the exact leads-`QUOTE_REQUESTED` / proposals-`UNDER_NEGOTIATION` bug). List/detail even hardcode a 2-value badge. | enum + no writer; `page.tsx` badge | `setOrderStatus` (admin, audited, guarded) → COMPLETED / ON_HOLD / CANCELLED + reopen. Copy `setLeadStatus`. Free (enum exists). |
| P0-3 | **Bare list** — no search, filters, KPI tiles, `EmptyState`, sort, or aging. | `projects/page.tsx` | KPI StatTiles (active · on-hold · overdue payments · receivables ₹), search, status tabs, `EmptyState`. Copy `leadStats`/`proposalStats` + `leads-filters`. |

---

## P1 — World-class core (copy Leads/Proposals patterns)

### P1-1/P1-2/P1-3 ✅ SHIPPED (timeline + tab-split + documents)
Gate: `tsc` 0 · lint 0 · 72 unit · **40 Playwright** · `verify-projects-p1` (10 checks) · browser-verified.
- **Execution activity timeline** — `orderActivity()` merges created → completed stages (with delay reasons)
  → drawing revisions → **payments received (₹, the money-in trail)** → lifecycle status changes, newest-first.
  Rendered by `project-timeline.tsx` (v15 rail) in an **Activity tab**.
- **Detail tab-split** — the 5-card wall → **Overview / Stages / Payments / Drawings & Docs / Activity**
  via a `TabPanels` shell (server-rendered content passed to a client tab switcher — heavy cards stay server).
- **Documents card** — the generic `Document` model + `getOrder`'s already-fetched `order.documents` (which
  the UI threw away) now render in a Documents card (contracts / permits / reports) + add/delete.
  `addOrderDocument`/`deleteOrderDocument`, RBAC (`requireProjectAccess`) + audit.

### P1-1 · Execution activity timeline — original analysis
- Projects have the richest *execution* history but no timeline. Merge: order created → stage transitions
  (with delay reasons) → drawing revisions (rev A→B, supersede) → milestone status flips → receipts
  (₹ received) → team changes → stage photos → status changes. All already audited (`order.ts` audits stage
  `:101`, drawing `:155`, receipt `:200`) or timestamped (`StagePhoto.takenAt`, `Drawing.createdAt`).
- *Pattern:* `orderActivity()` modeled on `leadActivity()`/`proposalActivity()`, rendered by the v15
  two-column `activity-timeline.tsx`. **The killer view:** the money-in trail (receipts) + schedule slips
  (delayed stages) in one feed.

### P1-2 · Detail tab-split (declutter)
- The detail is **5+ full-width cards stacked** (value/budget/margin tiles → Stages → Drawings → Milestones
  → Team), each with dense inline per-row editors — and it will only grow (documents, budget-vs-actual,
  erection aren't even rendered yet). Split into **Overview / Stages / Payments / Drawings & Docs / Activity**.
- *Pattern:* the proposal editor `Tabs` split (`proposal-editor.tsx`).

### P1-3 · Documents card (cheapest high-value)
- The generic `Document` model exists AND `getOrder` **already fetches `order.documents`** — the UI just
  never renders them (paying for data it throws away). Add a Documents card (contracts / permits / site
  photos / reports) + add/delete. *Pattern:* `documents-card.tsx` + `addLeadDocument`/`deleteLeadDocument`.

### P1-4 · Project analytics ✅ SHIPPED
`/projects/analytics` + `projectAnalytics()`. Gate: lint 0 · 72 unit · **41 Playwright** ·
`verify-projects-p2` (8 checks vs raw DB) · browser-verified. KPIs: Active/completed · **Value in execution ₹**
· Avg progress % · **On-time stages %** (from stage delay reasons); Status funnel + Receivables panel
(outstanding / overdue / overdue-milestones / stages-completed). Company-wide, sell-side (role-agnostic).

### P1-4 · Project analytics — original analysis
- `/projects/analytics` + `projectAnalytics()`: active vs completed, **on-time %** (stage planned vs actual),
  avg cycle time, **budget variance** (reuse `budgetVsActual`), **receivables aging** (reuse
  `getReceivables`), overdue milestones, value-in-execution. *Pattern:* `leadAnalytics`/`proposalAnalytics`
  + `/leads/analytics` (reuse its `compactINR`).

---

## P2 — Engagement & polish ✅ SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **42 Playwright** · `verify-projects-p3` (19 checks) · browser-verified.
- **P2-5 Client comms** — `Communication` made **tri-polymorphic** (migration `project_comms_and_archive`
  adds `orderId?` + relation + index). `logProjectComm` / `sendProjectWhatsApp` / `sendProjectEmail`
  resolve the client contact via **order → proposal → lead**, gate the send (LOGGED when no transport),
  audit the touch, and merge into `orderActivity` as a new `comm` event. Comm-panel on the Activity tab
  (copy of the leads `comm-panel.tsx`).
- **P2-6 A11y + consistency** — `project-widgets.tsx` retrofit: milestone receipt inputs → auto-wiring
  `Field`; placeholder-only stage/drawing controls given `aria-label`s (`getByLabel` now resolves, screen
  readers labelled). Widgets already used `toast` via the shared `useRun`.
- **P2-7 Wire the dead data** — **Archive/soft-delete**: `Order.deletedAt` migration + `archiveOrder`
  (admin, audited) + `deletedAt: null` filter across `listOrders`/`orderStats`/`projectAnalytics`/
  `getOrder`/`orderActivity` + an `ArchiveButton` (confirm → redirect). **Lifecycle dates** surfaced in a
  new Overview Schedule card. **Stage `plannedDate`** settable in `StageRow` (lights up the delay-reason
  gate). **Milestone `dueDate` + `linkedStageId`** settable via `setMilestoneSchedule` (admin, audited,
  recomputes status) — turns on the DATE receivables engine + the STAGE_COMPLETION trigger, both inert
  before. **Team un-assign** (`removeTeam`, audited) + `setDrawingApproval`/`assignTeam` now audited.

### P2-5 · Client comms on projects
- `Communication` is polymorphic on `leadId?`/`proposalId?` but has **no `orderId`** — projects have no
  client-comms tracking. Make it **tri-polymorphic** (migration: add `orderId?`) + a comm-panel (log call /
  WhatsApp / email, gated), merged into the P1-1 timeline. *Pattern:* `logCommunication`/`sendLeadWhatsApp`.

### P2-6 · A11y + consistency
- `project-widgets.tsx` + `team-assign.tsx` use raw `<Label>`/`aria-label`, not the auto-wiring `Field`
  (`getByLabel` fails, screen readers miss labels). Retrofit to `Field`. Swap inline red-string errors for
  `toast` (stage/drawing/milestone/erection widgets). Zod-validate the project actions (`as`-cast today).

### P2-7 · Wire the dead data
- **Order lifecycle dates** — surface `startDate`/`targetDate`; let admin set milestone `dueDate` +
  `linkedStageId` (the DATE/STAGE_COMPLETION status engine + the receivables cron are inert without them) and
  stage `plannedDate` (the delay-reason gate can't fire without it). **Archive/soft-delete** needs a
  `deletedAt` migration on Order (Lead has one). **Team un-assign** (no removeTeam today). Audit
  `setDrawingApproval`/`assignTeam` (currently unaudited).

---

## Suggested sequence
1. **P0** — pagination + list parity + dead order statuses. *Not buggy.*
2. **P1-1 + P1-2 + P1-3** — activity timeline (in a tab), tab-split declutter, documents. *Level with Leads/Proposals.*
3. **P1-4** — analytics.
4. **P2** — comms (migration), a11y, wire the dead data (dates/milestone triggers/archive).

**Non-negotiables:** `Budget`/`baseAmount`/`adjustments`/`valueAtCost` stay ADMIN-only (stripped); Receipt +
StockMovement immutable (correct via reversal); `requireProjectAccess` team-scoping for EMPLOYEE; audit every
mutation; Decimal money; sequential order numbers never reused; the Won→Order transaction untouched.
