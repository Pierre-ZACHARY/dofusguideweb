# ============================================
# Stage 1: Dependencies installation
# ============================================
ARG NODE_VERSION=24.13.0-slim

FROM node:${NODE_VERSION} AS dependencies

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

ENV PYTHON=/usr/bin/python3

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/usr/local/share/.cache/yarn \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
  if [ -f package-lock.json ]; then \
    npm ci --no-audit --no-fund; \
  elif [ -f yarn.lock ]; then \
    corepack enable yarn && yarn install --frozen-lockfile; \
  elif [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm install --frozen-lockfile; \
  else \
    echo "No lockfile found." && exit 1; \
  fi

# ============================================
# Stage 2: Build SSR application
# ============================================
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production

RUN if [ -f package-lock.json ]; then \
    npm run web:build; \
  elif [ -f yarn.lock ]; then \
    corepack enable yarn && yarn web:build; \
  elif [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm web:build; \
  else \
    echo "No lockfile found." && exit 1; \
  fi

# ============================================
# Stage 3: Runtime
# ============================================
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
ENV DOFUSGUIDE_DB=/app/data/dofusguide.sqlite

COPY --from=builder --chown=node:node /app/.output ./.output
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/data ./data
COPY --from=builder --chown=node:node /app/drizzle-user ./drizzle-user

USER node

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
