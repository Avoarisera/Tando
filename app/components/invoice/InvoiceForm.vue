<script setup lang="ts">
import type { Invoice, InvoiceCurrency } from '~/types/index'

type CreatePayload = Omit<Invoice, 'id' | 'created_at' | 'created_by' | 'pdf_path'>

defineProps<{ isSubmitting: boolean, error: string | null }>()
const emit = defineEmits<{ submit: [payload: CreatePayload], cancel: [] }>()
const { t } = useI18n()

const CURRENCIES: InvoiceCurrency[] = ['EUR', 'USD', 'GBP', 'CAD', 'AUD', 'MGA']
const currencyOptions = CURRENCIES.map(c => ({ value: c, label: c }))

const reference = ref('')
const client = ref('')
const amount = ref('')
const currency = ref<InvoiceCurrency>('EUR')
const invoiceDate = ref('')
const dueDate = ref('')
const notes = ref('')
const validationError = ref<string | null>(null)

function validate(): boolean {
  const n = Number(amount.value)
  if (!reference.value.trim()) validationError.value = t('invoices.form.refRequired')
  else if (!client.value.trim()) validationError.value = t('invoices.form.clientRequired')
  else if (amount.value === '' || Number.isNaN(n) || n <= 0) validationError.value = t('invoices.form.amountPositive')
  else if (!invoiceDate.value) validationError.value = t('invoices.form.dateRequired')
  else if (dueDate.value && dueDate.value < invoiceDate.value) validationError.value = t('invoices.form.dueBeforeDate')
  else validationError.value = null
  return validationError.value === null
}

function handleSubmit() {
  if (!validate()) return
  emit('submit', {
    reference: reference.value.trim(),
    client: client.value.trim(),
    amount: Number(amount.value),
    currency: currency.value,
    invoice_date: invoiceDate.value,
    due_date: dueDate.value || null,
    notes: notes.value.trim() || null,
    status: 'en_attente',
  })
}
</script>

<template>
  <form class="wb-stack" novalidate @submit.prevent="handleSubmit">
    <WbBanner v-if="validationError || error" tone="danger">{{ validationError || error }}</WbBanner>
    <div class="wb-grid wb-cols-2" style="gap: 16px">
      <WbInput id="inv-reference" v-model="reference" :label="t('invoices.form.reference')" required autocomplete="off" placeholder="FAC-2026-004" />
      <WbInput id="inv-client" v-model="client" :label="t('invoices.form.client')" required autocomplete="off" />
      <WbInput id="inv-amount" v-model="amount" :label="t('invoices.form.amount')" required type="number" inputmode="decimal" min="0" step="0.01" />
      <WbSelect id="inv-currency" v-model="currency" :label="t('invoices.form.currency')" :options="currencyOptions" />
      <WbInput id="inv-date" v-model="invoiceDate" :label="t('invoices.form.date')" required type="date" />
      <WbInput id="inv-due" v-model="dueDate" :label="t('invoices.form.due')" type="date" :min="invoiceDate || undefined" />
    </div>
    <WbTextarea id="inv-notes" v-model="notes" :label="t('invoices.form.notes')" :max="1000" />
    <div class="wb-row" style="justify-content: flex-end; gap: 8px">
      <WbButton variant="ghost" @click="emit('cancel')">{{ t('approvals.cancel') }}</WbButton>
      <WbButton type="submit" :loading="isSubmitting">{{ isSubmitting ? t('invoices.form.saving') : t('invoices.form.save') }}</WbButton>
    </div>
  </form>
</template>
