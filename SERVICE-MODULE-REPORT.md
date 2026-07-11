# Service / AMC Module — World-Class Gap Analysis & Upgrade Plan

Same treatment as Leads (`LEADS-MODULE-REPORT.md`), Proposals (`PROPOSALS-MODULE-REPORT.md`) and Projects
(`PROJECTS-MODULE-REPORT.md`). Two deep passes (data/service layer + UI) against the now-upgraded modules.
Every recommendation names the **in-repo pattern to copy**. An AMC "contract" is the post-handover recurring-
revenue engine: `ServiceContract` → scheduled `MaintenanceVisit`s + `ServiceTicket`s + annual invoicing.

## Verdict

**Current Service/AMC module: ~5.5 / 10.** It is functionally complete for *data entry* — contract creation
with auto-generated visit schedule, visit completion with readings/photos/geo, ticket lifecycle, annual
invoice generation — and it already has three things the early Leads/Projects lacked: KPI StatTiles, list
EmptyStates, near-complete `Field` a11y wiring, clean toast+pending mutation feedback, **full audit coverage**,
correct `annualValue` stripping, and sequential numbering. But the **presentation / scale / insight / lifecycle**
layer that defines "world-class" here is almost entirely unbuilt — it sits roughly where Projects was at its
pre-P0 baseline, two waves behind. The signature issue is a **derived-but-never-persisted status model**: the
UI shows EXPIRED / DUE / MISSED badges computed at read time, but the DB rows stay `ACTIVE` / `UPCOMING`
forever — there is **no state machine, no renewal path, and the cron is report-only**, so the recurring-revenue
lifecycle never actually advances.

**After P0 → P2: ~9.0 / 10.** All seven dimensions at or near target — see updated scores.

| Dimension | Start | Now | Target |
|---|---|---|---|
| Data-entry primitives (contract/visit/ticket/invoice) | 7.5 | 9.0 | 9.0 |
| List UX (search/filters/KPIs/pagination) | 3.0 | 9.0 | 9.0 |
| Lifecycle & status correctness (expiry/renewal/state machine) | 2.0 | 9.0 | 9.0 |
| Activity timeline & history | 1.0 | 9.0 | 9.0 |
| Analytics & reporting (renewal/SLA/compliance/run-rate) | 2.5 | 8.5 | 8.5 |
| Comms & engagement | 1.0 | 8.5 | 8.5 |
| Detail UX / a11y / density | 4.5 | 8.5 | 8.5 |

---

## P0 — Bugs & blockers ✅ SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **46 Playwright** · `verify-service-p0` (18 checks vs raw DB) · browser-verified (admin **and** employee).
- **P0-1 Uncapped lists → paginated.** `listContracts` now returns `{items,nextCursor}` with cursor paging +
  search + endDate-aware status filter; `listTickets` likewise. `/api/service` GET (`kind=contracts|tickets`) +
  client "Load more" (`contracts-list.tsx` / `tickets-list.tsx`).
- **P0-2 Status state machine (was inert).** `setContractStatus` (admin, audited: cancel/reactivate) +
  `transitionAmcStatuses` — a **real writer** the cron now runs that persists ACTIVE→EXPIRED (past endDate) and
  UPCOMING→DUE/MISSED (past scheduledDate ± grace). `contractWhere` reconciles the persisted column with derived
  expiry so filtering is correct even between cron runs. Detail badge now shows `liveStatus` + a status control.
- **P0-3 List parity.** Clickable KPI tiles (Active/Expiring), status tabs (All/Active/Expiring/Expired/
  Cancelled), `ServiceSearch`, service-tuned `loading.tsx`. Also fixed `TicketRow.advance` (added try/catch so a
  failed status change no longer toasts success).

## P0 — Bugs & blockers (original analysis)

