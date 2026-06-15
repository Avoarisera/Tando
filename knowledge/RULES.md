# RULES.md — WakaBods POC
## Directives techniques et générales pour l'assistance au développement

**Version:** 1.0 | **Date:** 2026-04-21 | **Basé sur:** PRD v1.2 + Features v1.0

> Ces règles s'appliquent à tout code produit pour ce projet, qu'il soit écrit par un développeur ou généré par un assistant IA. Elles ont priorité sur les conventions génériques.

---

## 0. Vue d'ensemble

WakaBods POC est une application RH pour équipes remote : gestion de congés avec validation à deux niveaux (manager → admin), calendrier d'équipe et suivi de soldes. Stack : **Nuxt 4 + Vue 3 + Tailwind CSS + Supabase**. Déploiement : Vercel SSR. Durée : 3 sprints, 15 jours. Langue produit : français.

### Environnement de développement — Supabase local uniquement

Tout le développement se fait contre un Supabase **local** géré par la CLI :

```bash
supabase start          # démarre Postgres + Auth + Studio en local (Docker)
supabase db reset       # recrée le schéma + applique toutes les migrations
supabase db seed        # exécute supabase/seed.sql avec le service role local
supabase stop           # arrête les conteneurs
```

- **Supabase Studio local** : `http://localhost:54323`
- **URL API locale** : `http://localhost:54321`
- Les clés locales (`anon`, `service_role`) sont affichées par `supabase start` — les copier dans `.env`

**Le projet Supabase remote (cloud) n'est utilisé qu'à partir de RFC-013 (déploiement).** Ne jamais exécuter `supabase db push` vers le remote ni utiliser les outils MCP Supabase (`mcp__supabase__*`) pendant le développement — ils pointent vers le projet cloud.

---

## 1. Stack technique — Versions exactes

| Technologie | Version | Rôle |
|-------------|---------|------|
| Nuxt | 4.4.2 | Framework fullstack SSR |
| Vue | 3.5.x | UI framework |
| TypeScript | 5.x (via Nuxt) | Typage statique — obligatoire |
| Tailwind CSS | 4.x | Styling utilitaire |
| `@nuxtjs/supabase` | dernière v2 | Module Supabase officiel Nuxt |
| Supabase JS | v2 (via module) | Client Supabase |
| PostgreSQL | 15+ (Supabase managed) | Base de données |
| Yarn | 1.x | Gestionnaire de paquets (existant) |
| Vercel | — | Hébergement Nuxt SSR |

**Règles d'installation :**
- Toujours utiliser `yarn add` — jamais `npm install`
- Ne pas ajouter de dépendances non listées sans justification explicite
- Préférer les fonctionnalités natives Nuxt/Vue avant d'introduire une librairie tierce

---

## 2. Structure du projet

Nuxt 4 utilise le dossier `app/` comme racine applicative. Respecter cette structure strictement :

```
waka-bods/
├── app/
│   ├── app.vue                  # Root component (layout switcher)
│   ├── pages/
│   │   ├── login.vue
│   │   ├── profile.vue
│   │   ├── leave-requests.vue
│   │   ├── calendar.vue
│   │   └── leave-types.vue
│   ├── layouts/
│   │   └── private.vue          # Layout avec nav sidebar
│   ├── components/
│   │   ├── app/                 # Composants génériques réutilisables
│   │   │   ├── AppButton.vue
│   │   │   ├── AppModal.vue
│   │   │   ├── AppConfirmModal.vue
│   │   │   ├── AppToast.vue
│   │   │   ├── AppToastContainer.vue
│   │   │   ├── AppSkeleton.vue
│   │   │   ├── AppErrorBanner.vue
│   │   │   ├── AppEmptyState.vue
│   │   │   └── AppBadge.vue
│   │   ├── leave/               # Composants spécifiques aux congés
│   │   │   ├── LeaveRequestForm.vue
│   │   │   ├── LeaveRequestTable.vue
│   │   │   ├── LeaveStatusBadge.vue
│   │   │   └── LeaveBalanceCard.vue
│   │   ├── calendar/
│   │   │   ├── CalendarGrid.vue
│   │   │   └── CalendarEvent.vue
│   │   └── nav/
│   │       ├── AppSidebar.vue
│   │       └── AppMobileDrawer.vue
│   ├── composables/
│   │   ├── useCurrentUser.ts    # Rôle + profil de l'utilisateur connecté
│   │   ├── useLeaveRequests.ts
│   │   ├── useLeaveBalances.ts
│   │   ├── useLeaveTypes.ts
│   │   ├── useCalendar.ts
│   │   └── useToast.ts
│   ├── middleware/
│   │   ├── auth.global.ts       # Protection globale des routes privées
│   │   └── admin-only.ts        # Protection /leave-types
│   └── error.vue                # Page 404 / erreurs globales
├── supabase/
│   ├── seed.sql
│   ├── migrations/              # Migrations SQL numérotées
│   └── functions/               # (vide pour le POC)
├── knowledge/                   # Documentation projet (non déployée)
│   ├── PRD.md
│   ├── RULES.md
│   └── features/
├── public/
├── nuxt.config.ts
├── package.json
├── tsconfig.json
└── .env                   # Jamais commité
```

