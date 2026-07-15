# Materials module — UX / IA report

Audit of the Materials module as it runs today (admin + employee, browser-verified against the live DB),
and a proposed restructure into sub-sections. Companion to `MATERIALS-MODULE-REPORT.md` (which graded the
module ~8.5/10 on *capability* — this report is about whether a human can actually **operate** it).

Verdict: **the capability is there; the information architecture is not.** Everything is piled onto one
route, and one role can't reach the flow that was built for them.

---

## 1. What's wrong today

### F1 — Employees can't raise a material request (functional bug, not cosmetic) 🔴

The single most important finding. An EMPLOYEE loading `/materials` sees **one read-only stock table and
nothing else** — verified in-browser:

```
EMPLOYEE headings: ["Materials", "Item Master & Stock (all locations)"]
Can employee see a material-request form? NO — no request UI anywhere
```

But the service layer *deliberately allows it*. `createMaterialRequest` and `listMaterialRequests`
(`src/server/services/materials.ts:536,570`) are the **only two mutating/listing functions without
`requireAdmin`** — every other one (createItem, createVendor, createPO, transferStock, consumeStock,
stockAudit, listPOs…) is admin-gated. The "material request carries **no prices**" design exists precisely
so field staff can use it.

The cause is purely structural: the Requests tab lives inside `MaterialsTools`, and `page.tsx:131` mounts
that whole component under `{isAdmin && <AdminTools />}`. So the one flow built for employees is locked
inside the admin-only block. Field staff currently have no way to ask for material through the CRM.

**This alone justifies the restructure** — the fix falls out of giving Requests its own section.

### F2 — Admin: seven sections stacked on one route, ~2.9 screens of scrolling 🟠

Measured (1440×900, admin): `main` scrollHeight **2415px** vs **841px** viewport. The page stacks:

1. Item Master & Stock (list) · 2. Add Item · 3. Add Vendor · 4. Raise Purchase Order ·
5. Purchase Orders (list) · 6. **Stock Operations** → nested tabs {Transfer · Issue to Site · Requests · Audit}

The day-to-day *actions* (transfer, issue-to-site, audit) are at the **very bottom**, behind a second level
of tabs, below a PO list that can run to 100 rows. To issue material to a site you scroll past two forms and
the entire PO ledger, then find the right tab. That is the "fully confusing" feeling — it's **tabs nested
inside a long scroll**, so there's no stable sense of *where you are*.

Nothing is grouped by task: "Add Item" (a masters/setup job done rarely) sits directly above "Raise PO" (a
weekly job), which sits above "Transfer stock" (a daily job).

### F3 — Every page load runs all seven queries regardless of task 🟠

`page.tsx` + `AdminTools` fetch `listItems`, `materialsStats`, `materialCategories`, `itemOptions`,
`listVendors`, `listLocations`, `listPOs`, `listOrders(take:100)`, `listMaterialRequests` on **every** visit —
even when you came to do one 10-second stock transfer. Splitting into routes makes each section pay only for
its own data.

### F4 — PO list is capped at 100 with no "load more" 🟡

`listPOs` caps at 100 (`take: Math.min(take, 200)`, called with the default). The list has no pagination UI,
unlike the item list which got `{items, nextCursor}` + Load-more in v19 P0. PO #101 is simply unreachable.
Same for `listMaterialRequests` (capped 100, no pager).

### F5 — Test data is polluting the real list 🟡

The live DB is full of `Verify Cement Bag 1783439880191`-style items and 12+ `GEC-PO-2026-0xx · Verify Cement Co`
POs at ₹40,000 each, left behind by the `verify-*.ts` scripts (which by design append to the live DB). The stock
list and PO list are mostly noise. Not a code bug, but it makes the module *look* broken and it's worth a cleanup
script before any demo.

---

## 2. Two code notes (reported, deliberately NOT fixed in this change)

- **Negative stock balance on `Air Blower 2HP` — stale, already prevented.** The stock list shows
  `Main Warehouse: -1`. The ledger has a `TRANSFER_OUT qty=1` from Main Warehouse dated **2026-07-07** with no
  preceding receipt. This **predates the over-issue guard** added in v19 P2 (`materials.ts:487-491`), which now
  throws `Only 0 in stock at the source location — cannot transfer 1`. So it is **stale data, not a live bug** —
  it needs a corrective ADJUST movement (the ledger is append-only; correct via reversal, never `UPDATE`).
  It is the only negative balance in the DB (verified by summing the whole ledger).

- **Over-issue guard has a TOCTOU race.** `transferStock`/`consumeStock` call `onHandAt()` and *then* open the
  `$transaction`, so two concurrent transfers of the last unit could both pass the check and drive stock negative.
  Low severity for a team this size (and the ledger stays correctable), but it should eventually move inside the
  transaction with a row lock. Flagging, not fixing — out of scope for a UI restructure.

---

## 3. Proposed structure — 4 task-based sub-sections

Replace the one long page with sub-routes under a shared, role-filtered sub-nav (mirrors the existing
`/materials/analytics` sub-route, and the tab-split pattern already used by Projects and Service/AMC).

