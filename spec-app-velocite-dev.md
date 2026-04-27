# Spec — App Vélocité Dev (Nuxt 3 + Supabase + Linear)

Cette spec décrit comment transformer le dashboard prototype en vraie application web,
connectée à Linear, avec drill-down par niveau de détail et transparence sur le calcul
des comparaisons. Sans LLM — uniquement des règles déterministes.

---

## 0. Vue d'ensemble en un schéma

```
┌─────────────────────────────────────────────────────────────────┐
│                          NAVIGATEUR                              │
│   Vue équipe ──► Vue dev ──► Vue ticket   (drill-down 3 niveaux) │
└────────────────────────────┬────────────────────────────────────┘
                             │
                       Nuxt 3 (SSR + API)
                             │
       ┌─────────────────────┼─────────────────────┐
       │                     │                     │
       ▼                     ▼                     ▼
   Composables         Server API            Auth client
   (useMetrics,        (metrics.get,         (Supabase JS)
    useInsight)         tickets.get,
                        sync.post)
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
           Supabase                Linear GraphQL
           (Postgres +             (api.linear.app/
            Auth + RLS)             graphql)
                                       │
                              ┌────────┴────────┐
                              ▼                 ▼
                          Issues +           Webhooks
                          History            (optionnel)
                          (cycle time
                           dev exact)
```

Idée maîtresse : **Supabase est le cache et la source de vérité historique** ; Linear est
re-synchronisé en incrémental via cron. Toute la lecture front passe par Supabase, jamais
directement par Linear → c'est rapide, gratuit en lecture, et survit aux rate limits Linear.

---

## 1. Stack technique

| Couche | Choix | Pourquoi |
|---|---|---|
| Framework | **Nuxt 3** (Vue 3 + TypeScript) | SSR natif, server routes intégrées, écosystème mûr |
| Style | **Tailwind CSS** | Rapide à styler, cohérent |
| UI components | **Nuxt UI** ou **shadcn-vue** | Composants prêts à l'emploi |
| Charts | **vue-chartjs** (Chart.js) | Léger, lisible, suffisant pour ce cas |
| Backend | **Nuxt server routes (Nitro)** | Pas besoin d'API séparée, tout dans Nuxt |
| DB + Auth | **Supabase** (Postgres) | Auth + RLS + realtime + dashboard SQL inclus |
| Sync incrémentale | **Supabase Edge Functions** ou cron Nuxt | Toutes les 15 min |
| Hosting | **Vercel** ou **Netlify** | Déploiement Git, free tier généreux |
| Linear client | `@linear/sdk` | SDK officiel TypeScript |

```bash
npx nuxi@latest init velocite-app
cd velocite-app
npm install @nuxtjs/supabase @nuxtjs/tailwindcss vue-chartjs chart.js @linear/sdk date-fns
```

---

## 2. Schéma Supabase

Multi-tenant (chaque user peut connecter SON Linear). RLS pour isoler les données.

```sql
-- Workspaces : un user → un (ou plusieurs) workspace Linear connecté
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  linear_api_key_encrypted text not null,
  last_synced_at timestamptz,
  created_at timestamptz default now()
);

create table linear_users (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  email text,
  display_name text,
  is_active boolean,
  raw jsonb,
  synced_at timestamptz default now()
);

create table linear_teams (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  name text,
  raw jsonb
);

create table linear_issues (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  identifier text,                  -- "UI-1234"
  title text,
  team_id text references linear_teams(id),
  assignee_id text,
  status text,                      -- "Q/A Check", "Done", etc.
  status_type text,                 -- "started" | "completed" | etc.
  estimate float,
  created_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  qa_started_at timestamptz,        -- ★ extrait de l'historique
  updated_at timestamptz,
  raw jsonb
);
create index on linear_issues(workspace_id, assignee_id, qa_started_at);
create index on linear_issues(workspace_id, team_id, status);

create table issue_history (
  id bigserial primary key,
  issue_id text references linear_issues(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  from_status text,
  to_status text,
  changed_at timestamptz not null,
  actor_id text
);
create index on issue_history(issue_id, changed_at);

-- Snapshots immuables : photos mensuelles des métriques
create table monthly_snapshots (
  id bigserial primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id text,
  team_id text,
  month date not null,             -- '2026-04-01'
  tickets_count int,
  points_sum float,
  bugs_count int,
  avg_size float,
  median_dev_cycle_hours float,
  ticket_ids text[],               -- ★ pour le drill-down
  computed_at timestamptz default now(),
  unique(workspace_id, user_id, team_id, month)
);

-- RLS : un user ne voit que ses workspaces
alter table workspaces enable row level security;
create policy "own workspaces" on workspaces
  for all using (user_id = auth.uid());

alter table linear_issues enable row level security;
create policy "own issues" on linear_issues for all using (
  workspace_id in (select id from workspaces where user_id = auth.uid())
);
-- (idem pour les autres tables)
```