**Règles de structure :**
- Ne jamais créer de dossiers hors de cette structure sans raison documentée
- Les composants `app/` sont génériques et sans logique métier
- Les composants `leave/`, `calendar/`, `nav/` sont spécifiques et peuvent contenir de la logique
- Un composant = un fichier = une responsabilité

---

## 3. TypeScript

- **TypeScript obligatoire** sur tous les fichiers `.ts` et `<script setup lang="ts">` dans les `.vue`
- Pas de `any` explicite — utiliser `unknown` si le type est réellement inconnu, puis le narrower
- Définir des interfaces pour toutes les entités métier dans `app/types/index.ts` :

```ts
// Exemples obligatoires
interface Profile {
  id: string
  first_name: string
  last_name: string
  role: 'admin' | 'manager' | 'employee'
  team_id: string | null
  joined_at: string
}

type LeaveStatus = 'pending' | 'manager_approved' | 'approved' | 'rejected'

interface LeaveRequest {
  id: string
  user_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  days_count: number
  status: LeaveStatus
  comment: string | null
  manager_reviewed_by: string | null
  manager_reviewed_at: string | null
  admin_reviewed_by: string | null
  admin_reviewed_at: string | null
  created_at: string
}

interface LeaveType {
  id: string
  name: string
  color: string
  is_active: boolean
}

interface LeaveBalance {
  id: string
  user_id: string
  leave_type_id: string
  year: number
  allocated_days: number
  used_days: number
}
```

- Les types Supabase peuvent être générés via `supabase gen types typescript` et importés dans `app/types/database.ts`
- Typer tous les retours de composables et les props de composants

---

## 4. Conventions de nommage

### Fichiers
| Type | Convention | Exemple |
|------|-----------|---------|
| Pages | `kebab-case.vue` | `leave-requests.vue` |
| Layouts | `kebab-case.vue` | `private.vue` |
| Composants | `PascalCase.vue` | `AppButton.vue`, `LeaveStatusBadge.vue` |
| Composables | `camelCase.ts` avec préfixe `use` | `useCurrentUser.ts` |
| Types | `camelCase.ts` | `index.ts` dans `types/` |
| Migrations SQL | `YYYYMMDD_description.sql` | `20260421_create_tables.sql` |

### Variables et fonctions
- **Variables réactives :** `camelCase` — `const isLoading = ref(false)`
- **Composables :** toujours commencer par `use` — `useLeaveRequests()`
- **Props :** `camelCase` — `modelValue`, `leaveRequest`
- **Émissions d'événements :** `kebab-case` — `emit('update:modelValue')`, `emit('request-approved')`
- **Constantes globales :** `SCREAMING_SNAKE_CASE` — `const LEAVE_STATUS_LABELS = {...}`
- **Variables Supabase :** ne jamais nommer une variable `supabase` en global — utiliser `useSupabaseClient()` localement

