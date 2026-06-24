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

# .output est autonome (Nitro bundle le runtime + deps nécessaires)
COPY --from=builder /app/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