| Section | Route | Contains | Who |
|---|---|---|---|
| **Stock** (default) | `/materials` | Balances + item list + search/category filter + Add Item | Everyone *(Add Item admin-only)* |
| **Purchasing** | `/materials/purchasing` | Vendors + Raise PO + PO list + GRN "Receive" | Admin |
| **Operations** | `/materials/operations` | Transfer · Issue to Site · Stock Audit | Admin |
| **Requests** | `/materials/requests` | Raise a material request + request list/approvals | **Everyone** — employees raise (no prices); admin approves/transfers/converts |
| Analytics | `/materials/analytics` | *(exists, unchanged)* | Admin |
| Item detail | `/materials/[id]` | *(exists, unchanged)* — ledger + balances | Everyone |

Every one of the 7 current sections has a home; nothing is dropped.

**What this buys**
- **Fixes F1** — Requests becomes its own route, so employees finally get the flow built for them.
- **Fixes F2** — each section is one shallow screen with its primary action visible without scrolling. No more
  tabs-nested-in-a-scroll; the sub-nav shows where you are.
- **Fixes F3** — each route queries only what it renders.
- Sections are **linkable/bookmarkable** ("go to /materials/operations") and each gets its own `loading.tsx`.

**Grouping rationale:** by *how often you do the job*, not by data model. Stock = look something up (daily,
everyone). Operations = move material (daily, admin). Purchasing = buy material (weekly). Requests = ask for
material (field staff). Masters (Add Item / Add Vendor) are rare setup jobs, so they ride along inside the
section they belong to rather than getting top billing above the daily work.

**Non-negotiables preserved:** RBAC stays enforced in the **service return path** (`requireAdmin` + `stripPricing`)
— the sub-nav only hides links, it never becomes the security boundary. A hand-typed `/materials/purchasing` as
EMPLOYEE must still be refused by the service, and that gets verified.

---

## 4. Shipped

Gate: **tsc 0 · lint 0 errors (14 pre-existing warnings, unchanged) · 72 unit · 70 Playwright (68 → +2) ·
verify-materials-p0 (22 checks, was 20) + p1 + p1-4 + p2 · verify-control + verify-execute · browser-driven
in both roles.**

| Route | Section | Who | Scroll (was 2.9 screens) |
|---|---|---|---|
| `/materials` | Stock — balances, item list, search/category, Add Item (collapsed) | Everyone | **1.1** |
| `/materials/purchasing` | Raise PO · PO list + GRN receive · Vendors | Admin | **1.3** |
| `/materials/operations` | Transfer · Issue to Site · Stock Audit | Admin | **1.0** |
| `/materials/requests` | Raise a request (no prices) · admin approvals | **Everyone** | **1.0** |

- **F1 fixed and proven end-to-end.** An EMPLOYEE now signs in, opens Requests, picks a project, submits —
  and the ADMIN sees a count badge on the Requests tab and actions it (`PENDING → TRANSFERRED`). Round-trip
  driven in a real browser, both roles. `listOrders` is already RBAC-scoped, so the employee's project dropdown
  offered exactly the 1 project they're assigned to.
- **F2 fixed** — every section is now ~1 screen with its primary action visible without scrolling. The old
  `materials-admin.tsx` + `materials-tools.tsx` monoliths are deleted, split into `add-item-card` /
  `purchasing-panel` / `operations-panel` / `requests-panel` + a role-filtered `materials-nav`.
- **F3 fixed** — each route fetches only what it renders (Stock no longer pulls vendors/POs/orders/requests).
- **Security hardening found while enabling F1:** `createMaterialRequest` took a caller-supplied `orderId` and
  **never checked it belonged to the caller's company** — a cross-tenant write, unreachable only because no UI
  exposed the path. It now verifies the order is in-tenant *and* calls `requireProjectAccess` (so an EMPLOYEE
  can only request against a project they're on), matching `erection.ts`'s identical field-staff pattern.
  Both directions are asserted in `verify-materials-p0`.
- **Not the security boundary:** the sub-nav hides admin links, but the admin pages independently `notFound()`
  a non-admin *and* the services still `requireAdmin`. Verified: an EMPLOYEE hand-typing `/materials/purchasing`
  or `/materials/operations` gets the 404 page with zero PO/vendor/cost UI rendered. (Asserted by content-absence,
  not HTTP status — with `force-dynamic` the streamed shell flushes 200 before `notFound()` reaches the boundary.
  This is the existing convention for the admin-only erection pages.)

### Mobile (390px) — the request flow's actual users are on phones

Verified on a 390×844 touch device as EMPLOYEE: **no horizontal overflow**, the sub-nav fits on **one row**, and a
technician **submitted a request by touch, end-to-end**.

One thing to decide: **form controls are 40px tall, under the ≥44px touch target AGENTS.md calls a non-negotiable.**
This is *not* something this change introduced — it's `h-10` baked into the shared `Input`/`Select` primitives
(`src/components/ui/input.tsx`), so **every form in the app** (22 files) is 40px, not just Materials. Bumping it to
`h-11` is a one-line design-system change but it ripples through all 22 screens and the 8pt spacing rhythm, so it
wants its own pass with a full visual re-verify rather than riding along in a materials restructure. Flagging for a
decision.

### Still open (reported, not done)

F4 PO/request "load more" (hard 100 cap) · F5 test-data cleanup (you chose to leave the data alone) · the negative
Air-Blower balance (needs a corrective ADJUST movement) · the over-issue TOCTOU race · the 44px touch-target call above.
