# Leads Module — World-Class Gap Analysis & Upgrade Plan

**Scope:** the Leads / pre-sales module (`src/server/services/lead.ts`, `src/app/(dashboard)/leads/**`,
`Lead`/`FollowUp`/`Reference`/`ContactPerson` models). Compared against every other module in the app
and against the wastewater-industry domain the product serves.

> **Method:** three deep passes — (1) full Leads inventory, (2) feature comparison against Proposals /
> Projects / Invoices / Materials / Service, (3) spec + domain requirements. Every recommendation names
> an **existing in-repo pattern to copy**, so this is a build sheet, not generic CRM advice.
>
> **One caveat, stated honestly:** the master spec file itself is locked by macOS privacy protection in
> `~/Downloads` and couldn't be opened. The domain requirements below are reconstructed from the code's
> own `spec §7.1` annotations (which are consistent and reliable) — not the raw spec text. If you copy
> `ECOFLOW-MASTER-BUILD-SPEC-v1.0.md` into this repo folder, I can confirm the exact §7.1 field list.

---

## Verdict

**Current Leads module: 6.5 / 10.** It has a genuinely strong *field-sales spine* — voice-to-text
follow-ups (Tamil/English), GPS pinning, offline capture, phone dedup, one-tap call/WhatsApp,
reference tracking, and a clean convert-to-proposal handoff. That spine is better than most CRMs.

But it's **the least-evolved module in the app.** Proposals have versioning + AI + approval gates;
Projects have team assignment + stage engines + timelines; Service has SLA engines + KPI tiles;
Materials has multi-tab tooling. Leads is still **stacked cards + create-only forms**. It also carries
**three outright bugs** (below) and — the biggest lever — **captures none of the wastewater-specific
data (KLD, plant type, technology, water quality) as structured fields**, cramming it all into one
free-text box. Fixing that is what turns this from "a CRM that happens to sell STPs" into "the
category-defining wastewater sales system."

| Dimension | Now | Target |
|---|---|---|
| Field-sales capture (voice/geo/offline) | 8.5 | 9.5 |
| Data model richness (domain fields) | **3.0** | 9.0 |
| Pipeline & list UX (filters/views/pagination) | **4.0** | 9.0 |
| Lifecycle & editing | **3.5** | 9.0 |
| Qualification & scoring | **2.0** | 8.5 |
| Analytics & reporting | 5.0 | 8.5 |
| Communication (WhatsApp/email) | 4.0 | 8.5 |

---

## What's already strong (keep, don't touch)

- **Voice follow-ups** — `SpeakButton` (Web Speech, ta-IN→en-IN "Tanglish"), raw transcript retained.
- **Offline-first follow-ups** — `submitOrQueue` → IndexedDB replay (`lib/offline-queue.ts`).
- **GPS** on lead + follow-up; `SITE_VISIT` type — right for a site-visit-heavy business.
- **Phone dedup + override modal** with link to the existing lead.
- **Reference entity + ROI analytics** — correct for a referral/consultant/builder channel.
- **Idempotent, transactional, audited convert-to-proposal** (`convertToProposal`).
- **Cross-cutting wiring** already done: ⌘K search, dashboard tiles, notifications bell, cron digest.

---

## P0 — Bugs ✅ FIXED & VERIFIED

All three closed. **Gate: `tsc` 0 · lint 0 errors · 58 unit · 27 Playwright · `verify-leads-p0` (15 checks) · sell flow intact.**

| # | Defect | Fix shipped | Proof |
|---|---|---|---|
| P0-1 | **Leads beyond 50 were invisible** — list hard-capped at 50, cursor ignored. | Extracted the list into a client `LeadsList` with a **"Load more"** that uses the `nextCursor` the service already returned (`leads-list.tsx`; page passes first page + cursor + filter). | API page-2 via cursor returns a distinct lead ✓ |
| P0-2 | **`QUOTE_REQUESTED` was a dead status** — a tab that no code ever populated. | New forward-only `advanceLeadStatus()` in `lead.ts`: a `PRICE_DISCUSSION` follow-up advances NEW/IN_FOLLOWUP → **QUOTE_REQUESTED**; a later routine follow-up never regresses it. | Advances on price talk ✓ · doesn't regress ✓ · appears under the filter ✓ |
| P0-3 | **Leads were immutable after creation** — no edit, no `PATCH`. | `updateLead` service (RBAC-scoped, dedup-on-edit excluding self, audited) + `updateLeadAction` + **`PATCH /api/leads/[id]`** + dual-mode `LeadForm` + `/leads/[id]/edit` page + Edit button on detail. | Fields persist ✓ · collision→`{duplicate}` ✓ · override ✓ · EMPLOYEE blocked (no info-leak) ✓ · invalid→422 ✓ · UI edit e2e ✓ |

