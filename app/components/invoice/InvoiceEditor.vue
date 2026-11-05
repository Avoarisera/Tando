<script setup lang="ts">
import type { InvoiceCurrency } from '~/types/index'
import type { InvoiceLineInput } from '~/utils/invoice-totals'
import type { CompanyInfo } from '~/composables/useInvoices'

// Invoice editor (R8-G, mockup P04-Éditeur): header fields, lines, totals,
// preview, then save + PDF generated in the browser and stored in the bucket.
const emit = defineEmits<{ saved: [], cancel: [] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { createInvoiceWithLines, uploadPdf, fetchCompany } = useInvoices()

const CURRENCIES: InvoiceCurrency[] = ['EUR', 'USD', 'GBP', 'CAD', 'AUD', 'MGA']
const currencyOptions = CURRENCIES.map(c => ({ value: c, label: c }))
const VAT_RATES = ['20', '10', '5.5', '2.1', '0']

interface DraftLine { description: string, quantity: string, unit_price: string, vat_rate: string }
const emptyLine = (): DraftLine => ({ description: '', quantity: '1', unit_price: '', vat_rate: '20' })

const reference = ref('')
const client = ref('')
const currency = ref<InvoiceCurrency>('EUR')
const invoiceDate = ref(todayIso())
const dueDate = ref(addDays(todayIso(), 30))
const notes = ref('')
const lines = ref<DraftLine[]>([emptyLine()])
const company = ref<CompanyInfo>({ legal_name: '', address: '', vat_number: '', iban: '', bic: '', invoice_footer: '' })
const showPreview = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const submitted = ref(false)

onMounted(async () => {
  try { company.value = await fetchCompany() }
  catch { /* the preview simply has no company block */ }
})

const parsed = computed<InvoiceLineInput[]>(() => lines.value.map(l => ({
  description: l.description,
  quantity: Number(l.quantity.replace(',', '.')),
  unit_price: Number(l.unit_price.replace(',', '.')),
  vat_rate: Number(l.vat_rate.replace(',', '.')),
})))
const totals = computed(() => computeInvoiceTotals(parsed.value))
const money = (n: number) => new Intl.NumberFormat(tag.value, { style: 'currency', currency: currency.value }).format(n)

function addLine() { lines.value = [...lines.value, emptyLine()] }
function removeLine(i: number) { lines.value = lines.value.filter((_, k) => k !== i) }

const formError = computed(() => {
  if (!client.value.trim()) return t('invoices.form.clientRequired')
  if (!invoiceDate.value) return t('invoices.form.dateRequired')
  if (dueDate.value && dueDate.value < invoiceDate.value) return t('invoices.form.dueBeforeDate')
  if (!parsed.value.length || !parsed.value.every(isLineValid)) return t('r8b.inv.linesInvalid')
  if (totals.value.gross <= 0) return t('invoices.form.amountPositive')
  return null
})

const pdfLabels = computed(() => ({
  title: t('r8b.inv.title'), billTo: t('r8b.inv.billTo'), date: t('invoices.form.date'), due: t('invoices.form.due'),
  description: t('r8b.inv.description'), qty: t('r8b.inv.qty'), unitPrice: t('r8b.inv.unitPrice'), vat: t('r8b.inv.vat'),
  net: t('r8b.inv.net'), vatTotal: t('r8b.inv.vatTotal'), gross: t('r8b.inv.gross'), notes: t('r8b.inv.notes'),
  iban: 'IBAN', bic: 'BIC', vatNumber: t('r8b.inv.vatNumber'), page: t('r8b.inv.page'),
}))

async function save() {
  submitted.value = true
  error.value = null
  if (formError.value) return
  saving.value = true
  try {
    const inv = await createInvoiceWithLines({
      reference: reference.value || null,
      client: client.value.trim(),
      amount: totals.value.gross,
      currency: currency.value,
      invoice_date: invoiceDate.value,
      due_date: dueDate.value || null,
      notes: notes.value.trim() || null,
      status: 'en_attente',
    }, parsed.value)
    const { generateInvoicePdf } = await import('~/utils/invoice-pdf')
    const bytes = await generateInvoicePdf({
      reference: inv.reference, client: inv.client, invoiceDate: inv.invoice_date, dueDate: inv.due_date,
      currency: inv.currency, notes: inv.notes, lines: parsed.value, company: company.value, locale: tag.value, labels: pdfLabels.value,
    })
    await uploadPdf(inv.id, new File([bytes as BlobPart], `${inv.reference}.pdf`, { type: 'application/pdf' }))
    emit('saved')
  }
  catch (e) {
    const err = e as { message?: string, code?: string }
    error.value = err.code === '23505' ? t('r8b.inv.duplicate') : (err.message ?? t('invoices.createError'))
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="wb-inv-ed">
    <WbBanner v-if="error || (submitted && formError)" tone="danger">{{ error || formError }}</WbBanner>

    <div class="wb-inv-ed-grid">
      <!-- Left: header fields + lines (or the print preview) -->
      <div class="wb-inv-ed-main">
        <div class="wb-inv-ed-bar">
          <h3 class="h3">{{ showPreview ? t('r8b.inv.preview') : t('v3.inv.details') }}</h3>
          <WbButton data-action="preview" variant="secondary" size="sm" :icon="showPreview ? 'pencil' : 'eye'" :aria-pressed="showPreview" @click="showPreview = !showPreview">
            {{ showPreview ? t('r8b.inv.backToEdit') : t('r8b.inv.preview') }}
          </WbButton>
        </div>

        <InvoiceDoc
          v-if="showPreview"
          :reference="reference || t('r8b.inv.refPending')"
          :client="client"
          :invoice-date="invoiceDate"
          :due-date="dueDate || null"
          :currency="currency"
          :notes="notes || null"
          :lines="parsed"
          :company="company"
        />

        <template v-else>
          <div class="wb-inv-head">
            <div class="is-wide"><WbInput id="inv-client" v-model="client" :label="t('invoices.form.client')" required autocomplete="off" /></div>
            <WbInput id="inv-reference" v-model="reference" :label="t('invoices.form.reference')" :placeholder="t('r8b.inv.refPending')" :hint="t('r8b.inv.refHint')" autocomplete="off" />
            <WbInput id="inv-date" v-model="invoiceDate" :label="t('invoices.form.date')" type="date" required />
            <WbInput id="inv-due" v-model="dueDate" :label="t('invoices.form.due')" type="date" :min="invoiceDate || undefined" />
            <WbSelect id="inv-currency" v-model="currency" :label="t('invoices.form.currency')" :options="currencyOptions" />
          </div>

          <fieldset class="wb-inv-lines">
            <legend class="h3">{{ t('r8b.inv.lines') }}</legend>
            <!-- Column titles (desktop); each field also has its own accessible name -->
            <div class="wb-inv-row wb-inv-th caption wb-mut" aria-hidden="true">
              <span>{{ t('r8b.inv.description') }}</span>
              <span class="is-r">{{ t('r8b.inv.qty') }}</span>
              <span class="is-r">{{ t('r8b.inv.unitPrice') }}</span>
              <span>{{ t('r8b.inv.vat') }}</span>
              <span class="is-r">{{ t('r8b.inv.net') }}</span>
              <span />
            </div>
            <div v-for="(l, i) in lines" :key="i" class="wb-inv-row wb-inv-line" :data-line="i">
              <WbInput v-model="l.description" :aria-label="t('r8b.inv.descriptionN', { n: i + 1 })" :placeholder="t('r8b.inv.description')" maxlength="300" />
              <WbInput v-model="l.quantity" class="is-num" :aria-label="`${t('r8b.inv.qty')} ${i + 1}`" inputmode="decimal" />
              <WbInput v-model="l.unit_price" class="is-num" :aria-label="`${t('r8b.inv.unitPrice')} ${i + 1}`" inputmode="decimal" :prefix="currency" />
              <WbSelect v-model="l.vat_rate" :aria-label="`${t('r8b.inv.vat')} ${i + 1}`" :options="VAT_RATES.map(v => ({ value: v, label: `${v.replace('.', ',')} %` }))" />
              <span class="wb-num wb-inv-net">{{ money(totals.lines[i]?.net ?? 0) }}</span>
              <WbButton data-action="remove-line" variant="ghost" size="sm" icon="trash-2" icon-only :disabled="lines.length === 1" @click="removeLine(i)">{{ t('r8b.inv.removeLine', { n: i + 1 }) }}</WbButton>
            </div>
            <div><WbButton data-action="add-line" variant="ghost" size="sm" icon="plus" @click="addLine">{{ t('r8b.inv.addLine') }}</WbButton></div>
          </fieldset>
        </template>
      </div>

      <!-- Right: totals, notes, actions (sticky on desktop) -->
      <aside class="wb-inv-ed-side">
        <dl class="wb-inv-totals" aria-live="polite">
          <div><dt>{{ t('r8b.inv.net') }}</dt><dd class="wb-num">{{ money(totals.net) }}</dd></div>
          <div><dt>{{ t('r8b.inv.vatTotal') }}</dt><dd class="wb-num">{{ money(totals.vat) }}</dd></div>
          <div class="is-t"><dt>{{ t('r8b.inv.gross') }}</dt><dd class="wb-num" data-gross>{{ money(totals.gross) }}</dd></div>
        </dl>
        <WbTextarea id="inv-notes" v-model="notes" :label="t('r8b.inv.notesLabel')" :max="1000" :rows="3" />
        <div class="wb-inv-actions">
          <WbButton data-action="save-pdf" block icon="file-text" :loading="saving" @click="save">{{ t('r8b.inv.saveAndPdf') }}</WbButton>
          <WbButton variant="ghost" block @click="emit('cancel')">{{ t('approvals.cancel') }}</WbButton>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.wb-inv-ed { display: flex; flex-direction: column; gap: var(--space-3); }
.wb-inv-ed-grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: var(--space-5); align-items: start; }
.wb-inv-ed-main { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
.wb-inv-ed-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.wb-inv-head { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.wb-inv-head .is-wide { grid-column: span 2; }

.wb-inv-lines { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.wb-inv-lines legend { padding: 0 0 var(--space-2); }
.wb-inv-row { display: grid; grid-template-columns: minmax(0, 1fr) 70px 120px 92px 96px 36px; gap: var(--space-2); align-items: center; }
.wb-inv-th { padding: 0 2px var(--space-1); border-bottom: 1px solid var(--border); }
.wb-inv-th .is-r, .wb-inv-net { text-align: right; }
.wb-inv-line { padding: 2px 0; }
.wb-inv-line :deep(.wb-field) { gap: 0; }
.wb-inv-line :deep(input.is-num) { text-align: right; }
.wb-inv-net { font-weight: 600; font-size: 13px; }

.wb-inv-ed-side { position: sticky; top: 0; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.wb-inv-totals { margin: 0; }
.wb-inv-totals div { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
.wb-inv-totals dt { color: var(--ink-2); }
.wb-inv-totals dd { margin: 0; }
.wb-inv-totals .is-t { border-top: 1px solid var(--border); margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 18px; }
.wb-inv-totals .is-t dt { color: var(--ink); }
.wb-inv-actions { display: flex; flex-direction: column; gap: var(--space-2); }

/* Narrow panels and phones: one column, each line becomes a small card */
@container wbapp (max-width: 1023px) {
  .wb-inv-ed-grid { grid-template-columns: minmax(0, 1fr); }
  .wb-inv-ed-side { position: static; }
}
@container wbapp (max-width: 767px) {
  /* Dates side by side; client and reference full width */
  .wb-inv-head { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .wb-inv-head > :nth-child(-n + 2) { grid-column: 1 / -1; }
  .wb-inv-th { display: none; }
  .wb-inv-row { grid-template-columns: repeat(3, minmax(0, 1fr)); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); }
  .wb-inv-row > :first-child { grid-column: 1 / -1; }
  .wb-inv-net { grid-column: span 2; text-align: left; }
}
</style>
