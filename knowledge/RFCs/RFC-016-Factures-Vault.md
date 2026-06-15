# RFC-016 — Factures Vault PDF

**ID:** RFC-016  
**Title:** Factures Vault — /invoices page, CRUD, PDF upload via Supabase Storage  
**Sprint:** 4  
**Complexity:** Medium  
**Predecessor:** RFC-015  
**Successor:** RFC-016

---

## Summary

Ce RFC implémente la page `/invoices` (admin uniquement) qui permet de créer des fiches factures, d'y attacher des PDFs et de suivre leur statut. Avant ce RFC, il n'y a aucun module facture. Après, l'admin peut créer, lister, filtrer par statut, attacher un PDF et changer le statut des factures.

---

## Features Addressed

| Feature | Description |
|---------|-------------|
| F39 | Création de fiche facture (modal + validation) |
| F40 | Upload et téléchargement PDF (Supabase Storage) |
| F41 | Gestion du statut facture + filtre client-side |

---

## Dependencies

- **Requires:** RFC-014 (table `invoices` + bucket `invoices` + RLS)
- **Enables:** RFC-016

---

## Nice-to-Have Additions

> Features implemented beyond the original scope, validated by the team.

### Recherche par référence (client-side)

Un champ de recherche case-insensitive sur le champ `reference` a été ajouté à la page `/invoices`. La recherche s'active à partir de 3 caractères saisis et s'applique **à l'intérieur** du filtre de statut actif (les deux critères sont combinés en AND).

**Approche technique** — entièrement client-side, aucun appel Supabase supplémentaire :

```ts
// app/pages/invoices.vue
const searchQuery = ref('')
const trimmedSearch = computed(() => searchQuery.value.trim())

const filteredInvoices = computed(() => {
  const byStatus = filter.value === 'all'
    ? invoices.value
    : invoices.value.filter(i => i.status === filter.value)
  if (trimmedSearch.value.length < 3) return byStatus
  const lower = trimmedSearch.value.toLowerCase()
  return byStatus.filter(i => i.reference.toLowerCase().includes(lower))
})

const emptyDescription = computed(() => {
  if (trimmedSearch.value.length >= 3 && filter.value !== 'all') {
    return `Aucune facture « ${trimmedSearch.value} » avec ce statut.`
  }
  if (trimmedSearch.value.length >= 3) {
    return `Aucune référence ne correspond à « ${trimmedSearch.value} ».`
  }
  return 'Essayez un autre statut.'
})
```

**UI** — champ `<input type="search">` au-dessus des filtres statut, avec icône loupe, `sr-only` label pour l'accessibilité, et un texte d'aide affiché entre 1 et 2 caractères : *"Saisissez au moins 3 caractères pour lancer la recherche."*

**Critères d'acceptation :**
- [ ] La recherche ne s'active qu'à partir de 3 caractères (moins → liste non filtrée)
- [ ] La correspondance est case-insensitive et partielle (`substring`)
- [ ] La recherche et le filtre statut sont cumulatifs (AND)
- [ ] L'état vide distingue : recherche seule / recherche + filtre statut actif
- [ ] Aucun appel réseau déclenché lors de la saisie

---

## Technical Approach

### New files

```
app/
├── pages/
│   └── invoices.vue
├── composables/
│   └── useInvoices.ts
├── components/
│   └── invoice/
│       ├── InvoiceForm.vue
│       ├── InvoiceTable.vue
│       └── InvoiceStatusBadge.vue
└── types/
    └── index.ts           ← ajouter Invoice, InvoiceStatus
```

### Types — `app/types/index.ts`

```ts
export type InvoiceStatus = 'en_attente' | 'envoyee' | 'payee'
export type InvoiceCurrency = 'EUR' | 'USD' | 'GBP' | 'CAD' | 'AUD' | 'MGA'

export interface Invoice {
  id: string
  reference: string
  client: string
  amount: number
  currency: InvoiceCurrency
  invoice_date: string   // YYYY-MM-DD
  due_date: string | null
  notes: string | null
  status: InvoiceStatus
  pdf_path: string | null
  created_by: string | null
  created_at: string
}
```

### Composable `useInvoices.ts`

```ts
export function useInvoices() {
  const supabase = useSupabaseClient()
  const invoices = useState<Invoice[]>('invoices', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchInvoices() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: sbError } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
      if (sbError) throw sbError
      invoices.value = data ?? []
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement des factures'
    } finally {
      isLoading.value = false
    }
  }

  async function createInvoice(payload: Omit<Invoice, 'id' | 'created_at' | 'created_by' | 'pdf_path'>): Promise<void> {
    const { error: sbError } = await supabase
      .from('invoices')
      .insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id })
    if (sbError) throw sbError
    await fetchInvoices()
  }

  async function updateStatus(id: string, status: InvoiceStatus): Promise<void> {
    const { error: sbError } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', id)
    if (sbError) throw sbError
    const idx = invoices.value.findIndex(i => i.id === id)
    if (idx !== -1) invoices.value[idx] = { ...invoices.value[idx], status }
  }

  async function uploadPdf(invoiceId: string, file: File): Promise<string> {
    const path = `${invoiceId}/${file.name}`
    const { error: upError } = await supabase.storage
      .from('invoices')
      .upload(path, file, { contentType: 'application/pdf', upsert: true })
    if (upError) throw upError
    // Persist path in DB
    const { error: dbError } = await supabase
      .from('invoices')
      .update({ pdf_path: path })
      .eq('id', invoiceId)
    if (dbError) throw dbError
    const idx = invoices.value.findIndex(i => i.id === invoiceId)
    if (idx !== -1) invoices.value[idx] = { ...invoices.value[idx], pdf_path: path }
    return path
  }

  async function getSignedUrl(path: string): Promise<string> {
    const { data, error: signError } = await supabase.storage
      .from('invoices')
      .createSignedUrl(path, 60)
    if (signError) throw signError
    return data.signedUrl
  }

  return {
    invoices: readonly(invoices),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchInvoices,
    createInvoice,
    updateStatus,
    uploadPdf,
    getSignedUrl,
  }
}
```