### Nommage sémantique
- Les booléens commencent par `is`, `has`, `can`, `should` : `isLoading`, `hasError`, `canApprove`
- Les handlers d'événements commencent par `handle` : `handleSubmit`, `handleApprove`
- Les fonctions de chargement commencent par `fetch` ou `load` : `fetchLeaveRequests`, `loadProfile`

---

## 5. Composants Vue

### Template
- `<script setup lang="ts">` toujours en premier, avant `<template>` et `<style>`
- Ordre dans le script : imports → types/interfaces → props → emits → composables → état local → computed → fonctions → lifecycle hooks
- Pas de logique complexe dans le template — déléguer aux computed ou aux fonctions
- Utiliser `v-bind` raccourci (`:`) et `v-on` raccourci (`@`)
- Les `v-if` et `v-for` ne peuvent pas être sur le même élément — utiliser `<template>` intermédiaire

```vue
<!-- Correct -->
<template>
  <template v-if="isLoading">
    <AppSkeleton v-for="i in 3" :key="i" />
  </template>
  <ul v-else>
    <li v-for="item in items" :key="item.id">...</li>
  </ul>
</template>
```

### Props & Emits
- Toujours définir les props avec `withDefaults(defineProps<...>(), {...})`
- Toujours définir les emits avec `defineEmits<{...}>()`
- Les props obligatoires n'ont pas de valeur par défaut
- Pas de mutation directe des props — émettre un événement

### Composants génériques (`app/`)
- Aucune dépendance à Supabase ou aux composables métier
- Props explicites, pas de logique implicite
- Exposer un slot `default` quand le contenu est variable

---

## 6. Composables & État

**Règle fondamentale :** pas de Pinia pour le POC. État géré via `useState()` Nuxt (SSR-safe) pour l'état global partagé, `ref()`/`computed()` pour l'état local.

### Patron standard d'un composable

```ts
// app/composables/useLeaveRequests.ts
export function useLeaveRequests() {
  const supabase = useSupabaseClient()
  const requests = useState<LeaveRequest[]>('leave-requests', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchRequests() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: sbError } = await supabase
        .from('leave_requests')
        .select('*, leave_types(*), profiles!user_id(*)')
        .order('created_at', { ascending: false })
      if (sbError) throw sbError
      requests.value = data ?? []
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur inconnue'
    } finally {
      isLoading.value = false
    }
  }

  return { requests: readonly(requests), isLoading: readonly(isLoading), error: readonly(error), fetchRequests }
}
```

**Règles composables :**
- Retourner les refs en `readonly()` pour éviter les mutations extérieures
- Toujours exposer `isLoading` et `error` — jamais cacher les états asynchrones
- `useState()` pour l'état partagé entre pages (conservé lors des navigations)
- `ref()` pour l'état local à un composant ou une session de composable
- Ne jamais appeler `useSupabaseClient()` au niveau module (hors d'un composable ou d'un setup) — Nuxt injecte le client au runtime

### Composable `useCurrentUser`
Ce composable est critique — utilisé dans le layout, les middleware et de nombreux composants :

```ts
export function useCurrentUser() {
  const user = useSupabaseUser()
  const profile = useState<Profile | null>('current-profile', () => null)
  
  // Charger le profil une seule fois par session
  async function loadProfile() { ... }
  
  const isAdmin = computed(() => profile.value?.role === 'admin')
  const isManager = computed(() => profile.value?.role === 'manager')
  const isEmployee = computed(() => profile.value?.role === 'employee')
  
  return { user, profile: readonly(profile), isAdmin, isManager, isEmployee, loadProfile }
}
```

---

## 7. Supabase — Patterns d'intégration

### Client
- Utiliser exclusivement `useSupabaseClient()` côté client et dans les composables
- `useSupabaseUser()` pour l'utilisateur Auth courant (réactif)
- Ne jamais instancier `createClient()` manuellement — le module `@nuxtjs/supabase` le gère

### Requêtes
- Toujours destructurer `{ data, error }` et traiter les deux cas
- Toujours vérifier `if (error) throw error` avant d'utiliser `data`
- Utiliser les jointures Supabase (`select('*, related_table(*)')`) plutôt que des requêtes N+1

