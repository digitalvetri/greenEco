# Materials / Inventory Module — World-Class Gap Analysis & Upgrade Plan

Same treatment as Leads / Proposals / Projects / Service (`*-MODULE-REPORT.md`). Two deep passes (data/service +
UI) against the now-upgraded modules. Every recommendation names the **in-repo pattern to copy**. Materials is a
warehouse/procurement engine: `Item` master + `Vendor`/`VendorPrice` + `PurchaseOrder`→`GRN` + the immutable
`StockMovement` ledger (balances derived, never stored) + `MaterialRequest` (site indents) + `Location`s.

## Verdict

**Current Materials module: ~4.5 / 10 — the least-upgraded major module in the app**, sitting at the
pre-overhaul baseline the others each started from. The **foundations are correct and safe** (don't regress):
RBAC money-stripping has **no leak** (`purchasePrice`/PO `rate`/`totalValue`/`valueAtCost` never reach EMPLOYEE —
`stripPricing` on the one employee-reachable read, everything else `requireAdmin`-gated), the `StockMovement`
ledger is genuinely append-only (zero update/delete), and stock-on-hand is a correct sum of signed movements
(`deriveBalances`). But the entire **presentation / scale / insight** layer is missing, plus a cluster of real
defects.

**After P0 → P2: ~8.5 / 10.** All dimensions at/near target (PO/vendor detail + admin tab-split deferred).

| Dimension | Start | Now | Target |
|---|---|---|---|
| Ledger & balance correctness (money-stripping / immutability / derivation / over-issue) | 8.5 | 9.0 | 9.0 |
| List UX (search/filters/KPIs/pagination) | 2.0 | 9.0 | 9.0 |
| Lifecycle & status correctness (request states / audit / GRN#) | 3.0 | 9.0 | 9.0 |
| Stock-movement ledger & history (the activity-timeline analogue) | 1.0 | 9.0 | 9.0 |
| Analytics & reporting (valuation / low-stock / PO-aging / spend) | 1.0 | 8.5 | 8.5 |
| Detail pages (item ✓ · PO/vendor deferred) | 1.0 | 7.5 | 8.5 |
| Detail UX / a11y / density | 3.5 | 8.5 | 8.5 |

---

## P0 — Bugs & blockers ✅ SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **51 Playwright** · `verify-materials-p0` (20 checks incl. RBAC no-leak) · control-flow regression · browser-verified (admin **and** employee).
- **P0-1 Uncapped lists → paginated.** `listItems` now returns `{items,nextCursor}` with cursor + search +
  category filter, deriving balances **only for the page's items** (ledger scan scoped by `itemId`, no longer
  whole-table) + `/api/materials` GET + client "Load more" (`stock-list.tsx`). Admin sublists capped. Added
  `itemOptions` (dropdowns, no scan) + `materialCategories` (tabs).
- **P0-2 Dead `MaterialRequest` statuses.** `setRequestStatus` (admin, audited) makes TRANSFERRED / CONVERTED_PO
  / REJECTED reachable (only PENDING was ever written) + controls in the requests UI.
- **P0-3 List parity.** KPI StatTiles (`materialsStats`: items · low-stock · open POs · **stock value ₹** admin) +
  search + category tabs + `EmptyState` + `loading.tsx`. *Honest note:* the **list** no longer scans the ledger
  (per-page derivation), but `materialsStats` still does **one FULL StockMovement pass per load** (and `stockAudit`
  one per audit) — acceptable at current volume, **not truly bounded** (the ledger grows without limit). The
  eventual fix is a materialized stock-balance snapshot → **tracked as P2-6 below.**
- **P0-4 Audited the 6 unaudited mutations** (`createVendor`, `setPOStatus`, `transferStock`, `consumeStock`,
  `createMaterialRequest`, `stockAudit`).
- **RBAC held:** `verify-materials-p0` asserts `purchasePrice` present for admin, **stripped for employee**
  (`listItems` + `/api/materials`), `stockValue` null for employee; control-flow regression confirms no leak +
  correct balance derivation after pagination.

## P0 — Bugs & blockers (original analysis)

| # | Defect | Evidence | Fix (pattern) |
|---|---|---|---|
| P0-1 | **All lists unbounded; worst = full-ledger scans.** `listItems`/`lowStockItems`/`stockAudit` each pull the **entire `StockMovement` table** into memory to derive balances (grows unbounded with history); `listVendors`/`listLocations`/`listPOs`/`listMaterialRequests` are uncapped `findMany`. Every one returns a bare array. | `materials.ts:14,62,80,119,239,249` | Cursor-paginate the item/stock list (`{items,nextCursor}` + `/api/materials` GET + "Load more"); derive balances **only for the page's items** (scope movements by `itemId in page`). Cap the admin sublists. Copy `listOrders`/`contracts-list.tsx`. |
| P0-2 | **Dead `MaterialRequest` statuses.** Only `PENDING` is ever written; **`CONVERTED_PO` / `TRANSFERRED` / `REJECTED` are never set** by any code (the exact Leads-`QUOTE_REQUESTED` bug class) — the request lifecycle is inert. | `materials.ts:235`; badge reads them `materials-tools.tsx:309` | `setRequestStatus` + wire fulfilment: transfer-against-request → `TRANSFERRED`, convert-to-PO → `CONVERTED_PO`, reject → `REJECTED`. Audited. Copy `setLeadStatus`/`setOrderStatus`. |
| P0-3 | **Bare monolithic list.** No KPI tiles, no search, no filter tabs, no `EmptyState` on the stock table, no `loading.tsx`/`error.tsx`, no `/api/materials`. | `page.tsx` (no `searchParams`) | KPI StatTiles (`materialsStats`: items · low-stock · open POs · **stock value ₹** admin) + search + category/low-stock tabs + `EmptyState` + boundaries. Copy the Service `page.tsx`. |
| P0-4 | **6 unaudited mutations**, incl. `setPOStatus` (status change), `stockAudit` (ledger variance writes), `consumeStock` (site issue → project actuals), `transferStock`, `createVendor`, `createMaterialRequest`. Violates "audit every mutation". | `materials.ts:70,114,190,208,233,266` | Add `logAudit` to each (movements carry only a `note` today). Cheap, correctness. |

---

## P1 — World-class core ✅ P1-1 + item-detail + P1-3 SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **53 Playwright** · `verify-materials-p1` (18 checks incl. RBAC no-leak + transfer-ordering determinism) · browser-verified (admin **and** employee).
- **P1-1 Stock-movement ledger (the centerpiece)** — `itemLedger()` surfaces the append-only ledger (previously
  read only to derive balances): every movement newest-first with a **running on-hand total**, from→to locations,
  refDoc, `valueAtCost` (admin), note. Ordered `[createdAt asc, id asc]` — the `id` tiebreak makes the running
  balance **deterministic** across a transfer's paired OUT+IN rows (they share one transaction `createdAt`; the
  OUT is created first so its cuid sorts earlier → OUT-before-IN, no phantom intermediate balance). Regression-guarded. Rendered on a new **`materials/[id]` item detail** page — item names in the
  stock list now link to it. RBAC: `valueAtCost` / `vendorPrices` / `purchasePrice` are all ADMIN_ONLY_KEYS →
  stripped for EMPLOYEE (verified: employee still sees the ledger + balances, no money).
