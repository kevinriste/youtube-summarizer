# Install dependencies only when needed
# Stage 1: App dependencies
FROM node:22-alpine AS deps
# See: https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#alpine-linux
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy manifest(s) and install dependencies (uses lockfile when present)
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build app
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build


# Production image, copy all the files and run next

# Stage 3: Final runtime image
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Public assets
COPY --from=builder /app/public ./public

# Use Next.js standalone output to minimize runtime image
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js is produced by Next.js standalone build
CMD ["node", "server.js"]
