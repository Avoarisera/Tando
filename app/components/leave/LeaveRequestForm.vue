<script setup lang="ts">
import type { LeaveType } from '~/types/index'

const props = defineProps<{
  leaveTypes: readonly LeaveType[]
}>()

const emit = defineEmits<{
  close: []
  created: []
}>()

const { createRequest } = useLeaveRequests()
const toast = useToast()

const leaveTypeId = ref('')
const startDate = ref('')
const endDate = ref('')
const comment = ref('')
const isSubmitting = ref(false)
const formError = ref<string | null>(null)

const today = new Date().toISOString().substring(0, 10)

const daysCount = computed(() => {
  if (!startDate.value || !endDate.value) return 0
  const start = new Date(startDate.value)
  const end = new Date(endDate.value)
  const diff = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
  return Math.max(0, diff)
})

const startDateError = computed(() => {
  if (startDate.value && startDate.value < today) return 'La date de début ne peut pas être dans le passé'
  return null
})

const endDateError = computed(() => {
  if (endDate.value && startDate.value && endDate.value < startDate.value) {
    return 'La date de fin doit être après la date de début'
  }
  return null
})

const isValid = computed(() =>
  leaveTypeId.value !== ''
  && startDate.value !== ''
  && endDate.value !== ''
  && startDate.value >= today
  && endDate.value >= startDate.value
  && props.leaveTypes.length > 0
)

async function handleSubmit() {
  if (!isValid.value) return
  isSubmitting.value = true
  formError.value = null
  try {
    await createRequest({
      leaveTypeId: leaveTypeId.value,
      startDate: startDate.value,
      endDate: endDate.value,
      comment: comment.value || null,
    })
    toast.add('Demande créée avec succès')
    emit('created')
  } catch (e) {
    const msg = e instanceof Error
      ? e.message
      : (e !== null && typeof e === 'object' && 'message' in e)
        ? String((e as Record<string, unknown>).message)
        : null
    formError.value = msg ?? 'Erreur lors de la création de la demande'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AppModal title="Nouvelle demande de congé" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="handleSubmit">
      <!-- Leave type -->
      <div>
        <label for="leave-type" class="block text-sm font-medium text-gray-700 mb-1">
          Type de congé
        </label>
        <select
          id="leave-type"
          v-model="leaveTypeId"
          class="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          :disabled="props.leaveTypes.length === 0"
        >
          <option value="" disabled>Sélectionner un type</option>
          <option v-for="lt in props.leaveTypes" :key="lt.id" :value="lt.id">
            {{ lt.name }}
          </option>
        </select>
        <p v-if="props.leaveTypes.length === 0" class="mt-1 text-sm text-gray-500">
          Aucun type de congé disponible
        </p>
      </div>

      <!-- Start date -->
      <div>
        <label for="start-date" class="block text-sm font-medium text-gray-700 mb-1">
          Date de début
        </label>
        <input
          id="start-date"
          v-model="startDate"
          type="date"
          :min="today"
          class="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          :aria-describedby="startDateError ? 'start-date-error' : undefined"
        />
        <p v-if="startDateError" id="start-date-error" class="mt-1 text-sm text-red-600">
          {{ startDateError }}
        </p>
      </div>

      <!-- End date -->
      <div>
        <label for="end-date" class="block text-sm font-medium text-gray-700 mb-1">
          Date de fin
        </label>
        <input
          id="end-date"
          v-model="endDate"
          type="date"
          :min="startDate || today"
          class="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
          :aria-describedby="endDateError ? 'end-date-error' : undefined"
        />
        <p v-if="endDateError" id="end-date-error" class="mt-1 text-sm text-red-600">
          {{ endDateError }}
        </p>
      </div>

      <!-- Days count -->
      <p v-if="daysCount > 0" class="text-sm text-gray-600">
        Durée : <span class="font-medium text-gray-900">{{ daysCount }} jour{{ daysCount > 1 ? 's' : '' }}</span>
      </p>

      <!-- Comment -->
      <div>
        <label for="comment" class="block text-sm font-medium text-gray-700 mb-1">
          Commentaire <span class="font-normal text-gray-400">(optionnel)</span>
        </label>
        <textarea
          id="comment"
          v-model="comment"
          rows="3"
          maxlength="500"
          class="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none"
          placeholder="Précisions éventuelles…"
        />
        <p class="mt-1 text-xs text-gray-400 text-right">{{ comment.length }}/500</p>
      </div>

      <!-- Server error -->
      <div
        v-if="formError"
        class="rounded-md bg-red-50 p-3 text-sm text-red-700"
        role="alert"
      >
        {{ formError }}
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-3 pt-2">
        <AppButton variant="secondary" type="button" @click="emit('close')">
          Annuler
        </AppButton>
        <AppButton type="submit" :disabled="!isValid || isSubmitting">
          <span v-if="isSubmitting" class="inline-flex items-center gap-2">
            <AppSpinner />
            Envoi en cours…
          </span>
          <span v-else>Envoyer la demande</span>
        </AppButton>
      </div>
    </form>
  </AppModal>
</template>