- **Item detail (P1-2, detail-page half)** — on-hand by location, vendor-price history (admin), + the ledger.
  *PO/vendor detail pages + the admin-section tab-split are deferred* (the ledger was the highest-value gap;
  logged as a follow-up).
- **P1-3 A11y + feedback retrofit of `materials-admin.tsx`** — raw placeholder-only inputs → auto-wiring `Field`
  (labels now wired for screen readers + `getByLabel`), inline `msg` banner → `toast` (success/error), buttons
  gained `loading` state, and the raw `<button>` Send/Receive controls became `Button` primitives. (Fixed a
  pre-existing lint warning in the file as a side effect.)

### P1-1 · Stock-movement ledger (the highest-value gap)
- The append-only `StockMovement` ledger — the single most domain-appropriate "activity timeline" in the whole
  CRM — is **read only to derive balances and never surfaced**. Add a **per-item movement history** (GRN in →
  transfers → consume → adjust → return, with running balance, ₹ `valueAtCost` admin-only) and a global recent-
  movements feed. *Pattern:* `orderActivity`/`amcActivity` → the v15 timeline rail, but table-shaped for a ledger.

### P1-2 · Item / PO detail pages + tab-split
- There are **no detail pages** (item, PO, vendor) and the admin view is a **6-card monolithic scroll**. Add a
  `materials/[id]` item detail (spec, on-hand by location, vendor prices, movement ledger, reorder) and split the
  main page into **Stock / Purchase Orders / Requests / Audit** tabs. *Pattern:* the Service `tab-panels.tsx` +
  Projects/Service detail pages.

### P1-3 · A11y + feedback retrofit of `materials-admin.tsx`
- `materials-admin.tsx` (Add Item / Add Vendor / Raise PO) uses **raw placeholder-only inputs (no labels)**, an
  **inline `msg` banner instead of `toast`**, and buttons with **no loading state** (some are raw `<button>`).
  Retrofit to `Field` + `toast` + `Button loading`. *Pattern:* the Proposals v16-P2 toast migration + the already-
  clean `materials-tools.tsx` in the same module.

