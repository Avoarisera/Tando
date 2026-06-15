# WakaBods

Plateforme RH légère pour équipes remote — gestion de congés avec validation à deux niveaux (manager → admin), calendrier d'équipe et suivi des soldes en temps réel.

POC livré en 3 sprints (15 jours). Langue produit : **français**.

---

## Fonctionnalités

- Authentification email/mot de passe (Supabase Auth)
- Trois rôles distincts : **employé**, **manager**, **admin**
- Création de demandes de congé avec contrôle des chevauchements et du solde (via RPC PostgreSQL)
- Validation à deux niveaux : manager (niveau 1) → admin (niveau 2)
- Calendrier d'équipe adapté au rôle
- Soldes calculés automatiquement par trigger PostgreSQL
- Types de congé configurables par l'admin
- Navigation responsive (sidebar desktop + drawer mobile)

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Framework | Nuxt 4.4.2 + Vue 3.5 (SSR, dossier `app/`) |
| Langage | TypeScript strict |
| Styling | Tailwind CSS 4 |
| Backend / Auth / DB | Supabase (Auth, PostgreSQL 15, RLS, RPC, triggers) |
| State management | Composables Nuxt (`useState`) — pas de Pinia |
| Tests | Playwright (E2E) + analyse statique |
| Déploiement | Vercel (SSR) |
| Package manager | Yarn |

---

## Prérequis

- Node.js 20+
- Yarn 1.x
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- Docker (pour Supabase local)

---

## Installation locale

**1. Cloner et installer les dépendances**

```bash
git clone <repo-url>
cd waka-bods
yarn install
```

**2. Démarrer Supabase en local**

```bash
supabase start
```

Notez les valeurs `API URL` et `anon key` affichées.

**3. Configurer les variables d'environnement**

```bash
cp .env.example .env
```

Renseigner dans `.env` :

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key>
SUPABASE_SERVICE_KEY=<service role key>   # seed local uniquement
```

**4. Appliquer les migrations et le seed**

```bash
supabase db reset
yarn seed:invoices
```

Cette commande applique les migrations dans `supabase/migrations/` et injecte le seed de démo.

**5. Lancer le serveur de développement**

```bash
yarn dev
```

L'application est disponible sur [http://localhost:3000](http://localhost:3000).

---

## Comptes de démo

| Rôle | Email | Mot de passe |
|------|-------|--------------|
| Admin | admin@waka.com | Waka2026! |
| Manager | manager@waka.com | Waka2026! |
| Employé | employee1@waka.com | Waka2026! |
| Employé | employee2@waka.com | Waka2026! |

---

## Scripts disponibles

```bash
yarn dev           # Serveur de développement
yarn build         # Build de production
yarn preview       # Prévisualisation du build de production
yarn test          # Suite de tests complète
yarn test:e2e      # Tests Playwright (E2E)
yarn test:e2e:ui   # Tests Playwright avec UI interactif
yarn test:static   # Analyse statique
yarn test:rls      # Tests d'intégration RLS
```

---

## Structure du projet

```
waka-bods/
├── app/
│   ├── pages/          # login, profile, leave-requests, calendar, leave-types
│   ├── layouts/        # private.vue (sidebar + contenu)
│   ├── components/     # app/ (génériques), leave/, calendar/, nav/
│   ├── composables/    # useCurrentUser, useLeaveRequests, useToast, …
│   ├── middleware/     # auth.global.ts, admin-only.ts
│   └── types/          # Interfaces TypeScript métier
├── supabase/
│   ├── migrations/     # SQL immuables (tables, RLS, trigger, RPC)
│   └── seed.sql        # Données de démo idempotentes
└── knowledge/          # PRD, RFCs, features — documentation projet
```

---

## Avancement

| Sprint | RFCs | Statut |
|--------|------|--------|
| Sprint 1 — Fondations | RFC-001 à RFC-004 | ✅ Done |
| Sprint 2 — Congés & Validation | RFC-005 à RFC-009 | ⬜ À faire |
| Sprint 3 — Calendrier & Polish | RFC-010 à RFC-013 | ⬜ À faire |

Voir [`knowledge/backlog.md`](knowledge/backlog.md) pour le détail RFC par RFC.
