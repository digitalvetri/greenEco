# Proposals Module — World-Class Gap Analysis & Upgrade Plan

Same treatment applied to Leads (see `LEADS-MODULE-REPORT.md`). Two deep passes: a full inventory of the
Proposals module + a comparison against the now-upgraded Leads (v7–v15) and adjacent modules. Every
recommendation names the **in-repo pattern to copy** — a build sheet, not generic advice.

## Verdict

**Current Proposals module: ~6.0 / 10.** The *core* is genuinely strong and better-audited than most:
version-bump-on-send (immutable versions preserve old PDFs), AI drafting with a WON-context learning loop,
an admin margin-guard on Approve & Send, and a clean Won→Order transaction (order + SITE location + budget
+ 9 stages + milestones from payment terms). But the module is **roughly where Leads was before eight
iterations** — a status-tab-only list and a single-version editor — and it carries the **same two classes of
bug Leads had**, plus several stored-but-hidden fields.

| Dimension | Now | Target |
|---|---|---|
| Quoting core (versioning / AI / margin / Won→Order) | 8.0 | 9.0 |
| Version history & activity | **2.0** | 9.0 |
| List UX (search / filters / KPIs / pagination) | **3.5** | 9.0 |
| Lifecycle & status correctness | **4.0** | 9.0 |
| Analytics & reporting | **3.0** | 8.5 |
| Engagement (send tracking / comms / docs) | **2.0** | 8.0 |
| Editor UX / a11y / mobile | **5.0** | 8.5 |

---

## P0 — Bugs ✅ FIXED & VERIFIED

Gate: `tsc` 0 · lint 0 · **72 unit** (+5 aging) · **34 Playwright** · `verify-proposals-p0` (12 checks) ·
browser-verified. Both dead statuses reachable, list paginates, and the list is now on par with the Leads list.

| # | Fix shipped | Proof |
|---|---|---|
| P0-1 | **Dead statuses fixed.** `setProposalStatus` (admin, audited) makes **UNDER_NEGOTIATION** reachable (button on the editor) + **reopen from LOST**. **EXPIRED** is now a derived state — `proposalExpiry()` (pure, unit-tested) drives an "Expiring" worklist tab + per-row Expired/Expires-Nd badges from `validityDays` (which existed but was never surfaced). | transitions + reopen-clears-reason ✓; WON locked ✓; employee blocked ✓ |
| P0-2 | **Pagination.** `listProposals` now returns `{items, nextCursor}` with cursor paging + search + `/api/proposals` GET + client "Load more" (was a silent 100-row cap). | page-2 via cursor ✓; search 24→8 ✓ |
| P0-3 | **List UX lifted** to the Leads bar — KPI StatTiles (In play · Awaiting finalisation · Expiring soon · Open pipeline ₹ + won count), search box, `EmptyState`, expiry badges. `proposalStats()`. | KPI tiles + search render ✓ |

## P0 — Bugs (original analysis)

| # | Defect | Evidence | Fix (pattern) |
|---|---|---|---|
| P0-1 | **`UNDER_NEGOTIATION` & `EXPIRED` are dead statuses** — both have list tabs + dashboard counts but **no code ever sets them** (identical to the leads `QUOTE_REQUESTED` bug fixed in v7). | `schema.prisma` enum + `page.tsx` tabs + `dashboard-rich.ts` counts; no writer anywhere | Wire an explicit "Mark under negotiation" transition; compute/derive **EXPIRED** from `validityDays` (an aging engine like `leadUrgency`). |
| P0-2 | **Proposals beyond 100 are invisible** — `listProposals` hard-caps `take: 100` with no cursor (same class as the leads-50 cap). | `proposal.ts` `listProposals` | Add cursor pagination + a client "Load more" (copy `leads-list.tsx` + `nextCursor`). |
| P0-3 | **Version history is dropped by the UI** — `getProposal` loads *all* versions but the editor only ever renders the current one, so bump-on-send (the module's best feature) is invisible; you can't see v1→v2 or the price history. | `[id]/page.tsx` passes only current version | Surface a version/activity timeline (P1-1). |

---

## P1 — World-class core (copy the Leads v7–v15 patterns)

### P1-1 · Version + activity timeline ✅ SHIPPED
Gate: `tsc` 0 · lint 0 · 72 unit · 34 Playwright · `verify-proposals-p1` (8 checks) · browser-verified.
- `proposalActivity()` merges created → **each version (v{n} + changeNote + grand-total delta)** →
  AI-generation → approve & send (with approver) → the proposal's follow-ups (loaded by getProposal but
  never shown until now) → status changes → Won/Lost. Newest-first, company-scoped.
