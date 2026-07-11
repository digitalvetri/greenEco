# Clients Module — World-Class Gap Analysis & Upgrade Plan

A read-only surface: there is **no `Client` model** — a "client" is a projection of a `Lead` that has a proposal
(`listClients` = `lead.findMany({ where: { proposal: { isNot: null } } })`). No mutations, so no lifecycle/audit
work — the gaps are list-UX, true 360 aggregation, and pagination.

## Verdict

**Current Clients module: ~3.5 / 10.** RBAC is clean (employee-scoped + `stripPricing` on the 360) and the detail
timeline concept is a real seed. But the list is uncapped and bare, and a "client" is **one lead's journey**, not
the customer's full relationship — two projects for one customer show as two clients (no dedup).

| Dimension | Now | Target |
|---|---|---|
| RBAC & money safety | 8.0 | 9.0 |
| List UX (KPIs / search / pagination / export) | **1.5** | 9.0 |
| Identity / aggregation (true 360) | **2.0** | 8.5 |
| Detail 360 (all engagements + LTV) | **4.0** | 8.5 |
| Analytics (LTV / top-by-revenue) | **1.0** | 8.0 |

---

## P0 — Scale & list parity ✅ SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **63 Playwright** · `verify-clients-p0` (11 checks) · browser-verified. `listClients`
→ `{items,nextCursor}` + cursor + search + `/api/clients` GET + `ClientsList` "Load more"; `clientStats` KPI tiles
(clients · active projects · **lifetime value ₹** — sell-side, role-scoped) + `ClientsSearch` + `EmptyState` +
`loading.tsx`. Employee scoping + `getClient360` stripping preserved (verified no admin-only cost key leaks). 35
clients in seed — the uncapped list was a real scaling gap.

## P0 — Scale & list parity (original analysis)

| # | Defect | Evidence | Fix |
|---|---|---|---|
| P0-1 | **Uncapped bare list** — `listClients` is an unbounded `findMany`, plain array, no `/api/clients` GET. No KPI tiles, no search, no `EmptyState` primitive, no `loading`/`error`. | `client.ts:64`; `clients/page.tsx` | `{items,nextCursor}` + `/api/clients` GET + Load-more + `clientStats` KPIs (total clients · active projects · **lifetime value ₹**) + search + `EmptyState` + `loading.tsx`. Copy the Service list. |

## P1 — True 360 ✅ analytics SHIPPED & VERIFIED

Gate: `verify-clients-p1` (8) + browser. `clientAnalytics` + `/clients/analytics` — the **phone-keyed dedup** the flat list doesn't do: unique customers (deduped by phone), repeat customers, LTV, top clients by revenue. Role-scoped, sell-side. *(List-level dedup + full cross-lead 360 detail remain a smaller follow-up — the analytics delivers the deduped insight.)*


### P1-1 · Client identity / aggregation
- A client should aggregate **all** of a customer's leads + proposals + orders + AMC contracts + invoices by a stable
  identity (dedup on phone). Today each lead is a separate client. Either a lightweight aggregation keyed on phone,
  or (bigger) a real `Client` model (the orphan `ContactPerson.clientId` was intended for this). *Start with
  phone-keyed aggregation — no schema change, immediate value.*

### P1-2 · True 360 detail + analytics
- Unify all engagements on the detail; add AMC/service-contract + invoice events to the timeline; show **aggregated
  total contract value + receivables** (admin). `/clients/analytics`: LTV, top clients by revenue, by-segment
  (company-wide, sell-side). *Pattern:* the Materials `[id]` detail + `materialsAnalytics`.

**Non-negotiables:** employee scoping (own/assigned) + `stripPricing` on any money surface; sell-side only (no
budget/margin/cost); read-only (no mutations to audit).

## Suggested sequence
1. **P0** — pagination + `/api/clients` + list parity (KPIs/search/EmptyState/loading).
2. **P1** — phone-keyed identity aggregation + true 360 detail + `/clients/analytics`.