### `InvoiceStatusBadge.vue`

```vue
<script setup lang="ts">
import type { InvoiceStatus } from '~/types/index'
const props = defineProps<{ status: InvoiceStatus }>()
const classes: Record<InvoiceStatus, string> = {
  en_attente: 'bg-gray-100 text-gray-700',
  envoyee: 'bg-blue-100 text-blue-700',
  payee: 'bg-green-100 text-green-700',
}
const labels: Record<InvoiceStatus, string> = {
  en_attente: 'En attente',
  envoyee: 'Envoyée',
  payee: 'Payée',
}
</script>
<template>
  <span
    class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
    :class="classes[status]"
  >{{ labels[status] }}</span>
</template>
```

### Page `invoices.vue` — structure script

```ts
definePageMeta({ middleware: 'admin-only', layout: 'private' })

const { invoices, isLoading, error, fetchInvoices, createInvoice, updateStatus, uploadPdf, getSignedUrl } = useInvoices()
const toast = useToast()

// Create modal
const showModal = ref(false)
const formError = ref<string | null>(null)
const isSubmitting = ref(false)

// Filter
type FilterStatus = 'all' | InvoiceStatus
const filter = ref<FilterStatus>('all')
const filteredInvoices = computed(() =>
  filter.value === 'all' ? invoices.value : invoices.value.filter(i => i.status === filter.value)
)

// Upload state
const uploadingId = ref<string | null>(null)

async function handleCreate(payload: Omit<Invoice, 'id' | 'created_at' | 'created_by' | 'pdf_path'>) {
  isSubmitting.value = true
  formError.value = null
  try {
    await createInvoice(payload)
    showModal.value = false
    toast.add('Facture enregistrée')
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Erreur lors de la création'
  } finally {
    isSubmitting.value = false
  }
}

async function handleStatusChange(id: string, status: InvoiceStatus) {
  try {
    await updateStatus(id, status)
    toast.add('Statut mis à jour')
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur de mise à jour', 'error')
  }
}

async function handleUpload(invoiceId: string, file: File) {
  if (file.type !== 'application/pdf') {
    toast.add('Seuls les fichiers PDF sont acceptés', 'error')
    return
  }
  uploadingId.value = invoiceId
  try {
    await uploadPdf(invoiceId, file)
    toast.add('PDF enregistré')
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur upload', 'error')
  } finally {
    uploadingId.value = null
  }
}

async function handleViewPdf(path: string) {
  try {
    const url = await getSignedUrl(path)
    window.open(url, '_blank', 'noopener')
  } catch (e) {
    toast.add('Impossible de générer le lien PDF', 'error')
  }
}

onMounted(fetchInvoices)
```

---

## Acceptance Criteria

### F39 — Création
- [ ] Page `/invoices` inaccessible à employee et manager (403)
- [ ] Modal "Nouvelle facture" avec tous les champs requis
- [ ] Validation front : référence non vide, client non vide, amount > 0, invoice_date renseignée
- [ ] Erreur DB (référence dupliquée) affichée inline — modal reste ouvert
- [ ] Succès → toast + liste rafraîchie + modal fermé
- [ ] 4 états UI sur la liste

### F40 — Upload PDF
- [ ] Input file accepte uniquement `application/pdf`
- [ ] Validation type côté client avant upload (toast erreur si mauvais type)
- [ ] Spinner pendant upload
- [ ] Toast succès après upload, toast erreur en cas d'échec
- [ ] Bouton "Voir PDF" visible uniquement si `pdf_path` renseigné
- [ ] Clic "Voir PDF" → URL signée 60s → ouvre dans nouvel onglet

### F41 — Statut + filtre
- [ ] Trois statuts affichés avec badges colorés distincts
- [ ] Changement de statut depuis la liste → sauvegardé → toast
- [ ] Filtre "Tous / En attente / Envoyée / Payée" sans appel API
- [ ] Responsive 375px et 1280px

---

## Security Considerations

- RLS admin-only sur `invoices` (RFC-014)
- PDF stocké dans bucket privé — jamais d'URL publique
- Signed URL expire après 60s — re-générer à chaque clic
- Validation du type MIME côté client ET Supabase Storage (`contentType: 'application/pdf'`)

---

## Error Handling

- Fetch error → `AppErrorBanner` + retry
- Create error (duplicate reference) → message inline dans modal
- Upload error → toast persistant
- Status update error → toast persistant, valeur UI non modifiée

---

## Testing Strategy

1. Login admin → `/invoices` → état vide "Aucune facture"
2. Créer facture "FAC-001", client "ACME", 1500, EUR → apparaît dans liste
3. Créer facture avec même référence "FAC-001" → erreur inline dans modal
4. Changer statut → "Envoyée" → badge bleu
5. Uploader un PDF → spinner → "Voir PDF" apparaît → clic → onglet ouvert
6. Uploader un .docx → toast erreur "Seuls les fichiers PDF sont acceptés"
7. Filtre "Payée" → liste filtrée sans rechargement
8. Login employee → `/invoices` → 403
