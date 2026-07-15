# Setup Guide — Turning On Every Integration

Step-by-step to make the app + all 15 automations fully live. Each item = get a key →
put it in `.env` → restart → test. Do them in order; you can stop anytime (everything
below what you've set keeps working, everything above stays safely logged-not-sent).

> **Two ways to set keys:**
> 1. **In the app (recommended, no restart):** **Settings → Integrations & API keys**. Paste
>    each key, hit Save — it takes effect on the next request. Values are encrypted at rest and
>    override `.env`. Secrets are never shown back (only the last 4 chars). Leave a field blank +
>    Save to clear it. This is the easiest path and what the steps below refer to.
> 2. **In `.env`:** open `greeneco-crm/.env` (copy `.env.example` if missing). After **every**
>    change, restart the app (Ctrl+C in the `npm run dev` terminal, then `npm run dev`).
>
> Either way, watch **Settings → System readiness** turn green as you set each one.
>
> Exceptions that stay in `.env` only (never in the Settings UI, for security): `DATABASE_URL`,
> `SESSION_SECRET`, `AUTH_MODE`, `PRINT_TOKEN_SECRET`, and the `S3_*` storage keys.
>
> ⚠️ **Set `SESSION_SECRET` in production BEFORE you paste keys.** Keys pasted in Settings are
> encrypted with a key derived from `SESSION_SECRET`. If you paste keys first and change
> `SESSION_SECRET` later (e.g. going from dev to a real deployment), the stored keys can no longer
> be decrypted and silently fall back to `.env` — your integrations go dark with no error. So:
> lock in `SESSION_SECRET` (step 8) first, *then* paste keys. If it ever happens, just re-paste them.

---

## 0. Prerequisite — the app must be deployed somewhere reachable (for webhooks)

WhatsApp/email webhooks need a public URL. On localhost they can't reach you. Two options:
- **Quick test:** run `npx ngrok http 3000` → use the `https://….ngrok.io` URL as your app URL.
- **Real:** deploy to a host (Coolify/Vercel/Railway) and use that domain.

Set it: `NEXT_PUBLIC_APP_URL="https://your-domain.com"`

---

## 1. Cron key — lets the schedule run safely (5 min) ✅ no account needed

1. Generate a random secret: run `openssl rand -hex 32` in a terminal, copy the output.
2. In `.env`: `CRON_KEY="<paste-the-random-value>"`
3. Restart. Test: `curl -H "x-cron-key: <same-value>" "http://localhost:3000/api/cron?job=all&dryRun=1"` → should return JSON (not "unauthorized").

---

## 2. Admin WhatsApp recipients — who gets the alerts (2 min) ✅ no key

1. Go to **Settings → Automations → Admin recipients**.
2. Enter your admin WhatsApp number(s), 10-digit, comma-separated (e.g. `9600759304, 9600700000`). Save.
3. This is where every admin-only message (digests, budget, receivables) is sent.

---

## 3. WhatsApp sending — the big one (30–60 min) 🔑 Meta account

**Option A — WhatsApp Cloud API (recommended, official):**
1. Create a Meta app at <https://developers.facebook.com> → add the **WhatsApp** product.
2. Note your **Phone number ID** and generate a **permanent access token** (System User token).
3. In `.env`:
   ```
   WHATSAPP_TOKEN="<permanent-token>"
   WHATSAPP_PHONE_ID="<phone-number-id>"
   ```
4. **Two-way (inbound replies):** in Meta → WhatsApp → Configuration set the Callback URL to
   `https://your-domain.com/api/webhooks/whatsapp`, a verify token of your choice, and copy your app secret:
   ```
   WHATSAPP_VERIFY_TOKEN="<a-token-you-pick>"
   WHATSAPP_APP_SECRET="<meta-app-secret>"
   ```
5. Restart. Test: Settings → Automations → **Dry run A1**, then run it for real (`/api/cron?job=followup-digest` with your cron key) → you get a WhatsApp.

**Option B — n8n relay (if you already use n8n):** set `WHATSAPP_WEBHOOK_URL="https://your-n8n/webhook/..."` instead of the token pair.

---

## 4. Email (15 min) 🔑 Resend account

1. Sign up at <https://resend.com>, verify a sending domain (or use their test domain).
2. Create an API key.
3. In `.env`:
   ```
   RESEND_API_KEY="re_...."
   EMAIL_FROM="Green Ecocare <noreply@your-domain.com>"
   ```
4. Restart. Test: send a proposal by email from a proposal page → check it arrives.

---

## 5. AI — pick ANY one (or more) provider 🔑

The AI features (proposal drafts + A13 weekly brief + A10 bill-photo reading) work with **any
one** of three providers. Set whichever key(s) you have in **Settings → Integrations → AI**:

| Provider | Key field | Get it | Does text? | Does vision (A10 bills)? |
|---|---|---|---|---|
| **Groq** (free tier, fast) | Groq key `gsk_…` | <https://console.groq.com> | ✅ | ❌ (Groq can't read images) |
| **Google Gemini** (free tier) | Gemini key `AIza…` | <https://aistudio.google.com/apikey> | ✅ | ✅ |
| **Anthropic (Claude)** | Claude key `sk-ant-…` | <https://console.anthropic.com> | ✅ | ✅ |

- **Text (proposals + weekly brief):** any one key is enough. If you set several, the
  **Preferred text provider** dropdown decides which is tried first (default `auto` = Groq → Gemini → Claude).
- **Vision (reading bill photos, A10):** needs **Gemini or Claude** — Groq alone leaves A10 in
  its no-AI fallback.
- **No key at all:** everything still runs — proposals fall back to KLD-band templates and the
  brief to a plain numeric summary.

**Test:** Proposals → AI Generate should produce a draft tagged with the provider used; Settings →
Automations → **Dry run A13** shows `aiUsed: true` + which `aiProvider`.

> You said you currently have a **Groq** key and not Claude — that's fine: paste the Groq key and
> text AI (proposals + brief) works immediately. Add a **Gemini** key too if you want bill-photo
> reading (A10), since Groq can't do vision.

---

## 6. File storage — required for real use (20 min) 🔑 S3 or Cloudflare R2 · `.env` only

Local disk loses files on redeploy. Use S3/R2 so bill photos, documents, PDFs persist.
(Storage is bound at startup, so it stays in `.env` — not in the Settings UI.)
1. Create a bucket (AWS S3 or **Cloudflare R2 — cheaper, no egress fees**).
2. Create access keys with read/write to that bucket.
3. In `.env`:
   ```
   STORAGE_DRIVER="s3"
   S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com"
   S3_ACCESS_KEY="...."
   S3_SECRET_KEY="...."
   S3_BUCKET="greeneco"
   S3_PUBLIC_URL="https://files.your-domain.com"   # public bucket URL
   ```
4. Restart. Test: upload a lead document → confirm it lands in the bucket.

---

## 8. Security for production (10 min) ✅ no account

1. Session secret: `openssl rand -hex 32` → `SESSION_SECRET="<value>"` (≥32 chars — required in prod).
2. Print token secret (branded PDFs): `PRINT_TOKEN_SECRET="<another-openssl-hex-32>"`.
3. Keep `AUTH_DEV_BYPASS` **unset or 0** in production (so only real logins work).
4. Error alerts (optional): `ERROR_WEBHOOK_URL="<a-Slack/Discord-incoming-webhook>"`.

---

## 9. Confirm the business numbers (with the client)

In `.env`, verify: `COMPANY_GSTIN`, `COMPANY_STATE_CODE` (33 = TN), `INVOICE_PREFIX`,
`MIN_MARGIN_PCT`, `AUTO_APPROVE_LIMIT` (₹ ceiling for auto-approving small expenses — set >0
to enable A10 auto-approve). Default payment terms (50/30/20) are set per-proposal.

---

## 10. Turn on the schedule — so automations run by themselves

Set your host's scheduler (Coolify cron / GitHub Actions / crontab) to call these with the cron key:

| IST time | Command |
|---|---|
| 08:00 daily | `curl -H "x-cron-key: $CRON_KEY" "$APP_URL/api/cron?job=followup-digest,payment-reminders,delay-detection,low-stock-po"` |
| 19:00 daily | `…?job=daily-site-digest,budget-alerts,stale-deal-nudge` |
| Mon 08:30 | `…?job=weekly-brief` |
| 1st 09:00 | `…?job=monthly-receivables` |
| Quarterly (1 Jan/Apr/Jul/Oct 09:00) | `…?job=reference-mining` |

(Event-driven ones — A2, A5, A8, A9, A10, A12, A14 — need no schedule; they fire in-app.)

---

## Quick reference — what each key switches on

| Key(s) | Turns on |
|---|---|
| `CRON_KEY` | the schedule can run |
| adminPhones (Settings) | who receives admin alerts |
| `WHATSAPP_TOKEN`+`WHATSAPP_PHONE_ID` | all WhatsApp sending (A1,A3,A4,A6,A7,A8,A9,A11,A13,A15) |
| `WHATSAPP_VERIFY_TOKEN`+`WHATSAPP_APP_SECRET` | inbound WhatsApp replies |
| `RESEND_API_KEY`+`EMAIL_FROM` | email sending |
| `GROQ_API_KEY` **or** `GEMINI_API_KEY` **or** `ANTHROPIC_API_KEY` | AI text (proposals + A13 brief) |
| `GEMINI_API_KEY` **or** `ANTHROPIC_API_KEY` | A10 bill-photo vision (Groq can't do images) |
| `AI_TEXT_PROVIDER` | which text engine is tried first (auto/groq/gemini/anthropic) |
| `STORAGE_DRIVER=s3`+`S3_*` | durable file storage (`.env` only) |
| `SESSION_SECRET`,`PRINT_TOKEN_SECRET` | production security (`.env` only) |

Everything except storage + security can be pasted in **Settings → Integrations & API keys**
(encrypted, overrides `.env`, no restart). Watch **Settings → System readiness** turn green.
