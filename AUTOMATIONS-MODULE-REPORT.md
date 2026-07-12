# Automations Module Report

Implements **AUTOMATION-ENGINE-SPEC-v1.0** — 15 automations on a shared, idempotent,
kill-switchable engine. Built in 6 waves (Wave 0 = engine; 1–5 = automations).

## Engine (Wave 0)

- **Models** (`automation_engine` migration): `AutomationLog` (unique `dedupeKey` = idempotency
  backbone), `AutomationSetting` (kill switch + params), `AutomationTask` (auto to-dos).
- **`engine.ts`** — registry + `runAutomation(name)` (kill switch via `<id>.enabled`) + settings
  helpers. **`deliver.ts`** — single delivery choke point: skips a key already `SENT`, logs every
  attempt, and namespaces dry-runs under `dry:` so they never block a real send.
- **`/api/cron`** dispatches registered automations through the engine + `?dryRun=1`; `amc`/`purgeAudio`
  stay inline. **Settings → Automations** (admin): per-automation toggle, "Dry run" with live JSON,
  last-run, admin recipients.

## The 15 automations

| # | Name | Trigger | Core |
|---|---|---|---|
| A1 | followup-digest | 08:00 | per-employee due-today + admin overdue/cold |
| A2 | auto-next-followup | event (follow-up create) | auto-fill next date from outcome |
| A3 | stale-deal-nudge | 19:00 | idle proposals → task + owner wa.me draft; expiry alert |
| A4 | payment-reminders | 08:00 (09–19 IST) | client reminders at +7/+3/0/−3/−7; firm overdue + CC admin |
| A5 | stage-milestone-trigger | event (stage DONE) | milestone DUE + **draft invoice** + admin notify |
| A6 | monthly-receivables | 1st 09:00 | collected/aging/efficiency + printable report |
| A7 | daily-site-digest | 19:00 | per-project activity + budget% |
| A8 | budget-alerts | event + 19:00 sweep | 70/90/100% crossings; 100% → overrun task |
| A9 | delay-detection | 08:00 | overdue stages → task + engineer nudge; auto-close on reason |
| A10 | bill-verification-assist | event (entry create) | Claude vision PASS/MISMATCH + auto-approve within limit |
| A11 | low-stock-po | 08:00 | one **draft PO** per best vendor; skip items on open POs |
| A12 | material-request-routing | event (request create) | TRANSFER / PO / PARTIAL suggestion |
| A13 | weekly-brief | Mon 08:30 | **Groq** 4-section brief from server-gathered facts (numeric fallback) |
| A14 | winloss-learning | event (WON/LOST) | `ProposalOutcome` snapshot → generator band win-rate few-shot |
| A15 | reference-mining | quarterly | top references + thank-you / ask-for-referral lists |

Event-driven automations register a stub (kill switch + Settings row) and fire from their service
(lead / order / erection / materials / proposal). Money-summing paths exclude DRAFT invoices.

## Global rules honored

Idempotent (dedupeKey) · kill switch · quiet hours (A4) · RBAC (admin-only figures to admin phones) ·
branded footer · every mutation audited (`userId: system:automation`) · unset channels log, never send.

## Verification

`tsc 0 · lint 0 · 72 unit` + verify scripts (all against the live DB):
`verify-automation-engine` (11: deliver idempotency, dry-run isolation, kill switch) ·
`verify-automations-w1..w5` (A1–A15 acceptance) · `verify-automations-idempotency` (every scheduled
automation twice → 2nd sends 0) · `verify-sell`/`verify-control`/`verify-invoices-p1` regressions green.
Settings page renders all 15 with working dry-run.

## Needs keys to run live (degrade gracefully now)

WhatsApp/email (delivery), `ANTHROPIC_API_KEY` (A10 vision, A14 gen), `GROQ_API_KEY` (A13), `CRON_KEY`,
`adminPhones`. See `GO-LIVE.md` + Settings → System readiness.

## Deferred (documented)

Auto-PDF-file generation + storage for A6/A15 (printable routes shipped; link is the deliverable);
A10 verification-queue chips + bulk-approve UI (backend + auto-approve shipped); Sentry SDK in
`deliver()` (ERROR_WEBHOOK_URL forwarding + logger choke point ready).
