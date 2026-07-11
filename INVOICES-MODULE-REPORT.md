# Invoices Module — World-Class Gap Analysis & Upgrade Plan

Money-critical. Same treatment as the other modules. `Invoice` is minted from a `PaymentMilestone` (1:1),
carries immutable GST (`computeGst`), a sequential `invoiceNo` (never reused), and a branded HMAC-secured PDF.
`Receipt` is the append-only money-in ledger under the milestone.

## Verdict

**Current Invoices module: ~2.5 / 10 — the lowest in the app**, because it is *money-out-the-door* and carries
**active correctness/compliance bugs**, not just missing UX. The **core engine is sound** (don't regress):
race-free sequential numbering, Decimal GST with rounding-drift handled + unit-tested, forward-invoice immutability
(only `pdfUrl` mutates), append-only receipts, whole module admin-only (zero cost/margin leak), world-class PDF
security (HMAC print token). But the reversal path and list/insight layers are broken or absent.

| Dimension | Now | Target |
|---|---|---|
| Core money engine (numbering / GST math / immutability / PDF security) | 8.5 | 9.0 |
| Credit-note / reversal correctness | **1.5** | 9.0 |
| GST compliance (place-of-supply / IGST / customer GSTIN) | **3.0** | 8.5 |
| List UX (KPIs / search / pagination) | **1.5** | 9.0 |
| Analytics & GST-filing report | **1.0** | 8.5 |
| Audit coverage | **5.0** | 9.0 |

---

## P0 — Money bugs & blockers ✅ SHIPPED & VERIFIED

Gate: `tsc` 0 · lint 0 · 72 unit · **62 Playwright** · `verify-invoices-p0` (17 checks) · sell+execute regression · credit-note PDF 200 · browser-verified (admin + employee gate).
- **P0-1 Credit-note cluster fixed** — `createCreditNote` now **fully negates** total + `gstBreakup` (was copied
  positive) + line item (taxable-exclusive, was tax-inclusive), links via **`creditNoteOfId`** FK (migration
  `invoice_credit_note_link`), is **tenant-scoped**, is **audited**, guards **CN-of-CN**, and — the highest-value
  catch — guards **over-reversal** (one CN per invoice; calling twice would have booked −2×). The **reconciliation
  invariant** (`lineItems + cgst+sgst+igst == total`, all ≤ 0) is the verify spine — exactly what was broken. The
  branded credit-note PDF re-verified 200 with the negated shape.
- **P0-2 `addReceipt` over-payment guard** — rejects a receipt ≤ 0 or exceeding the milestone balance (fixed a
  latent test that over-paid an odd milestone by ₹1 via double round-up; the real fix pays the exact remainder).
- **P0-3 List parity** — `listInvoices` → `{items,nextCursor}` + `/api/invoices` GET + `invoiceStats` KPI tiles
  (count · invoiced-net ₹ · **outstanding ₹** · credit notes) + search + `EmptyState` + Load-more.
- **P0-4 Tenant-scoped** the milestone lookup in `createInvoiceFromMilestone` (kept the `invoice` eager-load → dedup
  guard still holds, verified).
- **RBAC:** whole module admin-only (employee gated at the page); no cost/margin leak (unchanged).
- **Coherence note (advisor-caught):** `invoiceStats.outstanding` counts balance on **invoiced milestones only** —
  a distinct number from `reports.getReceivables` (status-whitelist) and `orderStats`/`projectAnalytics` (all non-PAID).
  The tile is deliberately labeled **"Invoiced outstanding" · "on invoiced milestones"** so it doesn't read as the
  same "Receivables" figure. Unifying the four receivables definitions is **P1** (tracked in the Dashboard/Reports
  report). Also P1: a credit-noted invoice's milestone still counts in this figure (CN has no milestoneId).

## P0 — Money bugs & blockers (original analysis)

| # | Defect | Evidence | Fix |
|---|---|---|---|
| P0-1 | **Credit-note defect cluster** — `createCreditNote` is **unaudited**; copies `gstBreakup` **unchanged** (positive tax on a negative total → wrong for filing); line item uses tax-**inclusive** negated total (double-counts tax); **no `companyId` scope** (cross-tenant lookup); no `creditNoteOfId` FK; no `isCreditNote` guard (credit-note of a credit-note). | `invoice.ts:92-117` | Negate `gstBreakup`; line item = taxable-exclusive; add `logAudit`; scope by `companyId`; add `creditNoteOfId` FK (migration) + guard `orig.isCreditNote`. |
| P0-2 | **`addReceipt` has no over-payment / sign guard** — can record a receipt exceeding the milestone balance, or a negative receipt (corrupts the money-in ledger + milestone status). | `order.ts:610` | Guard `0 < amount ≤ outstanding`. |
| P0-3 | **List is cap-200, cursorless, bare** — no `{items,nextCursor}`, no `/api/invoices` GET, no KPI tiles (outstanding/paid/count derivable from milestone↔receipts), no search, no `EmptyState`/`loading`/`error`. Invoice #201 is silently invisible. | `invoice.ts:82`; `invoices/page.tsx` | Cursor pagination + `/api/invoices` GET + `invoiceStats` KPI tiles + search + `EmptyState` + boundaries. Copy the Service list. |
| P0-4 | **Tenant-isolation gap** in `createInvoiceFromMilestone` milestone lookup (`findUnique` by id, no `companyId`). | `invoice.ts:23` | Scope milestone lookup by `order.companyId`. |

---

## P1 — GST compliance + analytics ✅ SHIPPED & VERIFIED

Gate: `verify-invoices-p1` (14) + browser + reports GST reconciles. **Real IGST** — `Order.clientStateCode`/`clientGstin` (migration `order_client_gst`) drive place-of-supply, so inter-state → IGST / intra-state → CGST/SGST (verified both). **⚠️ Caveat (advisor-flagged):** correct IGST is now *possible per order* but not *default* — `clientStateCode` is nullable with no backfill, so an **unset** order still defaults to intra-state CGST/SGST at invoice time with no warning. The admin must set the client state on the project first. **Follow-up (deliberately deferred — has data implications):** seed `clientStateCode` from the lead/proposal address at Won→Order, or warn-when-null at invoice creation (would block a legitimately-intra-state invoice whose code is merely unset). Also: `getGstSummary` groups by rate only — split by supply-type before it backs an actual GSTR export. a `GstControl` on the project Overview sets them; the customer GSTIN prints on the invoice. **GST-filing report** (`getGstSummary`, grouped by rate, **nets negated credit notes**, reconciles taxable+GST==total) + **collection report** (`getCollectionSummary` — invoiced-net vs collected vs canonical receivables) on `/reports` with Export GST. (The 4 receivables definitions collapsed: `getReceivables`'s whitelist == all-non-PAID == `orderStats`/`projectAnalytics`; only `invoiceStats` is deliberately distinct + relabeled.)


### P1-1 · Place-of-supply / IGST / customer GSTIN (the compliance core)
- The schema has **no customer state field** (only `Company.stateCode`), so `taxTypeFor(company, company)` is
  **always CGST_SGST** — every inter-state supply is mis-taxed and the **IGST branch is unreachable**. Customer
  **GSTIN is never captured or printed** (B2B tax-invoice defect). Add `clientStateCode` + `clientGstin` (on `Order`,
  seeded from proposal/lead at Won→Order), thread into `createInvoiceFromMilestone` (`placeOfSupplyStateCode`), and
  print the GSTIN + place-of-supply on the bill. *This is a real filing fix, not UI.*

### P1-2 · Invoice analytics + GST-filing report (`/invoices/analytics` + reports)
- `invoiceStats`/analytics: **collection rate**, **outstanding aging**, **paid-this-month**, and a **GST summary for
  GSTR filing** (taxable, CGST/SGST/IGST by rate, period) — the single highest-value money artifact, absent today.
  *Pattern:* `materialsAnalytics` + a Tally/Excel export.

### P1-3 · Invoice activity + status lens
- No invoice timeline; no draft/sent/paid status (Invoice has no status field — paid/outstanding is derivable from
  the linked milestone's receipts). Surface a derived status + a per-invoice money-in trail (reuse `orderActivity`
  receipt events).

**Non-negotiables:** sequential `invoiceNo` never reused; GST immutable once issued; forward invoices immutable
(reverse via credit note, never edit/delete); receipts append-only; whole module admin-only; PDF HMAC untouched.

## Suggested sequence
1. **P0** — fix the credit-note cluster (+`creditNoteOfId` migration) + `addReceipt` over-payment guard + list
   parity (pagination/`/api/invoices`/KPIs/search) + tenant-scope the lookups. *Money correctness + scale.*
2. **P1-1** — customer state/GSTIN + real IGST (schema + Won→Order + print).
3. **P1-2** — analytics + GST-filing report.