- Rendered by `proposal-timeline.tsx` (the v15 two-column rail), shown in a new **Activity tab** — which
  also delivers the report's #1 editor declutter (Proposal | Activity split via the `Tabs` primitive).
- **The killer feature works:** the version events show the **negotiation price trail** — e.g. v1 ₹1,18,000
  → v2 **↑ ₹23,600** → ₹1,41,600 with the change note. Verified in the browser.

### P1-1 · Version + activity timeline — original analysis
- Proposals have the **richest native timeline in the app**: every `ProposalVersion` carries `versionNo`,
  `changeNote`, `aiGenerated`, `approvedById`, `grandTotal`, `createdAt`, and `saveVersion` already
  bumps-with-changeNote on every post-SENT edit. Merge: created → version saves (title `v{n}` + changeNote,
  **grand-total delta** = the killer "negotiation price history") → AI-generated → Approve & Send → the
  already-loaded-but-never-shown **follow-ups** → status changes (audit) → Won/Lost.
- *Pattern:* `proposalActivity()` modeled on `leadActivity()` (`lead.ts`), rendered by the **v15 two-column
  flex `activity-timeline.tsx`** (reuse that layout — it fixed the icon-clipping bug; don't reinvent).

### P1-2 · A list that scales
- Add search, KPI **StatTiles** (in play · awaiting approval · expiring soon · won-this-month · pipeline ₹),
  an **aging/expiry badge** (`validityDays` exists but is never surfaced — a SENT proposal past
  `createdAt + validityDays` → "expires in N d"/EXPIRED), pagination, `EmptyState`, and a value/plant-type
  filter. *Pattern:* `leads-filters.tsx` + `leadStats()` + `leadUrgency()` + `StatTile`.

### P1-3 · Lifecycle correctness
- Wire **UNDER_NEGOTIATION** (fixes P0-1), **reopen from LOST** (leads reopen; `markLost` is terminal today),
  and **archive/soft-delete** (`Proposal` has no `deletedAt` — add it). *Pattern:* `setLeadStatus`/`archiveLead`
  (forward-only, audited, admin+owner guard).

### P1-4 · Analytics ✅ SHIPPED
`/proposals/analytics` + `proposalAnalytics()`. Gate: lint 0 · 72 unit · **37 Playwright** ·
`verify-proposals-p2` (10 checks vs raw DB) · browser-verified. Win rate (count + **by value**), avg deal
size, open pipeline ₹, **AI-vs-manual win rate** (9/9 AI wins in the seed), avg quote→order cycle days,
why-we-lose, by-plant-type. Company-wide, sell-side only (est-cost/margin excluded → role-agnostic).

### P1-4 · Analytics — original analysis
- `proposalAnalytics()` → win rate **by value**, avg deal size, open pipeline ₹ (Σ grandTotal of
  SENT/UNDER_NEGOTIATION), quote→order conversion time, **AI-generated vs manual win rate** (`aiGenerated`),
  why-we-lose (`lostReason` already captured), by plant-type/technology/KLD-band. Gate margin (est-cost)
  analytics to admin. *Pattern:* `leadAnalytics()` + `/leads/analytics`; `amcDashboard()` is the same shape.

---

## P2 — Engagement & polish

### P2-5 · Documents on proposals ✅ SHIPPED
`ProposalDocument` model + `proposal-documents-card.tsx` (shared `Uploader`) in a new **Documents tab**.
`addProposalDocument`/`deleteProposalDocument`, included in `getProposal`. Verified `verify-proposals-p3`.

### P2-6 · Send tracking / comms ✅ SHIPPED
`sendProposalToClient(channel)` — sends the proposal (with the durable PDF link) to the lead's phone/email
via the wired providers (gated → "logged, not sent"), records a **`Communication` against the proposal**,
merged into the activity timeline. Migration made `Communication` polymorphic (`leadId?` + `proposalId?`) —
verified the leads comms are unaffected. Admin-only; "Send WhatsApp / Send email" buttons on SENT proposals.
⚠️ Live delivery untested (no keys). Verified `verify-proposals-p3` (8 checks) + browser.

### P2-7 / P2-8 · Editor polish + hidden fields ✅ SHIPPED
Gate: lint 0 · 72 unit · 38 Playwright · `verify-proposals-p4` (5 checks) · browser-verified.
- **A11y** — Basics fields retrofitted to the auto-wiring `Field` (`getByLabel` works, screen readers announce).
- **Feedback → toast** — the green-even-for-errors `msg` banner replaced with `toast`.
- **Mark-lost** — bespoke inline expander → shared `Dialog` + **`LOST_REASONS` picklist** (structured reasons
  now feed the "why we lose" analytics).
- **Editable payment terms + validity (P2-8)** — the big one: payment terms were AI-or-nothing but they
  **seed the order's milestones on Win**. Now a milestone editor (description / % / trigger, with a 100%-total
  check) + a validity field, saved with the BOQ under a single **"Save proposal"** button (consolidating two
  of the three saves). Verified end-to-end: custom 50/30/20 terms → 3 order milestones summing to the grand total.