---

## 3. Intégration Linear (GraphQL, pas REST)

Linear expose une **API GraphQL** sur `https://api.linear.app/graphql`. La REST API/MCP
n'expose PAS l'historique des transitions — c'est pour ça que le dashboard prototype ne
peut pas calculer le vrai cycle time dev. **GraphQL le permet** via le champ `history`.

### Auth

- **Pour ton usage perso au début** : Personal API Key (Settings → API → Create key)
- **Pour multi-utilisateur en prod** : OAuth 2.0 (https://developers.linear.app/docs/oauth/authentication)

```ts
// server/utils/linear-client.ts
import { LinearClient } from '@linear/sdk';

export function getLinearClient(apiKey: string) {
  return new LinearClient({ apiKey });
}
```

### La requête clé : issues + history

```ts
// server/utils/linear-queries.ts
export const ISSUES_WITH_HISTORY = /* GraphQL */ `
  query GetIssues($cursor: String, $teamId: String!, $after: DateTime!) {
    team(id: $teamId) {
      issues(
        first: 100,
        after: $cursor,
        filter: { updatedAt: { gte: $after } }
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          identifier
          title
          state { name type }
          assignee { id email displayName }
          estimate
          createdAt
          startedAt
          completedAt
          updatedAt
          history(first: 50) {
            nodes {
              id
              createdAt
              fromState { name }
              toState { name }
              actor { id }
            }
          }
        }
      }
    }
  }
`;
```

> ⚠️ Linear limite la profondeur des nested queries. Si tu as beaucoup de tickets avec
> beaucoup d'historique, fais deux passes : (1) liste les issues, (2) récupère history
> par batch via une query séparée.

### Sync incrémentale

```ts
// server/utils/linear-sync.ts
const DEV_DELIVERED_STATES = ['Q/A Check', 'Pending', 'UX Validation', 'PO Check', 'Done', 'Deployed'];

function extractQaStartedAt(historyNodes) {
  // Première transition vers un état "dev-delivered"
  const sorted = [...historyNodes].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const transition = sorted.find(h => DEV_DELIVERED_STATES.includes(h.toState?.name));
  return transition ? transition.createdAt : null;
}

export async function syncWorkspace(workspaceId: string) {
  const { apiKey, lastSyncedAt } = await getWorkspace(workspaceId);
  const linear = getLinearClient(apiKey);
  const since = lastSyncedAt ?? new Date(Date.now() - 1000 * 60 * 60 * 24 * 365); // 1 an

  const teams = await fetchAllTeams(linear);
  for (const team of teams) {
    let cursor = null;
    do {
      const res = await linear.client.rawRequest(ISSUES_WITH_HISTORY, {
        cursor, teamId: team.id, after: since.toISOString()
      });
      const issues = res.data.team.issues.nodes;

      for (const issue of issues) {
        await supabase.from('linear_issues').upsert({
          id: issue.id,
          workspace_id: workspaceId,
          identifier: issue.identifier,
          title: issue.title,
          team_id: team.id,
          assignee_id: issue.assignee?.id,
          status: issue.state.name,
          status_type: issue.state.type,
          estimate: issue.estimate,
          created_at: issue.createdAt,
          started_at: issue.startedAt,
          completed_at: issue.completedAt,
          updated_at: issue.updatedAt,
          qa_started_at: extractQaStartedAt(issue.history.nodes), // ★
          raw: issue
        });

        // Persistance de l'historique (utile pour analyses futures)
        const histRows = issue.history.nodes
          .filter(h => h.fromState && h.toState)
          .map(h => ({
            issue_id: issue.id,
            workspace_id: workspaceId,
            from_status: h.fromState.name,
            to_status: h.toState.name,
            changed_at: h.createdAt,
            actor_id: h.actor?.id
          }));
        if (histRows.length) {
          await supabase.from('issue_history').upsert(histRows, { onConflict: 'id' });
        }
      }

      cursor = res.data.team.issues.pageInfo.hasNextPage
        ? res.data.team.issues.pageInfo.endCursor : null;
    } while (cursor);
  }

  await supabase.from('workspaces')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', workspaceId);
}
```