### P1-4 · Materials analytics ✅ SHIPPED & VERIFIED
`/materials/analytics` + `materialsAnalytics()`. Gate: `tsc` 0 · lint 0 · 72 unit · **55 Playwright** ·
`verify-materials-p1-4` (20 checks vs raw DB — incl. controlled PO-aging fixtures at 3d/15d/45d exercising all
three buckets + vendor-spend grouping) · browser-verified. KPIs: Items · Low stock · **Stock value ₹**
(admin) · **Issued-to-sites ₹** (consumption, admin); **Stock-value-by-category** (admin) · **Open-PO aging**
(≤7d/8–30d/>30d, counts) · **Top vendor spend** (admin) · **Ledger activity** (movement counts). Every ₹ surface
(stockValue / categoryValue / vendorSpend / consumptionValue) is admin-only — null/[] for EMPLOYEE, verified no
leak. Same full-ledger pass as `materialsStats` (P2-6 snapshot note applies).

### P1-4 · Materials analytics — original analysis
- `materialsAnalytics()` + page: **stock valuation ₹** (Σ on-hand × purchasePrice, admin) · **low-stock count** ·
  **PO-aging** (open POs by age/status) · **vendor spend** (Σ received PO value by vendor, admin) · **consumption**
  (Σ CONSUME by period). Admin money gated (like `amcAnalytics.recurringRevenue`). *Pattern:* `amcAnalytics` +
  `/service/analytics` (reuse `compactINR`).

---

## P2 — Lifecycle & polish ✅ P2-5 + over-issue guard SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **55 Playwright** · `verify-materials-p2` (10 checks) · control-flow regression · cron low-stock smoke · browser-verified.
- **P2-5 Wired the dead automation** — **Low-stock cron digest**: `lowStockItems` (dead code — never called) now
  runs in the cron (`job=lowstock`, gated admin WhatsApp digest; smoke-verified count 5, `digestSent:false` until a
  token is set). **GRN sequential number**: `grnNo` (migration `grn_number` + `GRN` DocKind/prefix `GEC-GRN`)
  allocated in the receive `$transaction` — race-free, unique, audited (closes the sequential-docs gap). **PO Excel
  export** added to the Purchase Orders card.
- **Over-issue guard (P2-6 correctness half)** — `transferStock` / `consumeStock` now reject issuing more than the
  source location holds (`onHandAt` derives the scoped balance) → **no more negative balances**. Verified: valid
  issues succeed, over-issues throw; control-flow regression confirms legitimate GRN→transfer→consume still works.
  Caller audit: the only production callers are the two interactive admin actions (`transferAction`/`consumeAction`
  — the Transfer / Issue-to-Site UI); no seed/cron/erection/closeout path issues stock programmatically, so the new
  throw can't break a non-interactive flow. *Note:* the guard is **check-then-act across the tx boundary** (reads
  on-hand, then writes in a separate `$transaction`) — acceptable at this single-tenant/low-concurrency scale, not a
  hard serialization guarantee.
- **Deferred (P2-6 scaling half):** the **materialized stock-balance snapshot** is intentionally *not* built — the
  per-load full-ledger scan in `materialsStats`/`materialsAnalytics` is fine at current volume (documented); building
  the snapshot now would be premature with real migration risk. Remains a documented future item.

### P2-5 · Wire the dead automation
- **Low-stock cron digest** — `lowStockItems` is **dead code** (never called; cron only *mentions* it in a
  comment). Wire it into the cron (gated WhatsApp/digest like the AMC branch). **GRN sequential number** — GRNs
  have no `grnNo` (only a cuid); add `allocateNumber(…, "GRN", …)` in the receive transaction (the "sequential
  docs" non-negotiable). **Excel export on every list** — today only the stock table exports; add POs / requests /
  the movement ledger.

### P2-6 · Scaling: materialized stock-balance snapshot (deferred from P0)
- `materialsStats` + `stockAudit` do a **full StockMovement scan per call** — O(all-movements), and the ledger is
  append-only-forever. Fine now, but the correct fix is a periodic/materialized per-item-per-location balance
  snapshot (updated on movement, or a scheduled rebuild) so stats/valuation/low-stock read a small table, not the
  whole ledger. Pairs naturally with P1-4 analytics (same reads). Also worth here: an **over-issue guard** on
  `transferStock`/`consumeStock` (they don't currently prevent issuing more than on-hand → negative balances).

**Non-negotiables:** `purchasePrice`/PO `rate`/`totalValue`/`valueAtCost` stay ADMIN-only (stripped/gated — already
correct, keep on every new read path); `StockMovement` stays append-only (corrections via new ADJUST/reversal
movements — never update/delete); balances always derived, never stored; Decimal money; sequential PO/GRN numbers
never reused; audit every mutation (P0-4 closes the current gap).

## Suggested sequence
1. **P0** — paginate the stock list (+`/api/materials`) & cap sublists + list parity (KPIs/search/tabs/boundaries)
   + wire the dead `MaterialRequest` statuses + audit the 6 mutations. *Correctness + scale.*
2. **P1-1 + P1-2 + P1-3** — stock-movement ledger + item/PO detail + tab-split + a11y/feedback retrofit. *Level with the others.*
3. **P1-4** — analytics (valuation / low-stock / PO-aging / vendor spend / consumption).
4. **P2** — low-stock cron + GRN numbering + export-everywhere.
