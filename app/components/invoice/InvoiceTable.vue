<script setup lang="ts">
import type { Invoice, InvoiceStatus } from '~/types/index'

const props = defineProps<{
  invoices: ReadonlyArray<Invoice>
  uploadingId: string | null
}>()

const emit = defineEmits<{
  'status-change': [id: string, status: InvoiceStatus]
  'upload': [id: string, file: File]
  'view-pdf': [path: string]
}>()

const STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: 'en_attente', label: 'En attente' },
  { value: 'envoyee',    label: 'Envoyée' },
  { value: 'payee',      label: 'Payée' },
]

const fileInputRefs = ref<Record<string, HTMLInputElement | null>>({})

function setFileRef(id: string, el: HTMLInputElement | null) {
  fileInputRefs.value[id] = el
}

function triggerUpload(id: string) {
  fileInputRefs.value[id]?.click()
}

function handleFileChange(id: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  emit('upload', id, file)
  input.value = ''
}

function handleStatusChange(id: string, status: string) {
  emit('status-change', id, status as InvoiceStatus)
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount)
}
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-100 text-left text-gray-500">
            <th class="px-4 py-3 font-medium">Référence</th>
            <th class="px-4 py-3 font-medium">Client</th>
            <th class="px-4 py-3 font-medium text-right">Montant</th>
            <th class="px-4 py-3 font-medium">Date</th>
            <th class="px-4 py-3 font-medium">Échéance</th>
            <th class="px-4 py-3 font-medium">Statut</th>
            <th class="px-4 py-3 font-medium text-right">PDF</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="invoice in invoices"
            :key="invoice.id"
            class="border-b border-gray-100 last:border-0"
          >
            <!-- Référence -->
            <td class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
              {{ invoice.reference }}
            </td>

            <!-- Client -->
            <td class="px-4 py-3 text-gray-700 whitespace-nowrap">
              {{ invoice.client }}
            </td>

            <!-- Montant -->
            <td class="px-4 py-3 text-right text-gray-900 whitespace-nowrap tabular-nums">
              {{ formatAmount(invoice.amount, invoice.currency) }}
            </td>

            <!-- Date facture -->
            <td class="px-4 py-3 text-gray-600 whitespace-nowrap">
              {{ formatDate(invoice.invoice_date) }}
            </td>

            <!-- Date échéance -->
            <td class="px-4 py-3 text-gray-600 whitespace-nowrap">
              {{ invoice.due_date ? formatDate(invoice.due_date) : '—' }}
            </td>

            <!-- Statut -->
            <td class="px-4 py-3">
              <AppSelect
                :value="invoice.status"
                :aria-label="`Changer le statut de la facture ${invoice.reference}`"
                class="w-36"
                @change="handleStatusChange(invoice.id, $event)"
              >
                <template #trigger="{ value }">
                  <InvoiceStatusBadge :status="(value as InvoiceStatus)" />
                </template>
                <AppSelectOption
                  v-for="opt in STATUS_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  <InvoiceStatusBadge :status="opt.value" />
                </AppSelectOption>
              </AppSelect>
            </td>

            <!-- PDF -->
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <input
                :ref="(el) => setFileRef(invoice.id, el as HTMLInputElement | null)"
                type="file"
                accept="application/pdf"
                class="sr-only"
                :aria-label="`Choisir un PDF pour la facture ${invoice.reference}`"
                @change="handleFileChange(invoice.id, $event)"
              />

              <template v-if="props.uploadingId === invoice.id">
                <span class="flex items-center justify-end gap-1.5 text-xs text-gray-500">
                  <AppSpinner color="gray" />
                  Envoi…
                </span>
              </template>

              <template v-else>
                <AppButton
                  v-if="invoice.pdf_path"
                  variant="ghost"
                  class="mr-1 text-xs"
                  @click="emit('view-pdf', invoice.pdf_path!)"
                >
                  Voir PDF
                </AppButton>

                <AppButton
                  variant="secondary"
                  class="text-xs"
                  @click="triggerUpload(invoice.id)"
                >
                  {{ invoice.pdf_path ? 'Remplacer' : 'Attacher PDF' }}
                </AppButton>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