> Scope note: the edit form covers the **core lead fields** (name/address/phone/email/source/requirement/location).
> Editing contacts/reference is deferred to P1. A found-in-review hardening: `updateLead` collapses
> "not found" and "no access" into one message so it can't leak that a lead exists to someone who can't see it.

---

## P1 — World-class core (table stakes; every mature CRM leads module has these)

Each has a **proven pattern already in this repo** — this is copy-and-adapt, not net-new design.

> **Wave 1 shipped ✅** (ownership + list-that-scales + urgency). Gate: `tsc` 0 · lint 0 · 58 unit ·
> **29 Playwright** · `verify-leads-p1` (17 checks) · browser-verified (desktop + mobile, both roles).
> - **Ownership (P1-2)** — no migration (the repo keeps owner IDs as bare strings everywhere; a
>   `listCompanyUsers` lookup resolves names). Owner shown on every row + detail; admin **assign/reassign**
>   dropdown (`assignLead`, validates same-company + active, audited); **assignee filter + "My leads"**
>   toggle (admin-only — an EMPLOYEE is already hard-scoped). Verified: reassigning a lead *transfers
>   access* (previous owner loses it).
> - **List that scales (P1-3)** — debounced **search box** + **Source / Owner** filters (all in the URL,
>   compose with tabs, survive "Load more"). Proven to change the result set (all 52 → Price 3 → CallIn 6).
> - **Urgency (P1-5)** — per-row `leadUrgency` badges (Overdue Nd / Un-actioned Nd / No next-date, icon+colour)
>   + a **KPI tile header** (New / Due today / Going cold / Converted this month), RBAC-scoped.
> - **Bug caught in-browser (not by tsc):** the client list kept stale rows on a soft-nav filter change
>   (`useState` seeds once); fixed by keying the list on the filter query so it remounts. The e2e now
>   asserts the row count actually drops — a green build alone would have shipped a dead filter.
>
> **Wave 2 shipped ✅** (lifecycle + activity timeline + export-all + UX polish). Gate: `tsc` 0 · lint 0 ·
> 58 unit · **30 Playwright** · `verify-leads-p2` (18 checks) · browser-verified (clicked Reopen +
> Mark-lost, not just rendered).
> - **Lifecycle (P1-1)** — `setLeadStatus` enables the **reopen** path (LOST/ON_HOLD → IN_FOLLOWUP) that
>   follow-ups can't express, plus put-on-hold / mark-lost (reason required, in a `Dialog`); `archiveLead`
>   soft-deletes (admin-only, via `deletedAt`). Detail `status-control.tsx`. Access: admin + owner;
>   CONVERTED is terminal. Audited.
> - **Unified activity timeline (P1-4)** — `leadActivity` merges follow-ups + interpreted audit events
>   (created / edited / reassigned / status → X / converted), newest-first, on a rail with per-kind icons
>   (`activity-timeline.tsx`). Replaces the follow-ups-only list.
> - **Export-all + polish (P1-7 partial + P1-6)** — the Excel button now exports **all** leads matching the
>   current filters (was: only the visible 50), with the owner column; bare "No leads" cards → `EmptyState`;
>   mutations now use shared `Dialog` + `toast`.
>
> **Wave 3 shipped ✅** — follow-up edit/delete (`updateFollowUp`/`deleteFollowUp`, RBAC + audited, doesn't
> rewrite lead status), bulk multi-select + a Cards/Table view toggle (`bulkAssign`/`bulkSetStatus` apply
> per-lead so RBAC + audit hold), and a11y label wiring (`Field` auto-associates via `useId`; follow-up +
> core lead form retrofitted, driven by `getByLabel` in tests). Gate: verify-leads-p7 (6) + p8 (6) + browser.

