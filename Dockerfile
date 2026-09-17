# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install --no-install-recommends -y openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ENV NODE_ENV=production
# Prisma validates this variable while generating the client. The production
# database URL is supplied only when the finished container starts.
ENV DATABASE_URL=postgresql://travelplanner:build-only@postgres:5432/travelplanner?schema=public
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN cp next.config.docker.ts next.config.ts
RUN npx prisma generate
RUN npx next build --webpack

FROM base AS migrator
ENV NODE_ENV=production
COPY deploy/migrator/package.json deploy/migrator/package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