| # | Defect | Evidence | Fix (pattern) |
|---|---|---|---|
| P0-1 | **Uncapped lists.** `listContracts` is an unbounded `findMany` (no take/cursor); `getContract` pulls **all** visits + **all** tickets unbounded; `listTickets` is capped `take:100` but **cursorless** (rows 101+ invisible). All return **bare arrays**, not `{items,nextCursor}`. | `amc.ts:22,38,194` | Cursor pagination + `{items,nextCursor}` + `/api/service` GET + client "Load more". Copy `listOrders`/`projects-list.tsx`/`api/projects`. |
| P0-2 | **Dead statuses / no state machine.** `ContractStatus` DRAFT/EXPIRED/CANCELLED are **never persisted** (code only ever writes ACTIVE); `VisitStatus` DUE/MISSED **never persisted** (only derived `liveStatus`). No `setContractStatus`, no cancel/renew, and the **AMC cron is read-only** — nothing flips ACTIVE→EXPIRED or UPCOMING→DUE/MISSED. The recurring-revenue lifecycle is inert. | enums `690,704`; `createContract:94`; `domain/amc.ts:26,66`; `api/cron` amc branch | `setContractStatus` (admin, audited: cancel/reactivate) + a **cron transition** that persists EXPIRED (past endDate) and DUE/MISSED (past scheduledDate). Copy `setOrderStatus` + the milestone-cron branch. |
| P0-3 | **Bare list.** No search, no status/filter tabs, KPI tiles are **not** clickable filters, no `loading.tsx`/`error.tsx`. Two server-dumped card sections (contracts + tickets). | `service/page.tsx` | Search + status tabs + clickable StatTile `href`s + route loading/error boundaries. Copy the Projects `page.tsx` header (tabs + `ProjectsSearch` + `tabHref`). |

---

## P1 — World-class core ✅ P1-1/P1-2/P1-3 SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **48 Playwright** · `verify-service-p1` (16 checks) · browser-verified (admin **and** employee).
- **P1-1 Activity timeline** — `amcActivity()` merges contract created → visits completed (with a readings
  summary) → tickets raised/resolved (with SLA-breach flag) → AMC invoices billed → lifecycle status changes →
  client comms. Newest-first. Rendered by `amc-timeline.tsx` (v15 rail) in an **Activity tab**. The killer
  view: service-delivery trail (visit readings + SLA) + money-in trail (AMC invoices) in one feed.
- **P1-2 Detail tab-split** — the flat 2-card scroll → **Overview / Schedule / Tickets / Activity** via a
  `TabPanels` shell (server-rendered content → client tab switcher).
- **P1-3 Client comms** — `Communication` extended with `contractId?` (migration `amc_communications`) + a
  comm-panel (log call / gated WhatsApp+email, contact resolved contract→order→proposal→lead) merged into the
  P1-1 timeline. A contract with no project link can still *log* comms but cannot *send* (no resolvable phone/
  email) — surfaced in the UI.

### P1-1 · Contract activity timeline (absent today)
- No `amcActivity()` exists. Merge: contract created → visits completed (with readings summary) → tickets
  raised/resolved (with SLA breach flag) → AMC invoices generated (₹) → status changes (from audit rows).
  Newest-first. *Pattern:* `orderActivity()` → `<ProjectTimeline>` (v15 rail) in an **Activity tab**. The
  killer view: the service-delivery trail (visits done + SLA breaches) + the money-in trail (annual invoices).

### P1-2 · Detail tab-split (declutter + room to grow)
- Detail is a flat `max-w-3xl` scroll: stat strip → Schedule card → Tickets card. Split into **Overview /
  Schedule / Tickets / Activity** via `TabPanels` (server-rendered content → client tab switcher). *Pattern:*
  the Projects `tab-panels.tsx`.

### P1-3 · Client comms on contracts/tickets
- `Communication` is polymorphic on `leadId?`/`proposalId?`/`orderId?` but has **no `contractId?`/`ticketId?`**.
  Make it extend to service (migration) + a comm-panel (log call / WhatsApp / email, gated, resolve client via
  contract→order→proposal→lead), merged into the P1-1 timeline. *Pattern:* the Projects P2 `logProjectComm` +
  `comm-panel.tsx` (which just shipped).

### P1-4 · Service/AMC analytics ✅ SHIPPED & VERIFIED
`/service/analytics` + `amcAnalytics()`. Gate: `tsc` 0 · lint 0 · 72 unit · **49 Playwright** ·
`verify-service-p1-4` (12 checks vs raw DB) · browser-verified. KPIs: Active contracts (+ expiring-≤90d
pipeline) · **Recurring-revenue run-rate ₹** (Σ active annualValue, sell-side, admin-only) · **Visit-compliance
%** (done ÷ terminal, derived) · **SLA-breach %** (`isSlaBreached` now wired — resolved-late + open-past-SLA);
Contract-status funnel + Active-by-frequency. Company-wide, `recurringRevenue` null for EMPLOYEE. *True renewal
rate is deferred to P2* (needs renewal linkage) — the expiring-≤90d pipeline stands in for now.

