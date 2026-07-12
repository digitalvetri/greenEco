# Setup Guide — Turning On Every Integration

Step-by-step to make the app + all 15 automations fully live. Each item = get a key →
put it in `.env` → restart → test. Do them in order; you can stop anytime (everything
below what you've set keeps working, everything above stays safely logged-not-sent).

> **How to edit config:** open the file `.env` in the project root (`greeneco-crm/.env`).
> If it doesn't exist, copy `.env.example` to `.env`. After **every** change, restart the
> app: stop it (Ctrl+C in the terminal running `npm run dev`) and run `npm run dev` again.
> Check progress anytime at **Settings → System readiness** (shows what's live).

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

## 5. AI proposal drafts + bill vision (10 min) 🔑 Anthropic account

Powers the AI proposal generator (A14) and **A10 bill photo reading**.
1. Get a key at <https://console.anthropic.com> → API Keys.
2. In `.env`: `ANTHROPIC_API_KEY="sk-ant-...."`
3. Restart. Test: generate a proposal draft (Proposals → AI Generate) → it uses Claude; log an
   erection entry with a bill photo → A10 reads it (PASS/MISMATCH chip).

---

## 6. AI weekly brief (5 min) 🔑 Groq account (free tier)

1. Get a free key at <https://console.groq.com> → API Keys.
2. In `.env`: `GROQ_API_KEY="gsk_...."`
3. Restart. Test: Settings → Automations → **Dry run A13 (weekly-brief)** → `aiUsed: true`.
   (Without this key it still works — just a plain numeric brief.)

---

## 7. File storage — required for real use (20 min) 🔑 S3 or Cloudflare R2

Local disk loses files on redeploy. Use S3/R2 so bill photos, documents, PDFs persist.
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
| `ANTHROPIC_API_KEY` | AI proposals + A10 bill vision |
| `GROQ_API_KEY` | A13 AI-written brief |
| `STORAGE_DRIVER=s3`+`S3_*` | durable file storage |
| `SESSION_SECRET`,`PRINT_TOKEN_SECRET` | production security |

Watch **Settings → System readiness** — it turns green as you set each one.