Cron toutes les 15 min via une route Nuxt protégée + un cron externe (Vercel Cron, GitHub Actions, ou Supabase pg_cron).

---

## 4. Logique de calcul des métriques

### Fonctions pures (testables)

```ts
// shared/metrics.ts
export const DEV_DELIVERED_STATES = ['Q/A Check', 'Pending', 'UX Validation', 'PO Check', 'Done', 'Deployed'];

export interface Issue {
  id: string;
  assigneeId: string | null;
  status: string;
  estimate: number | null;
  startedAt: string | null;
  qaStartedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export function isDevDelivered(i: Issue) {
  return DEV_DELIVERED_STATES.includes(i.status);
}

export function devDeliveredAt(i: Issue): string {
  // Priorité : qa_started_at (extrait de l'history) > completed_at > updated_at
  return i.qaStartedAt ?? i.completedAt ?? i.updatedAt;
}

export function devCycleHours(i: Issue): number | null {
  if (!i.startedAt || !i.qaStartedAt) return null;
  return (+new Date(i.qaStartedAt) - +new Date(i.startedAt)) / 3_600_000;
}

export interface MonthlyMetrics {
  ticketsCount: number;
  pointsSum: number;
  bugsCount: number;
  avgSize: number;
  medianDevCycleHours: number;
  ticketIds: string[];   // ★ pour le drill-down
}

export function computeMonthly(
  issues: Issue[],
  devId: string,
  month: string  // 'YYYY-MM'
): MonthlyMetrics {
  const filtered = issues.filter(i =>
    i.assigneeId === devId &&
    isDevDelivered(i) &&
    monthKey(devDeliveredAt(i)) === month
  );

  const sizes = filtered.map(i => i.estimate).filter((x): x is number => x != null);
  const cycles = filtered.map(devCycleHours).filter((x): x is number => x != null);

  return {
    ticketsCount: filtered.length,
    pointsSum: sizes.reduce((s, x) => s + x, 0),
    bugsCount: filtered.length - sizes.length,
    avgSize: sizes.length ? sizes.reduce((s, x) => s + x, 0) / sizes.length : 0,
    medianDevCycleHours: median(cycles),
    ticketIds: filtered.map(i => i.id)
  };
}

function monthKey(d: string) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

function median(arr: number[]) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
```

### Server route pour servir les métriques

```ts
// server/api/metrics.get.ts
export default defineEventHandler(async (event) => {
  const { teamId, devIds, months } = getQuery(event);
  const supabase = await serverSupabaseClient(event);

  const { data: issues } = await supabase
    .from('linear_issues')
    .select('id, assignee_id, status, estimate, started_at, qa_started_at, completed_at, updated_at')
    .eq('team_id', teamId)
    .in('assignee_id', (devIds as string).split(','))
    .in('status', DEV_DELIVERED_STATES);

  const result: Record<string, Record<string, MonthlyMetrics>> = {};
  for (const devId of (devIds as string).split(',')) {
    result[devId] = {};
    for (const m of (months as string).split(',')) {
      result[devId][m] = computeMonthly(issues ?? [], devId, m);
    }
  }
  return result;
});
```

