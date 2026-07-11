# Dashboard & Reports — World-Class Gap Analysis & Upgrade Plan

Both read-only aggregation surfaces. The live home is `dashboard/page.tsx` → `getRichDashboard`
(`dashboard-rich.ts`). **`dashboard.ts` (`getDashboard`) is dead code** (zero callers) and contains a **latent money
bug** (sums milestone `amount` not balance, drops UPCOMING) — masked only because it's unreachable.

## Verdict

**Dashboard ~6 / 10 · Reports ~4 / 10.** RBAC is **correct and server-enforced on both** (the non-negotiable): the
employee dashboard strips `revenue`/`revenueSeries`/`topClients` in the service and only fetches receipts for admin;
reports is double-gated `requireAdmin` + sell-side only. **No money leak.** But the dashboard does unbounded scans
and is operationally stale, and reports is the least-upgraded surface (2 reports, no filters/PDF/loading).

| Dimension | Now | Target |
|---|---|---|
| RBAC & money safety (both) | 9.0 | 9.0 |
| Dashboard scale (unbounded scans) | **3.0** | 8.5 |
| Dashboard content (reflects new modules) | **4.0** | 8.5 |
| Reports content (GST/collection/coverage) | **3.0** | 8.5 |
| Reports UX (filters / PDF / loading) | **3.0** | 8.5 |
| Consistency (one receivables definition) | **4.0** | 9.0 |

---

## P0 — Correctness, scale & dead code ✅ SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **63 Playwright** · `verify-dashboard-p0` (13 checks) · browser-verified.
- **P0-1 Deleted dead `dashboard.ts`** (zero callers, latent money bug) — build clean, confirming no imports.
- **P0-2 Bounded the dashboard scans** — the two unbounded `findMany` (all orders + nested; whole receipt ledger)
  → **five bounded queries**: ACTIVE-only orders (select milestone status) for health, 4 recent orders for
  recentProjects, top-4-by-value for topClients, `receipt.aggregate` for the revenue total, and receipts in the last
  7 months for the series. Verified the numbers are unchanged (revenue == Σ receipts; lists capped at 4; health
  reconciles) and the **RBAC money gate still holds** (employee revenue/topClients null/[], no leak).
- **P0-3 `reports/loading.tsx`** added.

## P0 — Correctness, scale & dead code (original analysis)

| # | Defect | Evidence | Fix |
|---|---|---|---|
| P0-1 | **Delete dead `dashboard.ts`** — zero callers, and it carries a latent money bug (sums `amount` not balance, drops UPCOMING). Remove so it can't be revived. | `dashboard.ts` | Delete the file (confirm no imports). |
| P0-2 | **Unbounded dashboard scans on every home load** — `orders` (with nested stages+milestones) and `receipts` are `findMany` with **no take**, to display 4 rows + a total. Heaviest page in the app. | `dashboard-rich.ts:38-45,47` | Bound/scope: `take` the orders needed (recent + counts via `count`/`aggregate`); sum receipts via `aggregate` not a full pull. |
| P0-3 | **`reports/` has no `loading.tsx`/`error.tsx`** (falls back to group-level); no date-range filter. | `reports/page.tsx` | Add `loading.tsx`; a date-range filter on receivables/references. |

## P1 — Wire the new modules + one receivables definition ✅ SHIPPED & VERIFIED

Gate: `verify-dashboard-p1` (8) + browser. `getOpsKpis` **reuses** `orderStats`/`amcAnalytics`/`materialsStats`/`erectionStats` (not re-aggregated → tiles always match each module's page; verified equal) → an across-the-business KPI strip on the dashboard (Receivables · AMC run-rate · Stock value · Budget overruns), money admin-only. Receivables unified: `getReceivables` == `orderStats`/`projectAnalytics` (all non-PAID); GST + collection reports shipped with Invoices P1. **Scaling note (advisor-flagged):** reuse means the admin home now triggers the module analytics' scans (incl. the `materialsStats` full `StockMovement` pass logged as Materials P2-6) — same bounded-in-practice class; revisit with the materialized-balance snapshot, not now.


### P1-1 · Dashboard reflects the upgraded modules
- The home predates Materials/Erection/AMC-revenue upgrades: **no stock value, no erection budget burn, no AMC
  recurring-revenue run-rate, no receivables KPI**. Wire tiles from the existing analytics services
  (`orderStats`/`amcAnalytics`/`materialsStats`/`erectionStats`) instead of re-aggregating. Replace the two
  **synthetic** widgets (decorative "Site Health", hardcoded `efficiencyPct: 92`) with real telemetry or drop them.

### P1-2 · One receivables definition + GST/collection reports
- Receivables is computed **three different ways** (reports vs projectAnalytics vs the dead dashboard.ts) — unify on
  one (the `orderStats`/`projectAnalytics` "all non-PAID, outstanding>0" definition). Add a **GST-summary report**
  (for GSTR filing — the highest-value missing artifact) + a **collection report** (collected vs outstanding, one
  view) + Tally/Excel export. *Coordinate with Invoices P1-2.*

**Non-negotiables:** employee dashboard never receives admin-only money (keep the `dashboard-rich.ts:177` strip +
admin-only receipt fetch); reports stays `requireAdmin` + sell-side; read-only (no audit). Dashboard tiles must
**match** the per-module analytics they mirror (no tile-vs-page incoherence).

## Suggested sequence
1. **P0** — delete dead `dashboard.ts` + bound the dashboard scans + reports `loading`/date-filter.
2. **P1** — wire new-module KPIs (reuse analytics services) + unify receivables + GST/collection reports.
