# --- deps: install once, cached separately from source changes ---
FROM node:20-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# --- dev: local development target (docker-compose.dev.yml), live reload
# against a bind-mounted source tree. Not used by the default build. ---
FROM node:20-slim AS dev

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]

# --- builder: production build, needs NEXT_PUBLIC_* baked in at build time ---
FROM node:20-slim AS builder

WORKDIR /app

# NEXT_PUBLIC_ vars are compiled into the browser bundle by `next build`,
# not read at container start - must arrive as a build arg, not a runtime
# `environment:` value (which would have no effect on what ships to the
# browser). This is the only backend URL the frontend needs now - it calls
# FastAPI directly with a Bearer token, no server-side proxy layer anymore.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner: only the standalone server output, no source/node_modules ---
FROM node:20-slim AS runner

ENV NODE_ENV=production \
    PORT=3000

RUN groupadd --system nodejs && useradd --system --gid nodejs nextjs

WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
