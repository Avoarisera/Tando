# syntax=docker/dockerfile:1
# ============================================================
# Tando — Nuxt 4 SSR (node-server preset)
# Build pack Coolify = dockerfile. NE PAS activer is_static.
# Leçon portfolio (vault): npm install frais évite le bug
# des optional-deps natives (@oxc-parser/binding-*) de pnpm/yarn
# avec lockfile cross-plateforme. Le build tourne sur linux →
# le binding linux-x64 est résolu correctement.
# ============================================================

# ---- Builder ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# devDependencies requis pour `nuxt build`
ENV NODE_ENV=development

# Install frais depuis package.json (pas de lockfile cross-platform)
COPY package.json ./
RUN npm install --include=dev --no-audit --no-fund

COPY . .

# @nuxtjs/supabase valide la présence de ces vars au build.
# Valeurs publishable (non secrètes) injectées par Coolify en build-arg.
ARG SUPABASE_URL
ARG SUPABASE_KEY
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_KEY=$SUPABASE_KEY

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
