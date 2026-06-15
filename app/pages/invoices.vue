<script setup lang="ts">
import type { Invoice, InvoiceStatus } from '~/types/index'

definePageMeta({ middleware: 'admin-only', layout: 'private' })

const {
  invoices,
  isLoading,
  error,
  fetchInvoices,
  createInvoice,
  updateStatus,
  uploadPdf,
  getSignedUrl,
} = useInvoices()
const toast = useToast()

type FilterStatus = 'all' | InvoiceStatus

const showModal = ref(false)
const formError = ref<string | null>(null)
const isSubmitting = ref(false)
const filter = ref<FilterStatus>('all')
const uploadingId = ref<string | null>(null)
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

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: 'all',        label: 'Toutes' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'envoyee',    label: 'Envoyée' },
  { value: 'payee',      label: 'Payée' },
]

onMounted(fetchInvoices)

function openModal() {
  formError.value = null
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  formError.value = null
}

async function handleCreate(payload: Omit<Invoice, 'id' | 'created_at' | 'created_by' | 'pdf_path'>) {
  isSubmitting.value = true
  formError.value = null
  try {
    await createInvoice(payload)
    closeModal()
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
    toast.add(e instanceof Error ? e.message : "Erreur lors de l'envoi du PDF", 'error')
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
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-semibold text-gray-900">Factures</h1>
      <AppButton @click="openModal">Nouvelle facture</AppButton>
    </div>

    <!-- Recherche -->
    <div class="mb-4">
      <label for="invoice-search" class="sr-only">Rechercher par référence</label>
      <div class="relative max-w-xs">
        <svg
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
        </svg>
        <input
          id="invoice-search"
          v-model="searchQuery"
          type="search"
          placeholder="Rechercher une référence…"
          class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </div>
      <p v-if="trimmedSearch.length > 0 && trimmedSearch.length < 3" class="mt-1 text-xs text-gray-400">
        Saisissez au moins 3 caractères pour lancer la recherche.
      </p>
    </div>

    <!-- Filtres -->
    <div class="flex flex-wrap gap-2 mb-6">
      <button
        v-for="opt in FILTER_OPTIONS"
        :key="opt.value"
        class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
        :class="filter === opt.value
          ? 'bg-brand-primary text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
        @click="filter = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>

    <!-- 1. Loading -->
    <template v-if="isLoading">
      <AppSkeleton v-for="i in 5" :key="i" class="mb-3 h-12" />
    </template>

    <!-- 2. Error -->
    <AppErrorBanner
      v-else-if="error"
      :message="error"
      @retry="fetchInvoices"
    />

    <!-- 3. Empty (global) -->
    <AppEmptyState
      v-else-if="invoices.length === 0"
      title="Aucune facture pour le moment"
      description="Créez votre première facture en cliquant sur « Nouvelle facture »."
    >
      <AppButton class="mt-4" @click="openModal">Nouvelle facture</AppButton>
    </AppEmptyState>

    <!-- 3b. Empty (filtered / search) -->
    <AppEmptyState
      v-else-if="filteredInvoices.length === 0"
      title="Aucune facture trouvée"
      :description="emptyDescription"
    />

    <!-- 4. Content -->
    <InvoiceTable
      v-else
      :invoices="filteredInvoices"
      :uploading-id="uploadingId"
      @status-change="handleStatusChange"
      @upload="handleUpload"
      @view-pdf="handleViewPdf"
    />

    <!-- Modal création -->
    <AppModal
      v-if="showModal"
      title="Nouvelle facture"
      @close="closeModal"
    >
      <InvoiceForm
        :is-submitting="isSubmitting"
        :error="formError"
        @submit="handleCreate"
        @cancel="closeModal"
      />
    </AppModal>
  </div>
</template>
