<script setup lang="ts">
import type { Invoice, InvoiceStatus } from '~/types/index'

definePageMeta({ titleKey: 'nav.invoices', middleware: 'admin-only', layout: 'private' })

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
const { t } = useI18n()
const route = useRoute()

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
  return byStatus.filter(i => i.reference.toLowerCase().includes(lower) || i.client.toLowerCase().includes(lower))
})

const counts = computed(() => ({
  all: invoices.value.length,
  en_attente: invoices.value.filter(i => i.status === 'en_attente').length,
  envoyee: invoices.value.filter(i => i.status === 'envoyee').length,
  payee: invoices.value.filter(i => i.status === 'payee').length,
}))
const FILTERS: FilterStatus[] = ['all', 'en_attente', 'envoyee', 'payee']

onMounted(async () => {
  await fetchInvoices()
  // /invoices?new=1 (dashboard shortcut) opens the creation panel
  if (route.query.new === '1') openModal()
})

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
    toast.add(t('invoices.saved'))
  } catch (e) {
    formError.value = e instanceof Error ? e.message : t('invoices.createError')
  } finally {
    isSubmitting.value = false
  }
}

async function handleStatusChange(id: string, status: InvoiceStatus) {
  try {
    await updateStatus(id, status)
    toast.add(t('invoices.statusSaved'))
  } catch (e) {
    toast.add(e instanceof Error ? e.message : t('rules.saveError'), 'error')
  }
}

async function handleUpload(invoiceId: string, file: File) {
  if (file.type !== 'application/pdf') {
    toast.add(t('invoices.pdfOnly'), 'error')
    return
  }
  uploadingId.value = invoiceId
  try {
    await uploadPdf(invoiceId, file)
    toast.add(t('invoices.pdfSaved'))
  } catch (e) {
    toast.add(e instanceof Error ? e.message : t('invoices.uploadError'), 'error')
  } finally {
    uploadingId.value = null
  }
}

async function handleViewPdf(path: string) {
  // Open the tab synchronously, inside the click: opened after the await it is
  // no longer a user gesture and Safari/Firefox block it as a pop-up (TND-16).
  const tab = window.open('', '_blank')
  try {
    const url = await getSignedUrl(path)
    if (tab) {
      tab.opener = null
      tab.location.href = url
    } else {
      window.location.assign(url)
    }
  } catch (e) {
    tab?.close()
    toast.add(e instanceof Error ? e.message : t('invoices.linkError'), 'error')
  }
}
</script>

<template>
  <div class="wb-page wb-stack">
    <div class="wb-row-b wb-wrap">
      <div class="wb-fb">
        <div class="wb-fb-s">
          <WbInput id="invoice-search" v-model="searchQuery" icon="search" type="search" :aria-label="t('invoices.search')" :placeholder="t('invoices.search')" />
        </div>
        <div class="wb-fb-c">
          <WbFilterChip
            v-for="f in FILTERS"
            :key="f"
            :model-value="filter === f"
            :count="counts[f]"
            @update:model-value="filter = f"
          >
            {{ f === 'all' ? t('invoices.all') : t(`invoices.status.${f}`) }}
          </WbFilterChip>
        </div>
      </div>
      <WbButton icon="plus" aria-haspopup="dialog" @click="openModal">{{ t('dashboard.newInvoice') }}</WbButton>
    </div>
    <p v-if="trimmedSearch.length > 0 && trimmedSearch.length < 3" class="caption wb-mut">{{ t('invoices.searchHint') }}</p>

    <WbErrorState v-if="error" :message="error" @retry="fetchInvoices" />
    <WbSkeleton v-else-if="isLoading && !invoices.length" variant="table" />
    <div v-else-if="!invoices.length" class="wb-card">
      <WbEmptyState art="invoice" :title="t('invoices.emptyTitle')">
        {{ t('invoices.emptyText') }}
        <template #action><WbButton icon="plus" @click="openModal">{{ t('dashboard.newInvoice') }}</WbButton></template>
      </WbEmptyState>
    </div>
    <p v-else-if="!filteredInvoices.length" class="wb-card wb-card-b wb-mut">{{ t('invoices.noMatch') }}</p>
    <WbCard v-else :pad="false">
      <InvoiceTable
        :invoices="filteredInvoices"
        :uploading-id="uploadingId"
        @status-change="handleStatusChange"
        @upload="handleUpload"
        @view-pdf="handleViewPdf"
      />
    </WbCard>

    <WbSidePanel v-if="showModal" :title="t('dashboard.newInvoice')" :width="640" @close="closeModal">
      <InvoiceForm :is-submitting="isSubmitting" :error="formError" @submit="handleCreate" @cancel="closeModal" />
    </WbSidePanel>
  </div>
</template>