---

## 5. Niveaux de détail (drill-down)

### Niveau 1 — Vue équipe (`/teams/[teamId]`)

- KPIs agrégés équipe (tickets, points, bugs, médiane cycle)
- Heatmap dev × mois (couleur = volume normalisé)
- Top contributeurs
- Cliquer une ligne dev → niveau 2

### Niveau 2 — Vue dev (`/teams/[teamId]/devs/[devId]`)

- Les 4 KPIs du mois courant + variation MoM
- 3 graphes mois par mois (tickets / points / composition)
- **Tableau cliquable** des tickets livrés du mois courant : identifier, title, points, status, cycle time dev, lien Linear
- Cycle time dev histogram (P50, P75, P90)
- Cliquer un ticket → niveau 3

### Niveau 3 — Vue ticket (`/issues/[id]`)

- Détails du ticket (title, assignee, points, état actuel)
- **Timeline complète** : tous les événements `issue_history` triés
- Temps passé dans chaque état (entonnoir : Backlog → Todo → In Progress → Review → QA → Done)
- Drapeaux : aller-retours In Progress↔Review (rework), temps QA anormal
- Lien direct Linear

---

## 6. Comparaison transparente — la partie "détail individuel selon le calcul"

C'est le point que tu demandes : que chaque chiffre de la comparaison soit **explicable**.

### Composant `<DevComparison>`

```vue
<!-- components/DevComparison.vue -->
<template>
  <div class="cmp-card">
    <h2>Comparaison {{ devA.name }} vs {{ devB.name }}</h2>

    <table class="cmp-table">
      <thead>
        <tr>
          <th>Métrique (moy. {{ window }} mois)</th>
          <th>{{ devA.name }}</th>
          <th>{{ devB.name }}</th>
        </tr>
      </thead>
      <tbody>
        <CmpRow
          v-for="row in rows"
          :key="row.key"
          :row="row"
          :devA="devA" :devB="devB"
          @drill="openDrilldown"
        />
      </tbody>
    </table>

    <ComparisonInsights :metrics-a="metricsA" :metrics-b="metricsB" />

    <MetricDrilldown
      v-if="drilldown"
      :metric="drilldown.metric"
      :devId="drilldown.devId"
      :months="months"
      @close="drilldown = null"
    />
  </div>
</template>
```

### Le composant clé : `<MetricDrilldown>`

Click sur une cellule "Tickets/mois 12.3" → ouvre un panneau qui montre EXACTEMENT
comment ce 12.3 a été calculé :

```vue
<!-- components/MetricDrilldown.vue -->
<template>
  <div class="drill">
    <h3>Détail du calcul : {{ metricLabel }}</h3>

    <div class="formula">
      {{ avgValue }} = ({{ monthlyValues.join(' + ') }}) / {{ monthlyValues.length }}
    </div>

    <div v-for="(month, i) in months" :key="month" class="month-block">
      <header @click="expanded[month] = !expanded[month]">
        <span>{{ monthLabel(month) }}</span>
        <strong>{{ monthlyValues[i] }} {{ unit }}</strong>
        <button>{{ expanded[month] ? '▼' : '▶' }}</button>
      </header>
      <ul v-if="expanded[month]">
        <li v-for="t in tickets[month]" :key="t.id">
          <a :href="t.linear_url" target="_blank">{{ t.identifier }}</a>
          — {{ t.title }}
          <span class="badge">{{ t.estimate ?? 'no estimate' }} pts</span>
          <span class="badge" :class="t.status_class">{{ t.status }}</span>
        </li>
      </ul>
    </div>

    <p class="note">
      Note méthodo : {{ methodologyNote }}
    </p>
  </div>
</template>
```