### P1-1 · Lead editing + lifecycle control
- **Edit lead** (all fields) via a `PATCH /api/leads/[id]` + edit form. Reuse `LeadForm` in edit mode.
- **Manual status control + reopen** — today status only moves via a follow-up's "Close as". You can't
  reopen a `LOST`/`ON_HOLD` lead. Add a status dropdown (admin, or owner) with audited transitions.
- **Soft-delete/archive UI** — `Lead.deletedAt` exists in the schema but is **never invoked**. Wire it.
- *Pattern:* Proposals' locked/editable state machine (`proposal.ts` `updateBasics`), erection's
  APPROVE/QUERY/REJECT for gated transitions.

### P1-2 · Real assignment & ownership
- `assignedToId` / `createdById` are **bare strings with no `User` relation** — the owner's *name is
  never shown anywhere*. Add the relations, display the owner, and add an **assign/reassign** control.
- Add a **"My leads / All leads"** toggle for admins; consider round-robin auto-assign for inbound.
- *Pattern:* Projects' `assignTeam` + `TeamAssignment(role)` + `team-assign.tsx` (dropdown + toast) —
  lift it almost verbatim.

### P1-3 · List that scales: search, filters, views
- Add an **on-list search box** and **Source / Assignee / Date-range / Status** filters. The service
  **already accepts** `source`, `assignedToId`, `search`, `cold` — the UI just doesn't expose them.
- Add a **table view** with sortable columns alongside the card view (cards for mobile, table for desk).
- Add **saved views** ("My open", "Going cold", "This week's new") as filter presets.
- *Pattern:* Proposals' `searchParams` pill-tabs; the filter args already exist in `listLeads`.

### P1-4 · Unified activity timeline
- The lead detail shows **only follow-ups**. Make it a true timeline: creation, edits, status changes,
  assignment changes, conversion — each as a typed, icon-tagged event.
- *Pattern:* Client-360's multi-source merged timeline (`services/client.ts` builds a sorted,
  icon-tagged stream across lead+proposal+order+receipts+invoices — the exact shape you want here).

### P1-5 · Urgency made visible (SLA / aging)
- "Going cold" is only a *filter*. Surface it **per row**: badges like "Overdue 4d", "No next-date set",
  "New — un-actioned 2d". Add a **KPI tile header** (New / Due today / Going cold / Converted this month).
- Feed a **cold-lead / un-actioned-NEW signal into the notifications bell** (aggregator already exists).
- *Pattern:* Service's `StatTile` row + SLA-breach/"expires in Nd" badges (`service/page.tsx`,
  `domain/amc.ts`); Projects' "Nd overdue" red styling.

### P1-6 · UX consistency with the rest of the app
- Replace hand-rolled modals + inline `setError` with the shared **`Dialog`** + **`toast()`**, and the
  bare "No leads" cards with **`EmptyState`** (icon + title + description + action).
- Add **loading skeletons** (`SkeletonRows`) — the list currently pops in with no loading state.
- *Pattern:* Materials/Service/Projects already use all of these primitives; Leads is the holdout.

### P1-7 · Follow-up correction + bulk ops
- **Edit/delete a follow-up** (currently append-only, no correction path for a mistyped note/date).
- **Bulk actions** on the list: multi-select → assign / change status / export-selected.
- **Export ALL leads**, not just the ≤50 on screen (current export silently dumps the visible page only).

---

## P2 — Domain differentiators (the biggest lever: makes it world-class *for wastewater*)

