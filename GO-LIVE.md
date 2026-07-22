# Green Ecocare CRM — Go-Live Runbook

Everything below is **wired and fails safe** today (unset integrations log instead of
crash). This is the checklist to turn each on for production. Watch **Settings →
System readiness** (admin) for a live view of what's configured — it reads the same
env flags described here and never shows a secret.

> Deployment itself (host, DB, `migrate deploy`, `db:seed`) is out of scope here —
> this covers the config + integrations + business decisions that remain regardless.

---

## 1. Integrations (need real keys — cannot be verified without them)

Each is env-gated. Set the vars in `.env` (validated at boot by `src/lib/env.ts`),
restart, then test as below. All are also visible in **Settings → System readiness**.

### Authentication (Clerk)
- `AUTH_MODE=clerk`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`
- Also **required in prod**: `SESSION_SECRET` (≥32 random chars), `PRINT_TOKEN_SECRET` (≥32).
- Test: sign in via Clerk; confirm the svix-verified `/api/webhooks/clerk` provisions the `User`
  row (role + companyId from `public_metadata`); an unknown company → 422.
- Leaving `AUTH_MODE=dev` keeps the built-in credentials login (email + scrypt password) —
  fine for a single-tenant self-host, but set `SESSION_SECRET` and keep `AUTH_DEV_BYPASS` unset.

### File storage (S3 / R2)
- `STORAGE_DRIVER=s3` + `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` (+ `S3_PUBLIC_URL`).
- Test: upload a bill photo / lead document; confirm the object lands in the bucket and the URL persists.
- **Local disk is lost on redeploy** — S3/R2 is required for any real deployment.

### WhatsApp (outbound)
- Direct Cloud API (preferred): `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID`. Or n8n relay: `WHATSAPP_WEBHOOK_URL`.
- Test: trigger a payment reminder (`/api/cron?job=all` with `CRON_KEY`) or send from a lead/proposal;
  confirm delivery. Until set, sends are recorded as `LOGGED (not sent)` — never a crash.

### WhatsApp (inbound, two-way)
- `WHATSAPP_VERIFY_TOKEN` + `WHATSAPP_APP_SECRET`. Configure Meta → WhatsApp → Callback URL
  `{APP_URL}/api/webhooks/whatsapp`. Test with a real inbound message → matched to a lead by last-10 digits.

### Email (Resend)
- `RESEND_API_KEY` + `EMAIL_FROM` (a verified sender). Test: send a proposal by email; confirm receipt.

### AI proposal drafts (optional)
- `ANTHROPIC_API_KEY`. Without it, the generator falls back to KLD-band templates (fully functional).

### Cron authentication
- `CRON_KEY` — required so `/api/cron` isn't publicly callable. Schedule the host cron to call
  `/api/cron?job=all` with header `x-cron-key: $CRON_KEY`.

### Push notifications (Web Push)
- Generate once: `npx web-push generate-vapid-keys`. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:` address). Without these, the "Enable
  notifications" toggle in Settings stays unavailable (`sendPushToUser` is a clean no-op) —
  everything else keeps working.
- **Only testable on the deployed instance** — the service worker is deliberately unregistered
  under `next dev` (see `OfflineBar`), so push has nothing to subscribe against locally. After
  deploy + setting the keys: Settings → Notifications → Enable → approve the browser permission
  prompt → trigger any AutomationTask condition (e.g. a follow-up due today) and confirm an OS
  notification arrives. iOS only delivers to an **installed** (home-screen) PWA, never a Safari tab.

---

## 2. Observability (#5)

- **Today:** structured JSON logs (`src/lib/logger.ts`). Set `ERROR_WEBHOOK_URL` to forward errors
  to Slack/Discord/webhook — shown as "Error forwarding" in System readiness.
- **Sentry upgrade path:** the logger is the single choke point — add `@sentry/nextjs`, init behind a
  `SENTRY_DSN` env flag, and call it from the logger's error branch. No app-code changes elsewhere.

---

## 3. Business decisions to confirm with the client (#7)

These have sensible **defaults** and are configurable; confirm the values before go-live.

| Rule | Where set | Default | Note |
|---|---|---|---|
| Payment / milestone template | `DEFAULT_STAGES` + proposal editor | 50% advance / 30% delivery / 20% commissioning | **Per-proposal override exists** — the default only seeds new proposals. Confirm the standard split. |
| Company GSTIN | `COMPANY_GSTIN` (env) | — | Prints on tax invoices. |
| Company state code | `COMPANY_STATE_CODE` (env) | `33` (Tamil Nadu) | Drives CGST/SGST vs IGST. |
| Invoice prefix | `INVOICE_PREFIX` (env) | `GEC-INV` | Sequential, never reused. |
| SAC code | `WORKS_CONTRACT_SAC` (constants) | works-contract SAC | Confirm the correct SAC for the service. |
| Min margin % | `MIN_MARGIN_PCT` (env) | 10% | Proposal approval guard. |
| Auto-approve limit | `AUTO_APPROVE_LIMIT` (env) | 0 (all manual) | Erection entry auto-approval ceiling. |
| GST rate | per-invoice (default 18%) | 18% | Overridable per invoice. |

Client-side GST place-of-supply is now **derived from the client GSTIN** when the state code
isn't entered (a GSTIN's first 2 digits are the state code), and the project GST control **warns**
when neither is set (invoices would otherwise default to intra-state).

---

## Verification already in place

`npm test` (72 unit) · `npx tsc --noEmit` · `npx next build` · Playwright e2e · and 43
`scripts/verify-*.ts` end-to-end checks (incl. `verify-tally`, `verify-invoices-p1`).
`scripts/backup.sh` (`pg_dump -Fc` + retention) is proven restore-tested.
