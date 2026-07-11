<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices. In this repo: **Next 16** (`params`/`searchParams` are async — always `await` them), **Prisma 6** (pinned), **Tailwind v4**.
<!-- END:nextjs-agent-rules -->

# GreenEco CRM — Agent Operating Guide

CRM for **Green Ecocare Pvt Ltd** (wastewater treatment plant projects), by DigitalVetri.AI.
Product spec: `../ECOFLOW-MASTER-BUILD-SPEC-v1.0.md`. Build notes + status: `./CLAUDE.md`.

> The goal is a **production-grade, polished product**, not a prototype. Every change should hold the
> quality bar below. When in doubt, apply the referenced GreenEco skills rather than guessing.

## Use these GreenEco skills & agents (in `../` — the skills library)

Pick the skill/agent that matches the work; read its `SKILL.md` before starting.

| Work | Skill (read its SKILL.md) | Agent persona to emulate |
|---|---|---|
| React/Next UI, components, perf, a11y | `engineering-team/skills/senior-frontend` | `agents/engineering/cs-frontend-engineer.md` |
| Design tokens, color, type scale, spacing, WCAG | `product-team/skills/ui-design-system` | — |
| API routes, services, data model, transactions | `engineering-team/skills/senior-backend` | `agents/engineering/cs-backend-engineer.md` |
| End-to-end features across the stack | `engineering-team/skills/senior-fullstack` | `agents/engineering/cs-fullstack-engineer.md` |
| E2E tests (the 4 field actions + critical flows) | `engineering-team/skills/senior-qa` + `engineering-team/playwright-pro` | `playwright-pro/agents/test-architect.md` |
| Code-quality review before finishing | `engineering/karpathy-coder` + `engineering/grill-me` | `agents/engineering/cs-karpathy-reviewer.md` |
| Architecture / trade-off calls | `engineering-team/skills/senior-architect` | `agents/engineering/cs-senior-engineer.md` |

Design tokens: `python3 ../product-team/skills/ui-design-system/scripts/design_token_generator.py "#0f7a4d" --style modern --format css` — the brand green is `#0f7a4d`.

## Non-negotiables (from the spec — do NOT regress)

- **RBAC field stripping** (`src/lib/rbac.ts`): EMPLOYEE JSON must never contain `purchasePrice`,
  `estimatedCost`, PO `rate`/`totalValue`, `valueAtCost`, or Budget. Enforce in the **service return
  path**, never UI-only. Covered by `src/lib/rbac.test.ts` — keep it green.
- **Money** = Prisma `Decimal` in DB, `decimal.js` in code (`src/lib/money.ts`). Never float on ₹.
  Convert Decimals → strings before passing to Client Components.
- **Immutable ledgers**: `StockMovement`, `Receipt` are append-only; correct via reversal/credit note.
- **Sequential doc numbers never reused** (`src/server/services/numbering.ts`); allocate inside the
  document's `$transaction`.
- **Service layer**: every service method takes `ctx = {userId, role, companyId}`; route handlers &
  server actions stay thin; audit every mutation (`src/lib/audit.ts`).
- Zod-validate every API/action input. Dates stored UTC, shown IST. Indian ₹ format (₹1,50,000).

## Quality bar (what "perfect", not "basic", means here)

- **Design system first**: use the tokens in `src/app/globals.css` (`--gc-*`). No ad-hoc hex/spacing —
  reference tokens. 8pt spacing grid; modular type scale; consistent radius/elevation.
- **Every list/table** has: loading skeleton, empty state, error state, and (where the spec says)
  Excel export. **Every mutation** shows pending + success/error feedback.
- **Mobile-first, PWA**: ≥44px touch targets, bottom-nav, works offline for the 4 field actions
  (`src/lib/offline-queue.ts`). Test at a phone viewport.
- **Accessibility**: semantic HTML, labels tied to inputs, focus-visible rings, aria on icon-only
  buttons, colour never the sole signal (badges ship icon+text), WCAG-AA contrast.
- **Component reuse**: build in `src/components/ui/*`; don't inline one-off styled divs that duplicate
  an existing primitive.
- **Verify before declaring done**: `npm test` green, `npx tsc --noEmit` clean, `npx next build`
  clean, and drive the flow (a `scripts/verify-*.ts` script or Playwright), not just types.

## Commands

`npm run dev` · `npm test` (Vitest) · `npm run db:migrate` · `npm run db:seed` · `npm run db:studio`
Phase verification: `npx tsx scripts/verify-{sell,execute,control}.ts` (append test rows to the live DB).

## Deviations from the spec (intentional, don't "fix" them)

Real local **PostgreSQL 18** (keeps the Postgres-locked schema); **Prisma 6** (v7 needs a different
config model); **Next 16** async params; **dual auth modes** (`AUTH_MODE=dev` shim locally,
`AUTH_MODE=clerk` in prod — `getSession()` shape is identical; never add a third branch);
**storage adapter** (`STORAGE_DRIVER=local|s3`) — write files through `src/lib/storage.ts`, never
straight to disk; branded PDFs via `/print/*` routes.

Env is Zod-validated at boot (`src/lib/env.ts`). Adding a new env var means adding it there and
reading it as `env.fooBar`. Raw `process.env.FOO` in app code is a bug. Three deliberate exceptions:
`src/middleware.ts` (edge runtime needs statically-analyzable `process.env.X` access — a dynamic
whole-object parse doesn't inline), `src/lib/prisma.ts` (`NODE_ENV` only), and `prisma/seed.ts`
(bootstrap script that runs before the app, and before a tenant row exists).
