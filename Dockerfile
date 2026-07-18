# syntax=docker/dockerfile:1

# ---- deps: install once, reused by the build stage ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --include=dev: Coolify injects the app's configured env vars (incl. NODE_ENV=production)
# as build-time ARGs/ENV in every stage, and plain `npm ci` skips devDependencies whenever
# NODE_ENV=production is set — but the build needs tailwindcss/typescript/tsx (all dev deps).
RUN npm ci --include=dev

# ---- builder: prisma client + next build ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder so env.ts validation passes while `next build` collects page data.
# Not used at runtime — Coolify injects the real DATABASE_URL into the running
# container, which overrides this (it's not carried into the runner stage below).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
# Prisma's query engine detects the libssl version at generate-time; bookworm-slim
# omits the `openssl` package by default and Prisma falls back to a guess otherwise.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runner: production image ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Same reason as the builder stage — the Prisma query engine needs `openssl`
# present at runtime to match its detected libssl build correctly.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# src/ isn't needed to *run* the build (.next is self-contained), but prisma/seed.ts
# imports src/lib/password.ts directly and is meant to be run inside this image
# (npm run db:seed) to create the first admin login after migrate deploy.
COPY --from=builder /app/src ./src
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Headless Chromium for the /print/* → PDF pipeline (src/lib/pdf.ts).
# Uses playwright-core's own CLI so the downloaded browser build matches
# the exact playwright-core version pinned in package.json.
RUN node_modules/.bin/playwright-core install --with-deps chromium \
  && chmod +x docker-entrypoint.sh

# Runtime-written directories (uploads, generated PDFs) — mount Coolify
# persistent volumes here so they survive redeploys. Everything else under
# public/ (brand assets, icons) comes from the image and must NOT be
# shadowed by an empty volume mount.
RUN mkdir -p public/uploads public/pdfs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