Le `methodologyNote` change selon la métrique :

- Tickets/mois → "Compte les tickets passés en Q/A Check ou plus loin dans le mois (date de transition)."
- Points/mois → "Somme des estimates des tickets livrés. Bugs sans estimation exclus."
- Bugs/mois → "Tickets livrés sans estimate (proxy 'bug urgent')."
- Cycle time dev → "Médiane de (qa_started_at − started_at). Vraie mesure du temps dev, sans QA/PO."

Cette transparence est cruciale : si tu utilises ces chiffres en évaluation, le dev doit
pouvoir auditer ses propres chiffres et challenger.

### Auto-interprétation rule-based (sans LLM)

```ts
// composables/useComparisonInsight.ts
export function compareDevs(mA, mB, nameA, nameB, months) {
  const avg = (m, key, n = 3) => {
    const slice = months.slice(-n);
    return slice.reduce((s, k) => s + (m[k]?.[key] ?? 0), 0) / slice.length;
  };

  const sections = [];

  // Volume
  const aT = avg(mA, 'ticketsCount'), bT = avg(mB, 'ticketsCount');
  if (aT > bT * 1.2) sections.push({
    key: 'volume',
    text: `${nameA} livre plus de tickets (~${aT.toFixed(1)}/mois vs ${bT.toFixed(1)}, +${pct(aT, bT)}%).`
  });
  // ... idem pour complexité, profil bug/feature, trajectoire, synthèse

  return sections;
}
```

(Logique identique à l'artifact actuel — tu peux la copier-coller en l'adaptant en TS.)

---

## 7. Structure de projet

```
velocite-app/
├── pages/
│   ├── index.vue                      # Liste des workspaces du user
│   ├── workspaces/[id]/
│   │   └── index.vue                  # Choix d'équipe
│   ├── teams/[teamId]/
│   │   ├── index.vue                  # Vue équipe
│   │   ├── devs/[devId].vue          # Vue dev
│   │   └── compare.vue               # Comparaison 2 devs
│   └── issues/[id].vue               # Vue ticket
├── components/
│   ├── DevCard.vue
│   ├── DevComparison.vue
│   ├── ChartTickets.vue ChartPoints.vue ChartComposition.vue
│   ├── InsightBadge.vue              # bandeau coloré sous chaque graphe
│   ├── MetricDrilldown.vue           # ★ panneau "détail du calcul"
│   ├── TicketsTable.vue
│   └── HistoryTimeline.vue           # niveau 3
├── composables/
│   ├── useMetrics.ts
│   ├── useInsight.ts
│   └── useComparisonInsight.ts
├── shared/
│   └── metrics.ts                     # fonctions pures réutilisées server + client
├── server/
│   ├── api/
│   │   ├── metrics.get.ts
│   │   ├── tickets.get.ts             # liste tickets pour drill-down
│   │   ├── ticket-history.get.ts
│   │   └── sync.post.ts               # endpoint cron
│   └── utils/
│       ├── linear-client.ts
│       ├── linear-queries.ts
│       └── linear-sync.ts
├── plugins/
│   └── supabase.client.ts
├── supabase/
│   └── migrations/                    # SQL versionné
└── nuxt.config.ts
```

---

## 8. Roadmap suggérée (5-6 semaines en solo)

| Sprint | Durée | Livrables |
|---|---|---|
| **1 — Foundations** | 1 sem | Setup Nuxt, Supabase (schéma + RLS), auth, formulaire d'ajout d'API key Linear, sync initial complet (1 fois) |
| **2 — Vue équipe + dev** | 1 sem | Page équipe avec heatmap, page dev avec les 3 graphes, KPIs, sélection devs |
| **3 — Vrai cycle time** | 1 sem | Sync incrémental via cron, extraction `qa_started_at` depuis history, médianes calculées proprement |
| **4 — Drill-down** | 1 sem | Vue ticket + timeline, liste tickets cliquables, modale détail du calcul |
| **5 — Comparaison** | 1 sem | Page compare avec tableau côte-à-côte, drill par cellule, insights rule-based multi-paragraphes |
| **6 — Polish** | 0.5-1 sem | Export CSV, filtre par cycle Linear, dark mode, tests E2E, déploiement Vercel |

