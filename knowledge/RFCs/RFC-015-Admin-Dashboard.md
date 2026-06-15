# RFC-015 — Admin Leave Dashboard

**ID:** RFC-015  
**Title:** Admin Leave Dashboard — /dashboard page, metrics, employee status list, client-side filter  
**Sprint:** 4  
**Complexity:** Medium  
**Predecessor:** RFC-014  
**Successor:** RFC-016 (Factures Vault)

---

## Summary

Ce RFC implémente la page `/dashboard` accessible uniquement aux admins. Avant ce RFC, il n'existe aucune vue synthétique de la capacité de l'équipe. Après, l'admin peut voir en un coup d'œil le nombre de présents/absents et le statut individuel de chaque employé, avec filtre client-side.

---

## Features Addressed

| Feature | Description |
|---------|-------------|
| F36 | Bandeau 4 métriques (total, en congé aujourd'hui, cette semaine, présents) |
| F37 | Liste statuts employés avec type de congé, date de retour, ancienneté |
| F38 | Filtre client-side présents / en congé |

---

## Dependencies

- **Requires:** RFC-014 (RPC `get_dashboard_snapshot`, tables existantes)
- **Enables:** RFC-016

---

## Technical Approach

### New files

```
app/
├── pages/
│   └── dashboard.vue                  ← nouvelle page admin-only
├── composables/
│   └── useDashboard.ts                ← appel RPC + état
├── components/
│   └── dashboard/
│       ├── DashboardMetrics.vue       ← bandeau 4 métriques
│       └── EmployeeStatusTable.vue    ← liste + filtre
└── types/
    └── index.ts                       ← DashboardSnapshot, EmployeeStatus interfaces
```

### Composable `useDashboard.ts`

```ts
interface EmployeeStatus {
  id: string
  first_name: string
  last_name: string
  role: string
  team_name: string | null
  joined_at: string
  on_leave: boolean
  leave_type_name: string | null
  leave_end_date: string | null   // YYYY-MM-DD
}

interface DashboardSnapshot {
  total_employees: number
  on_leave_today: number
  on_leave_week: number
  present: number
  employees: EmployeeStatus[]
}

export function useDashboard() {
  const supabase = useSupabaseClient()
  const snapshot = useState<DashboardSnapshot | null>('dashboard-snapshot', () => null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchSnapshot() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: sbError } = await supabase.rpc('get_dashboard_snapshot')
      if (sbError) throw sbError
      snapshot.value = data as DashboardSnapshot
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement du tableau de bord'
    } finally {
      isLoading.value = false
    }
  }

  return {
    snapshot: readonly(snapshot),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchSnapshot,
  }
}
```

### Types à ajouter dans `app/types/index.ts`

```ts
export interface EmployeeStatus {
  id: string
  first_name: string
  last_name: string
  role: string
  team_name: string | null
  joined_at: string
  on_leave: boolean
  leave_type_name: string | null
  leave_end_date: string | null
}

export interface DashboardSnapshot {
  total_employees: number
  on_leave_today: number
  on_leave_week: number
  present: number
  employees: EmployeeStatus[]
}
```

### Page `dashboard.vue`

```ts
definePageMeta({ middleware: 'admin-only', layout: 'private' })

const { snapshot, isLoading, error, fetchSnapshot } = useDashboard()

type FilterMode = 'all' | 'present' | 'on_leave'
const filter = ref<FilterMode>('all')

const filteredEmployees = computed(() => {
  if (!snapshot.value) return []
  if (filter.value === 'present') return snapshot.value.employees.filter(e => !e.on_leave)
  if (filter.value === 'on_leave') return snapshot.value.employees.filter(e => e.on_leave)
  return snapshot.value.employees
})

function seniority(joinedAt: string): string {
  const years = new Date().getFullYear() - new Date(joinedAt).getFullYear()
  if (years < 1) {
    const months = Math.floor((Date.now() - new Date(joinedAt).getTime()) / (1000 * 60 * 60 * 24 * 30))
    return `${months} mois`
  }
  return `${years} an${years > 1 ? 's' : ''}`
}

onMounted(fetchSnapshot)
```

### Navigation — mise à jour de `useNavItems` ou sidebar

Ajouter le lien "Tableau de bord" visible uniquement pour `isAdmin` :

```ts
// Dans AppSidebar.vue ou un composable useNavItems
{ label: 'Tableau de bord', to: '/dashboard', adminOnly: true }
```

---

## Acceptance Criteria

- [ ] `/dashboard` redirige employee et manager vers 403 (middleware admin-only)
- [ ] Lien "Tableau de bord" visible dans la navigation uniquement pour l'admin
- [ ] Bandeau affiche exactement 4 métriques avec les bonnes valeurs
- [ ] "En congé aujourd'hui" mis en évidence (fond coloré `bg-amber-50 border-amber-200`)
- [ ] Liste employés : nom, équipe, ancienneté, badge statut
- [ ] Badge vert "Présent" / ambre "En congé" (classes Tailwind standardisées)
- [ ] Si en congé : nom du type + "Retour le {DD/MM/YYYY}"
- [ ] La date de retour = `end_date + 1 jour` (lendemain du congé)
- [ ] Filtre "Tous / Présents / En congé" opère sans appel API
- [ ] 4 états UI sur toute la page (loading skeletons, erreur + retry, vide impossible, contenu)
- [ ] Responsive 375px et 1280px (tableau scroll horizontal sur mobile)

---

## Security Considerations

- `get_dashboard_snapshot` est SECURITY DEFINER avec guard admin — validé en RFC-014
- La page est protégée par `middleware/admin-only` — double protection (middleware + RPC)

---

## Error Handling

- Erreur RPC → `AppErrorBanner` avec bouton "Réessayer" appelant `fetchSnapshot`
- Pas d'état vide possible (il y a toujours des employés seedés) — si array vide, afficher "Aucun employé" avec message neutre

---

## Testing Strategy

1. Login admin → `/dashboard` → bandeau visible, métriques cohérentes avec les demandes seedées
2. Login employee → `/dashboard` → 403
3. Filtre "En congé" → seuls les employés actuellement en congé `approved` affichés
4. Filtre "Présents" → inverse
5. Vérifier "Retour le" = lendemain du `end_date`
6. Vérifier ancienneté Emma (joined_at 2024-01-15) = "2 ans"
7. Mobile 375px → pas de scroll horizontal sur le bandeau métriques
