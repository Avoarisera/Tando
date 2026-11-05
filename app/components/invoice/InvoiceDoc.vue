<script setup lang="ts">
import type { InvoiceLineInput } from '~/utils/invoice-totals'
import type { CompanyInfo } from '~/composables/useInvoices'

// Printed look of an invoice (design system InvoiceDoc, mockup P04-Aperçu / T04)
const props = defineProps<{
  reference: string
  client: string
  invoiceDate: string
  dueDate: string | null
  currency: string
  notes: string | null
  lines: InvoiceLineInput[]
  company: CompanyInfo
}>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const totals = computed(() => computeInvoiceTotals(props.lines))
const money = (n: number) => new Intl.NumberFormat(tag.value, { style: 'currency', currency: props.currency || 'EUR' }).format(n)
const date = (s: string | null) => (s ? fmtDate(s, tag.value, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const num = (n: number) => new Intl.NumberFormat(tag.value, { maximumFractionDigits: 2 }).format(n)
</script>

<template>
  <div class="wb-inv" role="document" :aria-label="t('r8b.inv.previewOf', { ref: reference })">
    <header>
      <div>
        <b class="h2">{{ company.legal_name || t('r8b.inv.noCompany') }}</b>
        <p class="caption2">
          <template v-if="company.address">{{ company.address }}<br></template>
          <template v-if="company.vat_number">{{ t('r8b.inv.vatNumber') }} {{ company.vat_number }}</template>
        </p>
      </div>
      <div class="wb-inv-n"><span class="h1">{{ t('r8b.inv.title') }}</span><span class="wb-mono">{{ reference }}</span></div>
    </header>
    <div class="wb-inv-m">
      <div><span class="caption">{{ t('r8b.inv.billTo') }}</span><p class="small"><b>{{ client || '—' }}</b></p></div>
      <div>
        <span class="caption">{{ t('invoices.form.date') }}</span><p class="small">{{ date(invoiceDate) }}</p>
        <span class="caption">{{ t('invoices.form.due') }}</span><p class="small">{{ date(dueDate) }}</p>
      </div>
    </div>
    <table>
      <thead><tr><th>{{ t('r8b.inv.description') }}</th><th>{{ t('r8b.inv.qty') }}</th><th>{{ t('r8b.inv.unitPrice') }}</th><th>{{ t('r8b.inv.vat') }}</th><th>{{ t('r8b.inv.net') }}</th></tr></thead>
      <tbody>
        <tr v-for="(l, i) in lines" :key="i">
          <td>{{ l.description || '—' }}</td><td>{{ num(l.quantity) }}</td><td>{{ money(l.unit_price) }}</td><td>{{ num(l.vat_rate) }} %</td><td>{{ money(totals.lines[i]?.net ?? 0) }}</td>
        </tr>
      </tbody>
    </table>
    <dl>
      <div><dt>{{ t('r8b.inv.net') }}</dt><dd>{{ money(totals.net) }}</dd></div>
      <div><dt>{{ t('r8b.inv.vatTotal') }}</dt><dd>{{ money(totals.vat) }}</dd></div>
      <div class="is-t"><dt>{{ t('r8b.inv.gross') }}</dt><dd data-total>{{ money(totals.gross) }}</dd></div>
    </dl>
    <footer class="caption2">
      <p v-if="notes"><b>{{ t('r8b.inv.notes') }}</b> {{ notes }}</p>
      <p v-if="company.iban"><b>IBAN</b> {{ company.iban }}<template v-if="company.bic"> · <b>BIC</b> {{ company.bic }}</template></p>
      <p v-if="company.invoice_footer">{{ company.invoice_footer }}</p>
    </footer>
  </div>
</template>
