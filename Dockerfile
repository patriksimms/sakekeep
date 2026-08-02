# syntax=docker/dockerfile:1.7

ARG BUN_IMAGE=oven/bun:1.3.9-slim@sha256:8ca06c7812d9050ccc4b80799685f395d6a0d051d3b7207dfd120e2b437b1ec9

FROM ${BUN_IMAGE} AS base
WORKDIR /app

FROM base AS production-dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM production-dependencies AS dependencies
RUN bun install --frozen-lockfile

FROM dependencies AS build
ARG VITE_SAKEKEEP_DEMO_MODE=false
ARG VITE_CLERK_PUBLISHABLE_KEY
# Publishable PostHog token; optional — without it the build ships no analytics at all.
ARG VITE_POSTHOG_PROJECT_TOKEN
ENV VITE_SAKEKEEP_DEMO_MODE=${VITE_SAKEKEEP_DEMO_MODE}
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
ENV VITE_POSTHOG_PROJECT_TOKEN=${VITE_POSTHOG_PROJECT_TOKEN}
COPY . .
RUN test "${VITE_SAKEKEEP_DEMO_MODE}" = "false"
RUN test -n "${VITE_CLERK_PUBLISHABLE_KEY}"
RUN bun run setup:icc
RUN bun run build

FROM build AS migrate
ENV NODE_ENV=production
CMD ["bun", "run", "db:migrate"]

FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --from=build --chown=bun:bun /app/.local/icc ./.local/icc
COPY --from=build --chown=bun:bun /app/assets/fonts ./assets/fonts
COPY --chown=bun:bun package.json server.ts ./
# server.ts runs from source, so its imports must exist here too. auth-config.ts has no
# imports of its own; keep it that way or extend this COPY.
COPY --chown=bun:bun src/server/auth-config.ts ./src/server/auth-config.ts
USER bun
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD ["bun", "-e", "const r=await fetch('http://127.0.0.1:3000/api/health');process.exit(r.ok?0:1)"]
CMD ["bun", "run", "start"]