---

## 9. Coûts mensuels

| Item | Coût |
|---|---|
| Supabase free tier (500 MB DB, 50 K MAU) | 0 € |
| Vercel hobby | 0 € |
| Domaine custom | ~10 €/an |
| Linear API | inclus dans ton plan |
| **Total au démarrage** | ~0 € + 10 €/an |

Si la DB dépasse 500 MB ou si tu dois supporter plusieurs équipes, Supabase Pro (~25 €/mois)
+ Vercel Pro si tu as besoin d'edge functions plus rapides (~20 €/mois).

---

## 10. Pièges à éviter

- **Pagination GraphQL** : Linear limite à 100 par page sur les nested queries. Si tu vois
  des 504 ou des "complexity exceeded", découple : query 1 = issues seules, query 2 = history par batch.
- **Rate limit Linear** : ~1500 req/min par API key. Sync initial sur gros workspace → batcher avec `await sleep(50)`.
- **Time zones** : tous les timestamps Linear sont UTC. Convertir en local UNIQUEMENT à l'affichage.
- **Re-sync intelligent** : ne re-fetch QUE les issues `updated_at > last_synced_at`. Linear renvoie tout ce qui a bougé, c'est ton job de stocker `last_synced_at` proprement.
- **Snapshots immuables** : une fois qu'un mois est passé, calcule UNE FOIS et stocke dans `monthly_snapshots`. Sinon les chiffres "bougent" si quelqu'un re-touche un vieux ticket → expérience cassée.
- **Goodhart's law** : avant de mettre en prod pour évaluation officielle, communique TRÈS clairement à l'équipe ce qui est mesuré et pourquoi. Sinon → gaming garanti (tickets découpés, reviews bâclées). Cette app est un outil de discussion, pas de notation.
- **RLS Supabase** : DOUBLE-check les politiques. Une mauvaise policy = un user voit les données d'un autre tenant.

---

## 11. Tests à écrire (au minimum)

```ts
// tests/metrics.spec.ts
import { describe, it, expect } from 'vitest';
import { computeMonthly, isDevDelivered, devCycleHours } from '~/shared/metrics';

describe('isDevDelivered', () => {
  it('retient Q/A Check', () => {
    expect(isDevDelivered({ status: 'Q/A Check' } as any)).toBe(true);
  });
  it('exclut In Progress', () => {
    expect(isDevDelivered({ status: 'In Progress' } as any)).toBe(false);
  });
});

describe('devCycleHours', () => {
  it('calcule correctement avec qa_started_at', () => {
    const i = { startedAt: '2026-04-01T10:00Z', qaStartedAt: '2026-04-02T14:00Z' };
    expect(devCycleHours(i as any)).toBeCloseTo(28);
  });
  it('renvoie null sans qa_started_at', () => {
    expect(devCycleHours({ startedAt: '2026-04-01' } as any)).toBeNull();
  });
});

describe('computeMonthly', () => {
  // Cas : 3 tickets en avril 2026, 2 estimés (5 et 3 pts), 1 bug
  // Vérifier ticketsCount=3, pointsSum=8, bugsCount=1, avgSize=4
});
```

---

## En résumé : checklist de démarrage

1. `npx nuxi@latest init velocite-app` + dépendances
2. Créer projet Supabase, exécuter le SQL ci-dessus
3. Page de connexion Linear API key (chiffrer côté server avec une `SECRET_KEY` env)
4. Server route `sync.post.ts` qui appelle `syncWorkspace()` — tester manuellement
5. Page `/teams/[teamId]/devs/[devId]` qui affiche les 3 graphes
6. Itérer : drill-down → comparaison → insights → polish

Bon courage. Si tu bloques sur un sprint, reviens avec la question précise et je détaille.
