<script setup lang="ts">
import type { InvoiceStatus } from '~/types/index'

definePageMeta({ titleKey: 'nav.invoices', middleware: 'admin-only', layout: 'private' })

const {
  invoices,
  isLoading,
  error,
  fetchInvoices,
  updateStatus,
  uploadPdf,
  getSignedUrl,
} = useInvoices()
const toast = useToast()
const { t } = useI18n()
const route = useRoute()

type FilterStatus = 'all' | InvoiceStatus

const showModal = ref(false)
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

// Summary strip: amounts per status, in euros (other currencies are counted apart)
const { locale } = useI18n()
const sumTag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const summary = computed(() => (['en_attente', 'envoyee', 'payee'] as const).map((st) => {
  const list = invoices.value.filter(i => i.status === st)
  const eur = list.filter(i => i.currency === 'EUR').reduce((s, i) => s + Number(i.amount), 0)
  return {
    status: st,
    count: list.length,
    amount: new Intl.NumberFormat(sumTag.value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(eur),
    other: list.some(i => i.currency !== 'EUR'),
  }
}))

onMounted(async () => {
  await fetchInvoices()
  // /invoices?new=1 (dashboard shortcut) opens the creation panel
  if (route.query.new === '1') openModal()
})

function openModal() {
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

// Editor saved the invoice, its lines and the generated PDF (R8-G)
function handleSaved() {
  closeModal()
  toast.add(t('r8b.inv.saved'))
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
    <div v-if="invoices.length" class="wb-inv-sum">
      <div v-for="x in summary" :key="x.status" class="wb-inv-sum-i" :data-status="x.status">
        <span class="caption wb-mut">{{ t(`invoices.status.${x.status}`) }} · {{ t('v3.inv.count', { n: x.count }, x.count) }}</span>
        <b class="wb-num">{{ x.amount }}</b>
        <span v-if="x.other" class="caption2 wb-mut">{{ t('v3.inv.otherCurrencies') }}</span>
      </div>
    </div>
    <div class="wb-row-b wb-wrap wb-inv-toolbar">
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

    <WbSidePanel v-if="showModal" :title="t('dashboard.newInvoice')" :subtitle="t('r8b.inv.panelHint')" :width="1040" @close="closeModal">
      <InvoiceEditor @saved="handleSaved" @cancel="closeModal" />
    </WbSidePanel>
  </div>
</template>

<style scoped>
.wb-inv-sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-1); }
.wb-inv-sum-i { display: flex; flex-direction: column; gap: 2px; padding: var(--space-3) var(--space-5); }
.wb-inv-sum-i + .wb-inv-sum-i { border-left: 1px solid var(--border); }
.wb-inv-sum-i b { font-size: 20px; line-height: 26px; }
.wb-inv-sum-i[data-status="envoyee"] b { color: var(--info-text); }
.wb-inv-sum-i[data-status="payee"] b { color: var(--success-text); }
.wb-inv-toolbar { gap: var(--space-3); }
.wb-inv-toolbar :deep(.wb-fb-s) { width: 280px; }
@container wbapp (max-width: 767px) {
  .wb-inv-sum { grid-template-columns: minmax(0, 1fr); }
  .wb-inv-sum-i + .wb-inv-sum-i { border-left: 0; border-top: 1px solid var(--border); }
  .wb-inv-sum-i { padding: var(--space-2) var(--space-4); flex-direction: row; justify-content: space-between; align-items: baseline; }
  .wb-inv-sum-i b { font-size: 16px; }
  .wb-inv-toolbar :deep(.wb-fb-s) { width: 100%; }
}
</style>