- *Deferred (low value):* `DownloadPdfButton` swap (the print link works for all roles; the durable-PDF button
  is admin-only), full basics-save consolidation, and editable scope-of-work/technicalText.

### P2-7 · Editor declutter + a11y — original analysis
1. **Tab-split** the 555-line single-scroll editor into **Details / BOQ / Activity / Documents** (the `Tabs`
   primitive exists) — the single biggest declutter.
2. **Consolidate the three separate saves** (Save basics / Save BOQ / AI-implicit) + add a dirty-state guard
   (edits are silently lost on navigate today).
3. **Mark-lost → shared `Dialog` + `LOST_REASONS` picklist** (leads v10) instead of the bespoke inline expander.
4. **Errors styled as success** — the `msg` banner is green even for errors → switch to `toast`.
5. **Separate the admin est-cost/margin** out of the client-facing totals block into a labeled admin card.
6. **Use `DownloadPdfButton`** (token-authed, durable, rate-limited) instead of the raw `/print/*` link.
7. **A11y**: retrofit raw `<Label>` pairs to the auto-wiring `Field` (`useId`); BOQ inline inputs are sub-44px.

### P2-8 · Surface stored-but-hidden fields
- `terms`, `validityDays`, editable `paymentTerms` + `scopeOfWork`, manual `technicalText` editing, and BOQ
  `specification` are all stored/round-tripped but not viewable/editable (paymentTerms are AI-or-nothing yet
  they seed the order's milestones). A `TERMS_LIBRARY` constant exists but is unused in the UI.

---

## Suggested sequence
1. **P0** — dead statuses, pagination, (version history handled by P1-1). *Now it's not buggy.*
2. **P1-1 + P1-2 + P1-3** — timeline, list-that-scales, lifecycle. *Now it's level with Leads.*
3. **P1-4** — analytics.
4. **P2** — documents, send tracking, editor declutter + a11y, hidden fields. *Now it's world-class.*

**Non-negotiables to preserve:** `estimatedCost` stays ADMIN-only (stripped server-side); BOQ `rate` is the
sell price (visible); version immutability on/after SENT (bump, don't overwrite); the Won→Order transaction
and its milestone derivation; audit every mutation; Decimal money; sequential numbers never reused.
