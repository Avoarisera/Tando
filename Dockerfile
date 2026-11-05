# ============================================================
# Tando — Nuxt 4 SSR (node-server preset)
# Build pack Coolify = dockerfile. NE PAS activer is_static.
#
# Notes :
# - package.json a un hook "postinstall": "nuxt prepare" → il tourne
#   PENDANT `npm install`. Il charge @nuxtjs/supabase (qui exige
#   SUPABASE_URL/KEY) et a besoin du code source. Donc on pose les ENV
#   ET on copie la source AVANT l'install.
# - npm install frais (pas de lockfile cross-plateforme) → bindings
#   natifs résolus sur linux (leçon oxc-parser du vault).
# - Image builder = bookworm complète (python3/make/g++ pour d'éventuels
#   node-gyp). Le runner reste slim.
# ============================================================

# ---- Builder ----
FROM node:22-bookworm AS builder
WORKDIR /app

ENV NODE_ENV=development

# @nuxtjs/supabase valide ces vars dès `nuxt prepare` (postinstall) + au build.
# Valeurs publishable (non secrètes) injectées par Coolify en build-arg.
ARG SUPABASE_URL
ARG SUPABASE_KEY
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_KEY=$SUPABASE_KEY

# Source d'abord (postinstall nuxt prepare en a besoin)
COPY . .

RUN npm install --include=dev --no-audit --no-fund
RUN npm run build

# ---- Runner ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Le healthcheck Coolify appelle curl (ou wget) DANS le conteneur : sans lui,
# le nouveau conteneur est jugé "unhealthy" et Coolify revient à l'ancien
# (incident du 05/11/2026). L'image slim n'a ni curl ni wget.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD curl -fsS -o /dev/null http://localhost:3000/login || exit 1

# .output est autonome (Nitro bundle le runtime + deps nécessaires)
COPY --from=builder /app/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