> **Wave A shipped ✅** (structured sizing + water quality + scoring + BOQ preview + lost-reason picklist).
> Gate: `tsc` 0 · lint 0 · **64 unit** (+6 score) · **31 Playwright** · `verify-leads-p3` (11 checks) ·
> browser-verified (filled the form, saw Hot·90 + ₹41.8L–₹56.6L pre-quote render).
> - **Structured plant-sizing (P2-1)** — migration adds `plantType / technology / capacityKLD / segment /
>   budgetBand / decisionTimeline` (+ inlet `BOD/COD/TSS/TDS`) to `Lead`, all nullable. Captured in the
>   form (create + edit), shown on the detail. `convertToProposal` now carries the lead's real sizing into
>   the proposal (coalescing to STP/MBBR/0 for pre-P2 leads — tested against a NULL-sizing lead so it
>   can't crash the non-nullable proposal columns).
> - **Pre-quote BOQ preview (the killer feature)** — `boqPreview()` scales the KLD-band template to the
>   actual capacity and shows an indicative ₹ **range** on the lead, before conversion. **RBAC call:**
>   the template `rate` is the *sell/quote* rate (it becomes `BOQItem.rate`, employee-visible — not
>   `estimatedCost`/margin), so an indicative quote total is defensible for sales staff and computed
>   server-side. Labeled "estimate only, not a firm quote."
> - **Lead scoring (P2-3)** — `leadScore()` pure/deterministic HOT/WARM/COLD from KLD × budget × timeline ×
>   engagement × source (unit-tested, weights defensible); a temperature badge on the list + detail.
> - **Lost-reason picklist (P2-5)** — the Mark-lost dialog is now a structured `LOST_REASONS` select + note.
> - **Two real issues caught mid-build:** the running dev server cached the **stale Prisma client** after
>   the migration (submit failed with "Unknown argument plantType" until restart — the verify script passed
>   because it's a fresh process); and a count-based verify assertion broke past 100 leads (the list cap) —
>   made it search-scoped instead. Also noted: `Label` isn't wired to inputs (`getByLabel` fails) — an
>   a11y gap for the accessibility pass.
>
> **Wave B — win-loss analytics shipped ✅.** `/leads/analytics` (RBAC-scoped): pipeline funnel, win rate,
> **open pipeline ₹ value** (Σ indicative BOQ mid for open leads), why-we-lose (by structured reason),
> by-source + by-segment conversion, temperature mix. `leadAnalytics()` verified against raw DB counts
> (`verify-leads-p4`, 11 checks) + browser-verified. Caught & fixed in-browser: a ₹1.97 Cr value
> overflowed its KPI tile → compact crore/lakh format.
>
> **All remaining gaps now shipped ✅** — documents, follow-up edit/delete, bulk multi-select + table view,
> and the a11y label wiring. See the "Wave 3" note under P1 and the "Documents"/"Communication" sections.

This is where a generic CRM stops and a category-defining one begins. Right now **all sizing data
lives in one free-text `requirement` box** ("plant type, approx KLD, building type"), and `capacityKLD`
only becomes a real number *after* conversion. Structure it at the lead stage:

### P2-1 · Structured plant-sizing on the lead
Add real fields to `Lead` (they already exist as constants and on `Proposal`):
- **`capacityKLD`** (numeric) — the central sizing dimension.
- **`plantType`** — `STP | ETP | WTP` (`PLANT_TYPES`).
- **`technology`** — `MBBR | SBR | MBR | ASP | SAFF` (`TECHNOLOGIES`).
- **`segment`** — a new taxonomy: Apartment / Villa-gated / Textile / Hospital / Hotel / IT-park /
  Industrial / Municipal / Institution. (Today only *implied* by source.)
- **`budgetBand`** and **`decisionTimeline`** — captured as structured pick-lists, not guessed by AI.

**Payoff:** KLD-based filtering & analytics, segment pipeline reports, and — the killer feature —
a **live BOQ / price-band preview *before* conversion** by reusing `KLD_BOQ_TEMPLATES` +
`nearestKldBand` (already drives the AI proposal). The rep sees an indicative number on the lead itself.

### P2-2 · Inlet water-quality qualification
- Capture **inlet BOD / COD / TSS / TDS / flow** as structured lead fields — these are *required to size
  a plant* and today aren't captured until AMC. Pre-fill the proposal's TNPCB-norm targets
  (BOD<10 / COD<50 / TSS<10) from them.

### P2-3 · Domain lead scoring
- A **weighted score** from KLD × segment × budget band × timeline × source × engagement (follow-up
  outcomes). Surface as Hot / Warm / Cold — a *real* score, not just the staleness heuristic.
- *Pattern:* Proposals' margin-guard math and the AMC SLA scoring show the deterministic-scoring style.

### P2-4 · Documents on leads ✅ SHIPPED
- `LeadDocument` model + migration; a **Documents card** on the detail with the shared `Uploader`
  (images/PDF/`.dwg`/`.dxf` via `/api/uploads`) + delete. `addLeadDocument`/`deleteLeadDocument`
  RBAC-scoped + audited. Verified: `verify-leads-p6` (6 checks) + a real browser file upload e2e.

### P2-5 · Lost-reason as structured insight
- Make `lostReason` a **pick-list** (Price / Competitor / Budget-dropped / Timeline / No-response /
  Went-in-house) + optional note, and build a **lost-reason analytics** view. Feeds the same AI learning
  loop Proposals already use.

---

## Communication ✅ SHIPPED (was the 4.0 anchor → ~7.5)

Closed the biggest single gap. Gate: `tsc` 0 · lint 0 · **67 unit** (+3 inbound-parser) · **33 Playwright** ·
`verify-leads-p5` (8 checks) · browser-verified.
- **`Communication` model** (channel · direction · body · sentStatus) + migration — a proper record of a
  touch, distinct from a scheduled follow-up.
- **In-app comm panel** on the detail: **Log call** (records a touch), **WhatsApp** and **Email** (compose →
  send via the Phase-1-wired provider → record the result). Send is **gated**: with no provider it records
  `LOGGED (not sent)` rather than failing — the log always happens (fully tested); live delivery needs a
  WhatsApp/Resend key (untested here, honestly marked).
- **Two-way inbound** — `/api/webhooks/whatsapp` (Meta verify handshake + HMAC signature) → pure
  `parseInboundWhatsApp` (unit-tested) → matches the lead by last-10 digits → records an **IN** communication.
  Proven end-to-end with a synthetic payload (`received:1, recorded:1`); live receive needs a Meta number.
- **Merged into the activity timeline** with one coherent state badge (Sent / Logged / Received / Failed —
  fixed an in-browser bug where it showed "Sent" *and* "not sent" at once).
- **Accessibility foundation** — `Field` now auto-wires `<label htmlFor>` ↔ input id via `useId`, so screen
  readers announce labels and `getByLabel` works (used throughout the comm panel; broad retrofit of older
  forms still pending).

## P3 — Delight & moat (do after P0–P2)

- ~~**Two-way WhatsApp**~~ ✅ done above (inbound webhook + in-app send + logged comms).
- **Kanban pipeline board** — drag leads across stages; a visual complement to the tabs.
- **Per-lead reminders** — schedule / snooze / escalate, beyond the batch cron digest.
- **Voice audio record + server transcription** (Sarvam/Whisper) — the spec flags this for Phase 4;
  `audioUrl` + 90-day purge cron already exist, only the record+upload path is missing.
- **Offline lead *creation*** (today only follow-ups are offline-tolerant).
- **Fuzzy dedup + merge** — current dedup is phone-exact only; add name/address/email similarity and a
  merge action (today duplicates can be force-created and never merged).
- **Audit-trail viewer** on the lead — every mutation is already logged via `logAudit`; just surface it
  (and enrich the payloads — `CREATE Lead` currently logs only `{phone}`).

---

## Suggested sequence (fastest path to "world-class")

1. **Week 1 — P0 (bugs):** pagination, kill/wire QUOTE_REQUESTED, lead edit. *Now it's complete.*
2. **Week 2 — P1 core:** assignment+owner names, list search/filters, activity timeline, urgency
   badges + KPI tiles, Dialog/toast/EmptyState pass. *Now it's a great CRM leads module.*
3. **Week 3 — P2 domain:** structured KLD/plant-type/technology/segment + water-quality + BOQ preview +
   lead scoring + documents. *Now it's the best wastewater sales system in the sector.*
4. **Later — P3:** two-way WhatsApp, kanban, reminders, audio transcription.

**Non-negotiables to preserve while doing all of this** (from the spec): keep the offline follow-up
path, the RBAC ownership scoping, sequential-number integrity on conversion, and audit-on-every-mutation.
Every new field flows through `lib/env.ts`/Zod validation; money stays `Decimal`; dates stored UTC / shown IST.
