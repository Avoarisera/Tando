# Features — Infrastructure & Données de démo

> Catégorie : INFRA | Features F24 – F26

---

### F24 — Setup projet (Nuxt + Tailwind + Supabase)

**PRD ref:** Section 1, Section 8, Sprint 1  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** —  
**Sprint:** 1  
**Dépendances:** aucune

**Description**  
Configuration initiale du projet Nuxt 4.4.2 avec Tailwind CSS et le module `@nuxtjs/supabase`. Mise en place des variables d'environnement, du client Supabase, et de la structure de dossiers de base.

**Critères d'acceptation**
- [ ] `@nuxtjs/supabase` installé et configuré dans `nuxt.config.ts`
- [ ] `tailwindcss` configuré avec purge sur `app/**/*.{vue,ts}`
- [ ] Variables d'environnement définies : `SUPABASE_URL`, `SUPABASE_KEY` (anon), `SUPABASE_SERVICE_KEY` (seed uniquement)
- [ ] `useSupabaseClient()` et `useSupabaseUser()` fonctionnels en développement
- [ ] Structure de dossiers : `app/pages/`, `app/layouts/`, `app/components/`, `app/composables/`, `supabase/`
- [ ] `nuxt dev` démarre sans erreur

**Cas limites / Considérations techniques**
- `SUPABASE_SERVICE_KEY` ne doit jamais être exposée côté client (uniquement dans `supabase/seed.sql` ou scripts Node.js serveur)
- Nuxt 4 : le dossier applicatif est `app/` (pas `pages/` à la racine) — vérifier la compatibilité avec `@nuxtjs/supabase` v2
- Tailwind v4 change l'API de configuration — vérifier la compatibilité avec la version installée

---

### F25 — Script seed idempotent

**PRD ref:** Section 10  
**Priorité:** Must  
**Complexité:** Medium  
**Personas:** —  
**Sprint:** 1  
**Dépendances:** F05 (schéma DB + RLS), F17 (trigger)

**Description**  
Script SQL `supabase/seed.sql` créant les comptes Supabase Auth, les profils, les équipes, les types de congé, les soldes initiaux et les 4 demandes de démo. Le script est idempotent : relançable sans créer de doublons ni d'erreurs.

**Critères d'acceptation**
- [ ] 4 utilisateurs créés dans `auth.users` : admin@waka.com, manager@waka.com, employee1@waka.com, employee2@waka.com (mot de passe : `Waka2026!`)
- [ ] 1 équipe : "Équipe A"
- [ ] 4 profils dans `profiles` (admin sans team_id, les 3 autres dans Équipe A)
- [ ] 4 types de congé actifs : Congé payé (#4CAF50), Congé maladie (#F44336), RTT (#2196F3), Congé sans solde (#9E9E9E)
- [ ] Soldes `leave_balances` : 25 jours de Congé payé pour Marc, Emma, Eddy (année 2026)
- [ ] 4 demandes pré-seedées avec les statuts et dates du PRD Section 10
- [ ] `used_days` cohérent avec les demandes `approved` seedées (Emma : 5 jours)
- [ ] Script idempotent via `ON CONFLICT DO NOTHING` ou `INSERT ... ON CONFLICT DO UPDATE`

**Cas limites / Considérations techniques**
- La création des utilisateurs Supabase Auth nécessite le `service_role` key (pas la clé anon) — utiliser `supabase/seed.sql` via la CLI Supabase (`supabase db seed`) ou un script Node.js séparé avec le SDK Admin
- Le trigger F17 se déclenche à l'INSERT de la demande `approved` d'Emma — s'assurer que `leave_balances` existe avant les demandes dans l'ordre du seed
- Les UUIDs peuvent être fixés dans le seed pour garantir l'idempotence (même UUID à chaque relance)
- Tester le seed en environnement local Supabase (`supabase start`) avant de pousser en prod

---

### F26 — Déploiement Vercel + smoke test

**PRD ref:** Section 7 (Non-Functional Requirements)  
**Priorité:** Must  
**Complexité:** Low  
**Personas:** —  
**Sprint:** 3  
**Dépendances:** F24, F25

**Description**  
Déploiement du build Nuxt SSR sur Vercel, connecté au projet Supabase. Variables d'environnement configurées dans Vercel Dashboard. Smoke test post-déploiement sur les 5 journeys utilisateur.

**Critères d'acceptation**
- [ ] `nuxt build` réussit sans erreur ni warning bloquant
- [ ] Variables `SUPABASE_URL` et `SUPABASE_KEY` configurées dans Vercel Env (Production + Preview)
- [ ] URL de production accessible et page `/login` affichée
- [ ] Smoke test : login admin, manager, employé → pas d'erreur 500
- [ ] Smoke test : création demande, approbation manager, approbation admin → flux complet sans erreur
- [ ] Smoke test : calendrier affiché pour les 3 rôles

**Cas limites / Considérations techniques**
- Nuxt 4 SSR sur Vercel nécessite le preset `vercel` (automatiquement détecté par Nitro)
- Ne pas committer `SUPABASE_SERVICE_KEY` dans le repo — seed exécuté manuellement en local ou via CLI Supabase
- Redéploiement automatique sur push `main` recommandé (GitHub integration Vercel)