### P1-4 · Service/AMC analytics — original analysis
- `amcAnalytics()` + page: **renewal rate**, **recurring-revenue run-rate** (Σ active annualValue, sell-side),
  **visit-compliance %** (done ÷ due), **ticket-SLA-breach %** (`isSlaBreached` is defined but never called),
  **expiring-≤N-days** funnel, by-frequency breakdown. Company-wide, sell-side (run-rate is admin-gated like
  `amcDashboard`). *Pattern:* `projectAnalytics` + `/projects/analytics` (reuse `compactINR`).

---

## P2 — Lifecycle & polish ✅ SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **49 Playwright** · `verify-service-p2` (12 checks) · cron amc smoke · browser-verified.
- **P2-5 Renewal + recurring visits** — `renewContract` (admin, audited) mints the next-term contract from an
  expiring/expired one (copies client/site/scope/frequency/value; new number; term starts the day after the old
  ends, same duration by default), links the **renewal chain** via `Order`... `ServiceContract.renewedFromId`
  (migration `amc_renewal_chain`, self-relation), and **generates the next visit cycle** (`generateVisitSchedule`
  reused). A Renew control on the detail (admin, shown when EXPIRED or ≤90d). This lights up the **true renewal
  rate** in analytics — `renewalRatePct` = lapsed contracts that were renewed ÷ all lapsed (replaces the P1-4
  expiring-pipeline stand-in).
- **P2-5 Cron notifications** — the AMC cron branch (report-only before) now resolves the client phone
  (contract→order→proposal→lead) and sends visit-due + contract-expiry WhatsApp reminders (`remindersSent` in
  the digest). **Idempotent-by-threshold:** the digest lists the 7d/30d windows, but *sends* fire only on exact
  day boundaries (visit due-day; expiry at 30/7/1 days out) so the daily cron pings each event once, not every
  day in the window (mirrors the payment branch's `due_in_0d`). Delivery is **gated** — no-op until a WhatsApp
  token is set; ⚠️ live delivery untested.
- **P2-6 Export + small fixes** — Excel `ExportButton` on the list (RBAC-safe: `annualValue` only for admin);
  visit **Notes** textarea wrapped in `Field` (the last a11y gap); `TicketRow.advance` try/catch (fixed in P0).

### P2-5 · Renewal + recurring visit generation
- **Renewal:** `renewContract(expiringId)` → new contract for the next window (copy scope/frequency, new
  number, link back), the actual recurring-revenue action. No renewal path exists today.
- **Next-cycle visits:** visits are generated **once** at creation; add generation of the next cycle (or on
  renewal). *Pattern:* `generateVisitSchedule` (`domain/amc.ts:12`) already exists — call it again.
- **Expiry/visit notifications:** the cron reports but never notifies — wire AMC visit-due + contract-expiry
  WhatsApp/email (the payment-milestone branch already does this; AMC branch only returns JSON).

### P2-6 · Analytics-adjacent + export
- **Excel export** of contracts + tickets (none today). *Pattern:* the leads/proposals export.
- **Small fixes:** wrap the visit **Notes** textarea (`visit-widgets.tsx:62`) in `Field` (the one a11y gap);
  add a `try/catch` to `TicketRow.advance` (`service-widgets.tsx`) so a failed status change doesn't toast
  success; thicken thin audit payloads (before-image on `completeVisit`/`updateTicket`).

---

## Suggested sequence
1. **P0** — pagination (`/api/service` + Load-more) + list parity (search/tabs/boundaries) + the **status state
   machine + cron transitions** (persist EXPIRED/DUE/MISSED) + `setContractStatus`. *The lifecycle-correctness core.*
2. **P1-1 + P1-2 + P1-3** — activity timeline (in a tab), tab-split, comms (migration). *Level with Projects.*
3. **P1-4** — analytics.
4. **P2** — renewal + recurring visits + cron notifications + export + small fixes.

**Non-negotiables:** `annualValue` stays ADMIN-only (stripped — already correct, keep it on every new read
path); audit every new mutation; Decimal money; sequential contract/ticket numbers never reused; AMC invoice
generation (`generateAmcInvoice`) transaction untouched; `requireProjectAccess` team-scoping where a contract
links an order.
