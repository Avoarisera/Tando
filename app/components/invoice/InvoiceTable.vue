<script setup lang="ts">
import type { Invoice, InvoiceStatus } from '~/types/index'

defineProps<{ invoices: ReadonlyArray<Invoice>, uploadingId: string | null }>()
const emit = defineEmits<{
  'status-change': [id: string, status: InvoiceStatus]
  'upload': [id: string, file: File]
  'view-pdf': [path: string]
}>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

const STATUSES: InvoiceStatus[] = ['en_attente', 'envoyee', 'payee']
const statusOptions = computed(() => STATUSES.map(s => ({ value: s, label: t(`invoices.status.${s}`) })))

const money = (inv: Invoice) => new Intl.NumberFormat(tag.value, { style: 'currency', currency: inv.currency }).format(inv.amount)
const date = (s: string | null) => (s ? fmtDate(s, tag.value, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')

const inputs = ref<Record<string, HTMLInputElement | null>>({})
function pick(id: string) {
  inputs.value[id]?.click()
}
function onFile(id: string, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('upload', id, file)
  input.value = ''
}
</script>

<template>
  <div>
    <!-- Desktop table -->
    <div class="wb-scroll wb-dt wb-hide-m">
      <table>
        <caption class="wb-sr">{{ t('nav.invoices') }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t('invoices.form.reference') }}</th>
            <th scope="col">{{ t('invoices.form.client') }}</th>
            <th scope="col">{{ t('invoices.form.date') }}</th>
            <th scope="col">{{ t('invoices.form.due') }}</th>
            <th scope="col" class="is-r">{{ t('invoices.form.amount') }}</th>
            <th scope="col">{{ t('rules.status') }}</th>
            <th scope="col">PDF</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="inv in invoices" :key="inv.id" :data-ref="inv.reference">
            <td><span class="wb-mono">{{ inv.reference }}</span></td>
            <td>{{ inv.client }}</td>
            <td class="wb-num">{{ date(inv.invoice_date) }}</td>
            <td class="wb-num">{{ date(inv.due_date) }}</td>
            <td class="is-r"><b class="wb-num">{{ money(inv) }}</b></td>
            <td>
              <WbSelect
                :model-value="inv.status"
                :options="statusOptions"
                :aria-label="t('invoices.statusOf', { ref: inv.reference })"
                @update:model-value="emit('status-change', inv.id, $event as InvoiceStatus)"
              />
            </td>
            <td>
              <div class="wb-row" style="gap: 4px">
                <WbButton v-if="inv.pdf_path" variant="ghost" size="sm" icon="file-text" @click="emit('view-pdf', inv.pdf_path)">{{ t('invoices.view') }}</WbButton>
                <WbButton variant="ghost" size="sm" icon="upload" :loading="uploadingId === inv.id" @click="pick(inv.id)">
                  {{ inv.pdf_path ? t('invoices.replace') : t('invoices.upload') }}
                </WbButton>
                <input :ref="el => (inputs[inv.id] = el as HTMLInputElement | null)" type="file" accept="application/pdf" class="wb-sr" tabindex="-1" :aria-label="t('invoices.pdfOf', { ref: inv.reference })" @change="onFile(inv.id, $event)">
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile cards -->
    <ul class="wb-inv-cards wb-hide-d">
      <li v-for="inv in invoices" :key="inv.id" class="wb-card wb-card-b wb-stack-s" :data-ref="inv.reference">
        <div class="wb-row-b">
          <span class="wb-mono">{{ inv.reference }}</span>
          <InvoiceStatusBadge :status="inv.status" />
        </div>
        <p class="h3">{{ inv.client }}</p>
        <p class="small wb-mut2">{{ date(inv.invoice_date) }} · <b class="wb-num">{{ money(inv) }}</b></p>
        <div class="wb-row wb-wrap" style="gap: 4px">
          <WbButton v-if="inv.pdf_path" variant="secondary" size="sm" icon="file-text" @click="emit('view-pdf', inv.pdf_path)">{{ t('invoices.view') }}</WbButton>
          <WbSelect
            :model-value="inv.status"
            :options="statusOptions"
            :aria-label="t('invoices.statusOf', { ref: inv.reference })"
            @update:model-value="emit('status-change', inv.id, $event as InvoiceStatus)"
          />
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.wb-inv-cards { list-style: none; margin: 0; padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-3); }
</style>