```ts
// Correct
const { data, error } = await supabase
  .from('leave_requests')
  .select(`
    *,
    leave_types (id, name, color),
    profiles!user_id (id, first_name, last_name),
    teams (name)
  `)
  .eq('status', 'pending')

if (error) throw error
```

### RPC (fonctions PostgreSQL)
- Appeler les RPC via `supabase.rpc('function_name', { param1, param2 })`
- Les erreurs de validation métier (chevauchement, solde insuffisant) sont retournées comme des erreurs Supabase standard — les intercepter et afficher le message à l'utilisateur

```ts
const { data, error } = await supabase.rpc('create_leave_request', {
  p_leave_type_id: leaveTypeId,
  p_start_date: startDate,
  p_end_date: endDate,
  p_comment: comment ?? null,
})
if (error) {
  // Afficher error.message à l'utilisateur (message de la RAISE EXCEPTION PostgreSQL)
  throw error
}
```

### Mises à jour de statut
- Les transitions de statut se font via `.update({ status, reviewed_by, reviewed_at })` — jamais via une RPC dédiée (sauf si la logique l'impose)
- Toujours envoyer `updated_at: new Date().toISOString()` si la colonne existe

### Variables d'environnement
- `SUPABASE_URL` et `SUPABASE_KEY` (anon) : configurées dans `nuxt.config.ts` via le module
- `SUPABASE_SERVICE_KEY` : **jamais côté client**, jamais dans `nuxt.config.ts` — uniquement dans les scripts Node.js de seed côté serveur
- `.env` est dans `.gitignore` — ne jamais committer

---

## 8. Routing & Middleware

### Routes
Correspondance exacte entre les pages et le PRD :

| Fichier | Route | Accès |
|---------|-------|-------|
| `app/pages/login.vue` | `/login` | Public |
| `app/pages/profile.vue` | `/profile` | Tous (authentifié) |
| `app/pages/leave-requests.vue` | `/leave-requests` | Tous (vue selon rôle) |
| `app/pages/calendar.vue` | `/calendar` | Tous (vue selon rôle) |
| `app/pages/leave-types.vue` | `/leave-types` | Admin uniquement |

### Middleware
```ts
// app/middleware/auth.global.ts
export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()
  const publicRoutes = ['/login']
  if (!user.value && !publicRoutes.includes(to.path)) {
    return navigateTo('/login')
  }
  if (user.value && to.path === '/login') {
    return navigateTo('/profile')
  }
})

// app/middleware/admin-only.ts
// Appliqué via definePageMeta dans leave-types.vue
export default defineNuxtRouteMiddleware(() => {
  const { isAdmin } = useCurrentUser()
  if (!isAdmin.value) {
    throw createError({ statusCode: 403, message: 'Accès refusé' })
  }
})
```

- `auth.global.ts` : s'applique à toutes les routes (convention Nuxt globale)
- `admin-only.ts` : déclaré dans `definePageMeta({ middleware: 'admin-only' })` dans `leave-types.vue`

---

## 9. Styling — Tailwind CSS

### Principes
- **Tailwind uniquement** — pas de CSS custom dans `<style>` sauf exception documentée
- Pas de classes inline complexes (> 8 classes) dans les templates — extraire dans un composant ou utiliser `@apply` dans un fichier CSS global pour les patterns répétitifs
- Pas de couleurs hardcodées en dehors de la palette Tailwind — utiliser les custom colors définies dans `tailwind.config`

### Palette de couleurs sémantiques à configurer dans `tailwind.config`
```js
// tailwind.config.ts
colors: {
  brand: {
    primary: '#2563EB',    // bleu principal
    success: '#16A34A',    // approbation
    warning: '#D97706',    // manager_approved
    danger: '#DC2626',     // refus / erreur
    muted: '#6B7280',      // éléments secondaires
  }
}
```

### Badges de statut — classes standardisées
| Statut | Classes Tailwind |
|--------|-----------------|
| `pending` | `bg-gray-100 text-gray-700` |
| `manager_approved` | `bg-amber-100 text-amber-700` |
| `approved` | `bg-green-100 text-green-700` |
| `rejected` | `bg-red-100 text-red-700` |

### Responsive
- Mobile-first : classes sans préfixe = mobile, `md:` = tablette, `lg:` = desktop
- Breakpoints utilisés : `md` (768px) et `lg` (1024px) — pas de `xl` ou `2xl` sauf exception
- Sidebar desktop : `hidden lg:flex` ; Hamburger mobile : `flex lg:hidden`

### Layout privé
- Sidebar fixe : `w-60 min-h-screen` (240px)
- Contenu principal : `flex-1 min-w-0 p-6`
- Pas de scroll horizontal sur mobile

---

## 10. Gestion des erreurs & États UI

### Règle fondamentale : zéro état silencieux
Toute opération asynchrone doit gérer explicitement les 4 états : loading, erreur, vide, succès.

### Pattern obligatoire dans les pages

```vue
<template>
  <div>
    <!-- Loading -->
    <template v-if="isLoading">
      <AppSkeleton v-for="i in 5" :key="i" class="mb-3" />
    </template>

    <!-- Erreur -->
    <AppErrorBanner v-else-if="error" :message="error" @retry="fetchData" />

    <!-- Vide -->
    <AppEmptyState
      v-else-if="items.length === 0"
      title="Aucun élément"
      description="Il n'y a rien ici pour le moment."
    />

    <!-- Contenu -->
    <ul v-else>
      <li v-for="item in items" :key="item.id">...</li>
    </ul>
  </div>
</template>
```

### Erreurs de formulaire
- Les erreurs de validation serveur (RPC) s'affichent **inline dans le formulaire/modal** — pas via un toast global
- Les erreurs de validation front s'affichent sous le champ concerné
- Les messages d'erreur viennent de l'exception PostgreSQL (`error.message`) — s'assurer que les messages sont en français dans les fonctions SQL

### Toasts
- **Succès :** après toute mutation réussie (création, approbation, refus, modification)
- **Erreur non bloquante :** si une action échoue et que le formulaire est déjà fermé
- **Pas de toast** pour les erreurs de formulaire (elles s'affichent inline)
- Auto-dismiss 3 secondes pour les succès ; persistant pour les erreurs (fermeture manuelle)

### Modales de confirmation
- Obligatoires avant : approuver une demande, refuser une demande
- Pas nécessaires pour : désactiver un type de congé (action réversible), déconnexion

---

## 11. Sécurité

### Règles absolues (non négociables)
1. **`SUPABASE_SERVICE_KEY` ne doit jamais apparaître côté client** — ni dans `nuxt.config.ts`, ni dans un composable, ni dans une page
2. **Ne jamais désactiver RLS** sur une table pour simplifier le développement — résoudre le problème de permission correctement
3. **Ne jamais se fier au rôle côté client seul** — la RLS applique les permissions côté serveur indépendamment
4. **Toujours valider côté serveur** les données critiques (chevauchement, solde) via RPC — la validation front est un confort UX, pas une sécurité
5. **Ne pas exposer les UUIDs dans les URL** (pas de `/profile/[id]`) — les pages affichent toujours les données de l'utilisateur connecté via `auth.uid()`

### Bonnes pratiques
- Lire le rôle depuis `profiles` en DB, pas depuis un claim JWT custom (pour le POC)
- Utiliser `readonly()` sur les refs exposées par les composables pour éviter les mutations externes
- Ne pas stocker de données sensibles dans `localStorage` ou `sessionStorage` — Supabase gère les tokens dans des cookies httpOnly

---

## 12. Base de données & Migrations

### Organisation des fichiers SQL
```
supabase/
├── migrations/
│   ├── 20260421_001_create_tables.sql     # Tables + contraintes
│   ├── 20260421_002_rls_policies.sql      # Toutes les policies RLS
│   ├── 20260421_003_trigger_balance.sql   # Trigger update_leave_balance
│   └── 20260421_004_rpc_functions.sql     # RPC create_leave_request
└── seed.sql                               # Données de démo
```

### Conventions SQL
- Noms de tables : `snake_case` pluriel — `leave_requests`, `leave_types`
- Noms de colonnes : `snake_case` — `created_at`, `user_id`
- Noms de fonctions PostgreSQL : `snake_case` avec verbe — `create_leave_request`, `update_leave_balance`
- Paramètres de fonctions : préfixe `p_` — `p_start_date`, `p_leave_type_id`
- Toutes les tables ont `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` et `created_at timestamptz DEFAULT now()`

### Trigger `update_leave_balance`
- Doit gérer les 4 cas : INSERT approved, UPDATE → approved, UPDATE approved → autre, INSERT non-approved
- Utiliser `SECURITY DEFINER` pour contourner la RLS lors de la mise à jour de `leave_balances`
- Toujours vérifier que la ligne `leave_balances` existe avant d'UPDATE (lever une exception explicite si absente)

### Seed
- Idempotent via `ON CONFLICT (id) DO NOTHING` ou `ON CONFLICT (id) DO UPDATE SET ...`
- Les UUIDs sont hardcodés dans le seed pour garantir l'idempotence
- Ordre d'insertion : teams → leave_types → profiles (auth.users déjà créés manuellement ou via script) → leave_balances → leave_requests
- La demande `approved` d'Emma doit être insérée en dernier (le trigger mettra à jour `used_days` automatiquement, donc `used_days` doit être à 0 avant)

---

## 13. Accessibilité

Niveau minimum WCAG 2.1 AA pour les éléments interactifs :

- Tous les boutons ont un label textuel ou `aria-label`
- Les champs de formulaire ont un `<label>` associé (`for` / `id`)
- Les messages d'erreur sont associés aux champs via `aria-describedby`
- Les modales ont `role="dialog"` + `aria-modal="true"` + focus trap
- Les badges de statut ont un `title` ou `aria-label` explicite (la couleur seule ne suffit pas)
- Les images décoratives ont `alt=""`

---

## 14. Responsive Design

- **Breakpoints cibles :** mobile 375px (iPhone SE) et desktop 1280px (laptop standard)
- Tester systématiquement aux deux breakpoints avant de valider une feature UI
- Le layout sidebar est `hidden` sur mobile — le drawer hamburger le remplace
- Les tableaux sur mobile : scroll horizontal (`overflow-x-auto`) ou version card stacked
- Les modales : plein écran sur mobile (< `md`), centré avec max-width sur desktop
- Les date pickers : utiliser `<input type="date">` natif (support universel, comportement OS natif mobile)

---

## 15. Ordre d'implémentation

Respecter l'ordre des sprints défini dans le PRD. Les features du chemin critique doivent être complètes avant de passer au sprint suivant.

### Sprint 1 — Fondations (obligatoire avant Sprint 2)
1. F24 — Setup Nuxt + Tailwind + Supabase
2. F05 — Schéma DB + RLS (migrations SQL)
3. F17 — Trigger `update_leave_balance`
4. F25 — Seed
5. F01, F02, F03, F04 — Auth + middleware
6. F08 — Navigation layout
7. F06, F07 — Profil + solde

### Sprint 2 — Congés & Validation (obligatoire avant Sprint 3)
8. F10 — RPC `create_leave_request`
9. F09 — Formulaire modal (employé)
10. F29, F30 — Modales + Toasts (nécessaires pour le feedback)
11. F11 — Historique employé
12. F12, F13 — Vue manager
13. F14, F15, F16 — Vue admin + bypass

### Sprint 3 — Calendrier & Polish
14. F18, F19, F20 — Calendrier
15. F21, F22, F23 — Types de congé
16. F27, F28 — États UI globaux + 404
17. F26 — Déploiement Vercel

---

## 16. Qualité du code

### Règles absolues
- **Pas de `TODO`, `FIXME`, `HACK` ou `any` dans le code livré** — si quelque chose est incomplet, c'est une feature non livrée, pas un placeholder
- **Pas de console.log dans le code livré** — utiliser uniquement pour le débogage local, retirer avant commit
- **Pas de code commenté** — si du code est retiré, il est supprimé (Git garde l'historique)
- **Pas de composants ou de fonctions non utilisés** — tree-shaking et lisibilité
- **Chaque composant fait une seule chose** — si un composant dépasse ~150 lignes de template, il doit être découpé

### Commentaires
- Un commentaire s'justifie uniquement si le **pourquoi** n'est pas évident depuis le code
- Les règles métier non triviales méritent un commentaire (ex. : la règle de bypass admin D3)
- Pas de commentaires décrivant ce que fait le code (le code se lit lui-même)

### Gestion des imports
- Auto-import Nuxt actif — ne pas importer manuellement `ref`, `computed`, `useRouter`, etc.
- Importer les types avec `import type { ... }` (pas d'import de valeur pour les types)
- Ordre des imports : types → composables → composants (si import explicite nécessaire)

---

## 17. Directives pour l'assistance IA

Ces règles s'appliquent à tout code généré par un assistant IA dans ce projet.

### Ce qu'il faut toujours faire
- **Lire le PRD et les features avant d'implémenter** — ne jamais supposer ce qu'une feature doit faire
- **Respecter les décisions actées** (section 15 du PRD) — ne pas proposer d'alternatives aux choix confirmés (Pinia, trigger vs à la volée, etc.)
- **Générer du TypeScript strict** — interfaces, types de retour, pas de `any`
- **Gérer les 4 états UI** (loading, error, empty, success) dans toute page ou section asynchrone
- **Respecter la RLS** — ne jamais contourner par commodité (pas de service key côté client)
- **Utiliser le français** pour toutes les chaînes visibles par l'utilisateur
- **Implémenter complet** — aucun placeholder, aucun `// TODO implement`, aucun stub non fonctionnel

### Ce qu'il ne faut jamais faire
- Installer une librairie non listée sans en discuter d'abord
- Créer un fichier hors de la structure définie en §2
- Ajouter des features hors scope PRD (pagination, notifications, export...)
- Changer les noms des entités DB ou les contraintes du schéma sans aligner avec le PRD
- Générer du code avec `any`, des `console.log` persistants ou des blocs commentés
- Proposer Pinia ou un autre store — composables Nuxt uniquement pour le POC
- Modifier les migrations déjà appliquées — créer une nouvelle migration

### En cas d'ambiguïté
1. Consulter le PRD (section correspondante) en priorité
2. Consulter les features (critères d'acceptation) en deuxième
3. Si toujours ambigu : demander à l'utilisateur — ne pas supposer et implémenter

### Revue d'une implémentation
Avant de déclarer une feature terminée, vérifier :
- [ ] TypeScript sans erreurs (`yarn nuxt typecheck`)
- [ ] Les 4 états UI présents (si page/section async)
- [ ] Responsive testé aux deux breakpoints
- [ ] Pas de `console.log`, `TODO`, `any` résiduels
- [ ] La feature correspond exactement aux critères d'acceptation du fichier features

---

## 18. Hors scope — Ne pas implémenter

Les éléments suivants sont **explicitement exclus** du POC. Toute demande d'implémentation dans ces domaines doit être refusée ou reportée :

| Domaine | Raison |
|---------|--------|
| Inscription self-service | Seed uniquement |
| Notifications email/push | MVP |
| Export PDF/CSV | MVP |
| Intégrations Slack, GCal, HRIS | MVP |
| Gestion des jours fériés | Jours calendaires simples |
| Acquisition mensuelle | Quota annuel fixe |
| Multi-langue | Français uniquement |
| Gestion des équipes (CRUD) | Équipes pré-seedées |
| Pagination | Volume démo limité |
| Historique mouvements de solde | D2 confirmé |
| Suppression de types de congé | Risque cohérence DB |
| Délégation de validation | D3 confirmé (bypass admin = solution retenue) |
| Pinia / Vuex | A7 confirmé |
| Avatar / photo de profil | — |
| Modification du profil | Données non modifiables POC |
