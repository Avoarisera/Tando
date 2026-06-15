<script setup lang="ts">
import type { Invoice, InvoiceCurrency } from '~/types/index'

type CreatePayload = Omit<Invoice, 'id' | 'created_at' | 'created_by' | 'pdf_path'>

const props = defineProps<{
  isSubmitting: boolean
  error: string | null
}>()

const emit = defineEmits<{
  submit: [payload: CreatePayload]
  cancel: []
}>()

const CURRENCIES: InvoiceCurrency[] = ['EUR', 'USD', 'GBP', 'CAD', 'AUD', 'MGA']

const reference = ref('')
const client = ref('')
const amount = ref<number | null>(null)
const currency = ref<InvoiceCurrency>('EUR')
const invoiceDate = ref('')
const dueDate = ref('')
const notes = ref('')

const validationError = ref<string | null>(null)

function validate(): boolean {
  if (!reference.value.trim()) {
    validationError.value = 'La référence est obligatoire'
    return false
  }
  if (!client.value.trim()) {
    validationError.value = 'Le client est obligatoire'
    return false
  }
  if (amount.value === null || isNaN(amount.value) || amount.value <= 0) {
    validationError.value = 'Le montant doit être supérieur à 0'
    return false
  }
  if (!invoiceDate.value) {
    validationError.value = "La date de facture est obligatoire"
    return false
  }
  if (dueDate.value && dueDate.value < invoiceDate.value) {
    validationError.value = "La date d'échéance ne peut pas être avant la date de facture"
    return false
  }
  validationError.value = null
  return true
}

function handleSubmit() {
  if (!validate()) return
  emit('submit', {
    reference: reference.value.trim(),
    client: client.value.trim(),
    amount: amount.value as number,
    currency: currency.value,
    invoice_date: invoiceDate.value,
    due_date: dueDate.value || null,
    notes: notes.value.trim() || null,
    status: 'en_attente',
  })
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <!-- Référence -->
    <div class="mb-4">
      <label for="inv-reference" class="block text-sm font-medium text-gray-700 mb-1">
        Référence <span class="text-red-500" aria-hidden="true">*</span>
      </label>
      <input
        id="inv-reference"
        v-model="reference"
        type="text"
        autocomplete="off"
        required
        class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        placeholder="ex. FAC-2026-001"
      />
    </div>

    <!-- Client -->
    <div class="mb-4">
      <label for="inv-client" class="block text-sm font-medium text-gray-700 mb-1">
        Client <span class="text-red-500" aria-hidden="true">*</span>
      </label>
      <input
        id="inv-client"
        v-model="client"
        type="text"
        autocomplete="off"
        required
        class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        placeholder="ex. ACME Corp"
      />
    </div>

    <!-- Montant + Devise -->
    <div class="mb-4 flex gap-3">
      <div class="flex-1">
        <label for="inv-amount" class="block text-sm font-medium text-gray-700 mb-1">
          Montant <span class="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="inv-amount"
          v-model.number="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          placeholder="0.00"
        />
      </div>
      <div class="w-28">
        <label for="inv-currency" class="block text-sm font-medium text-gray-700 mb-1">
          Devise <span class="text-red-500" aria-hidden="true">*</span>
        </label>
        <select
          id="inv-currency"
          v-model="currency"
          class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        >
          <option v-for="cur in CURRENCIES" :key="cur" :value="cur">{{ cur }}</option>
        </select>
      </div>
    </div>

    <!-- Date de facture -->
    <div class="mb-4">
      <label for="inv-date" class="block text-sm font-medium text-gray-700 mb-1">
        Date de facture <span class="text-red-500" aria-hidden="true">*</span>
      </label>
      <input
        id="inv-date"
        v-model="invoiceDate"
        type="date"
        required
        class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />
    </div>

    <!-- Date d'échéance -->
    <div class="mb-4">
      <label for="inv-due" class="block text-sm font-medium text-gray-700 mb-1">
        Date d'échéance
      </label>
      <input
        id="inv-due"
        v-model="dueDate"
        type="date"
        class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
      />
    </div>

    <!-- Notes -->
    <div class="mb-6">
      <label for="inv-notes" class="block text-sm font-medium text-gray-700 mb-1">
        Notes
      </label>
      <textarea
        id="inv-notes"
        v-model="notes"
        rows="3"
        class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
        placeholder="Informations complémentaires…"
      />
    </div>

    <!-- Erreur validation client -->
    <div
      v-if="validationError"
      class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
      role="alert"
    >
      {{ validationError }}
    </div>

    <!-- Erreur serveur -->
    <div
      v-else-if="props.error"
      class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
      role="alert"
    >
      {{ props.error }}
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-3">
      <AppButton variant="secondary" type="button" @click="emit('cancel')">
        Annuler
      </AppButton>
      <AppButton type="submit" :disabled="props.isSubmitting">
        <span v-if="props.isSubmitting" class="flex items-center gap-2">
          <AppSpinner />
          Enregistrement…
        </span>
        <span v-else>Créer la facture</span>
      </AppButton>
    </div>
  </form>
</template>
