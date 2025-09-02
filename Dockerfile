# Stage 1: Build youtube-transcript from PR and pack it
FROM node:22-alpine AS youtube-transcript
WORKDIR /yt-temp
RUN apk add --no-cache git
RUN git clone --depth=1 --branch fix/captions-parsing-fallback-issue-45 https://github.com/danielxceron/youtube-transcript.git . && \
    npm install && \
    npm run build && \
    npm pack

# Install dependencies only when needed
# Stage 2: App dependencies
FROM node:22-alpine AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy app's manifest files
# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

# Copy prebuilt youtube-transcript .tgz from previous stage
COPY --from=youtube-transcript /yt-temp/youtube-transcript-*.tgz ./youtube-transcript.tgz

# Patch package.json to point to local tarball
RUN node -e "\
  const fs = require('fs'); \
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); \
  pkg.dependencies = pkg.dependencies || {}; \
  pkg.dependencies['youtube-transcript'] = 'file:./youtube-transcript.tgz'; \
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2)); \
"

# Install dependencies
RUN npm ci

# Stage 3: Build app
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# If using yarn comment out above and use below instead
# RUN yarn build

# Production image, copy all the files and run next

# Stage 4: Final runtime image
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
