# Multi-stage build for a small Next.js standalone image, suitable for AWS App Runner
# (or any container host). The final image runs `node server.js` and honors $PORT.

# ---- deps: install production-resolved node_modules ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: produce the standalone output ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No MONGODB_URI needed at build time: pages are dynamic and the DB client is lazy.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# App Runner provides PORT; default to 3000 locally. Bind all interfaces.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# tracker.js and other assets. --chown so the non-root nextjs user can read them
# (source files may be group/owner-only, which would otherwise 500 on static reads).
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Standalone server + its trimmed node_modules:
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets (JS/CSS chunks) the standalone server serves:
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
# Force the bind address at invocation: some platforms (e.g. AWS App Runner) inject their
# own HOSTNAME env var, which would otherwise override ENV above and make Next bind to a
# single interface — failing health checks. Setting it inline here can't be overridden.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
