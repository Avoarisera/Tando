<script setup lang="ts">
import type { LeaveType, AdminBalanceRow } from '~/types/index'

definePageMeta({ middleware: 'admin-only', layout: 'private' })

const { leaveTypes, isLoading, error, fetchLeaveTypes, createLeaveType, updateLeaveType, toggleLeaveType } = useLeaveTypes()
const {
  adminBalances,
  isLoadingAdmin,
  adminError,
  fetchAdminBalances,
  updateAllocatedDays,
  upsertTypeBalances,
} = useLeaveBalances()
const toast = useToast()

const activeTab = ref<'types' | 'balances'>('types')
const selectedYear = ref(new Date().getFullYear())

const showModal = ref(false)
const editingType = ref<LeaveType | null>(null)

const formName = ref('')
const formColor = ref('#4CAF50')
const formError = ref<string | null>(null)
const isSaving = ref(false)
const togglingId = ref<string | null>(null)

const editingDays = ref<Record<string, number>>({})
const daysError = ref<Record<string, string>>({})
const savingId = ref<string | null>(null)
const bulkDays = ref<Record<string, number>>({})
const bulkError = ref<Record<string, string>>({})
const bulkSavingId = ref<string | null>(null)

const allDisabledWarning = computed(
  () => leaveTypes.value.length > 0 && leaveTypes.value.every(t => !t.is_active),
)

const balancesByType = computed(() => {
  const map = new Map<string, { type: AdminBalanceRow['leave_types'], rows: AdminBalanceRow[] }>()
  for (const b of adminBalances.value) {
    if (!map.has(b.leave_type_id)) {
      map.set(b.leave_type_id, { type: b.leave_types, rows: [] })
    }
    map.get(b.leave_type_id)!.rows.push(b)
  }
  return [...map.values()]
})

watch(editingType, (type) => {
  if (type) {
    formName.value = type.name
    formColor.value = type.color
  } else {
    formName.value = ''
    formColor.value = '#4CAF50'
  }
}, { immediate: true })

watch(selectedYear, (year) => fetchAdminBalances(year))

onMounted(() => fetchLeaveTypes(false))

function openBalancesTab() {
  activeTab.value = 'balances'
  fetchAdminBalances(selectedYear.value)
}

function openCreateModal() {
  editingType.value = null
  showModal.value = true
}

function openEditModal(type: LeaveType) {
  editingType.value = type
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingType.value = null
  formError.value = null
}

async function handleSave() {
  if (!formName.value.trim()) return
  isSaving.value = true
  formError.value = null
  try {
    if (editingType.value) {
      await updateLeaveType(editingType.value.id, formName.value, formColor.value)
      toast.add('Type de congé modifié')
    } else {
      await createLeaveType(formName.value, formColor.value)
      toast.add('Type de congé ajouté')
    }
    closeModal()
    await fetchLeaveTypes(false)
  } catch (e) {
    formError.value = e instanceof Error ? e.message : "Erreur lors de l'enregistrement"
  } finally {
    isSaving.value = false
  }
}

async function handleToggle(type: LeaveType) {
  if (togglingId.value === type.id) return
  togglingId.value = type.id
  try {
    await toggleLeaveType(type.id, !type.is_active)
    toast.add(type.is_active ? 'Type désactivé' : 'Type activé')
    await fetchLeaveTypes(false)
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors de la mise à jour', 'error')
  } finally {
    togglingId.value = null
  }
}

function validateDays(days: number | undefined): string | null {
  if (days === undefined || isNaN(days)) return 'Valeur invalide'
  if (!Number.isInteger(days)) return 'Le nombre de jours doit être un entier'
  if (days < 0) return 'Le nombre de jours ne peut pas être négatif'
  return null
}

function startEdit(b: AdminBalanceRow) {
  editingDays.value[b.id] = b.allocated_days
  delete daysError.value[b.id]
}

function cancelEdit(id: string) {
  delete editingDays.value[id]
  delete daysError.value[id]
}

async function handleSaveDays(b: AdminBalanceRow) {
  const days = editingDays.value[b.id]
  const validationError = validateDays(days)
  if (validationError) {
    daysError.value[b.id] = validationError
    return
  }
  delete daysError.value[b.id]
  savingId.value = b.id
  try {
    await updateAllocatedDays(b.id, days as number)
    toast.add('Solde mis à jour')
    await fetchAdminBalances(selectedYear.value)
    delete editingDays.value[b.id]
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors de la mise à jour', 'error')
  } finally {
    savingId.value = null
  }
}

async function handleBulkSet(typeId: string) {
  const days = bulkDays.value[typeId]
  const validationError = validateDays(days)
  if (validationError) {
    bulkError.value[typeId] = validationError
    return
  }
  delete bulkError.value[typeId]
  bulkSavingId.value = typeId
  try {
    await upsertTypeBalances(typeId, selectedYear.value, days as number)
    toast.add('Quota appliqué à tous les employés')
    await fetchAdminBalances(selectedYear.value)
    delete bulkDays.value[typeId]
  } catch (e) {
    toast.add(e instanceof Error ? e.message : "Erreur lors de l'application du quota", 'error')
  } finally {
    bulkSavingId.value = null
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-semibold text-gray-900">Administration des congés</h1>
      <AppButton v-if="activeTab === 'types'" @click="openCreateModal">Ajouter un type</AppButton>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 mb-6">
      <nav class="flex gap-6" aria-label="Onglets administration">
        <button
          class="pb-3 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'types'
            ? 'border-brand-primary text-brand-primary'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="activeTab = 'types'"
        >
          Types de congé
        </button>
        <button
          class="pb-3 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'balances'
            ? 'border-brand-primary text-brand-primary'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="openBalancesTab"
        >
          Soldes
        </button>
      </nav>
    </div>

    <!-- Tab: Types -->
    <template v-if="activeTab === 'types'">
      <!-- Warning banner -->
      <div
        v-if="allDisabledWarning"
        class="rounded-md bg-amber-50 border border-amber-200 p-3 mb-4 text-sm text-amber-800"
      >
        Attention : aucun type de congé actif. Les employés ne pourront pas créer de demandes.
      </div>

      <!-- 1. Loading -->
      <template v-if="isLoading">
        <AppSkeleton v-for="i in 4" :key="i" class="mb-3 h-12" />
      </template>

      <!-- 2. Error -->
      <AppErrorBanner
        v-else-if="error"
        :message="error"
        @retry="fetchLeaveTypes(false)"
      />

      <!-- 3. Empty -->
      <AppEmptyState
        v-else-if="leaveTypes.length === 0"
        title="Aucun type de congé"
        description="Ajoutez un premier type de congé pour permettre aux employés de créer des demandes."
      >
        <AppButton class="mt-4" @click="openCreateModal">Ajouter un type</AppButton>
      </AppEmptyState>

      <!-- 4. Content -->
      <div v-else class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-100 text-left text-gray-500">
                <th class="px-4 py-3 w-12 font-medium">Couleur</th>
                <th class="px-4 py-3 font-medium">Nom</th>
                <th class="px-4 py-3 font-medium">Statut</th>
                <th class="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="type in leaveTypes"
                :key="type.id"
                :class="['border-b border-gray-100 last:border-0 transition-opacity', !type.is_active && 'opacity-50']"
              >
                <td class="px-4 py-3">
                  <span
                    class="w-5 h-5 rounded-full inline-block"
                    :style="{ backgroundColor: type.color }"
                    :title="type.color"
                    :aria-label="`Couleur ${type.color}`"
                  />
                </td>
                <td class="px-4 py-3 font-medium text-gray-900">{{ type.name }}</td>
                <td class="px-4 py-3">
                  <AppBadge
                    :label="type.is_active ? 'Actif' : 'Inactif'"
                    :variant="type.is_active ? 'green' : 'gray'"
                  />
                </td>
                <td class="px-4 py-3 text-right space-x-2">
                  <AppButton variant="ghost" @click="openEditModal(type)">Modifier</AppButton>
                  <AppButton
                    :variant="type.is_active ? 'secondary' : 'ghost'"
                    :disabled="togglingId === type.id"
                    @click="handleToggle(type)"
                  >
                    <span v-if="togglingId === type.id" class="flex items-center gap-2">
                      <AppSpinner color="gray" />
                      {{ type.is_active ? 'Désactivation…' : 'Activation…' }}
                    </span>
                    <span v-else>{{ type.is_active ? 'Désactiver' : 'Activer' }}</span>
                  </AppButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Tab: Soldes -->
    <template v-else-if="activeTab === 'balances'">
      <!-- Year selector -->
      <div class="flex items-center gap-3 mb-6">
        <label for="balance-year" class="text-sm font-medium text-gray-700">Année</label>
        <select
          id="balance-year"
          v-model="selectedYear"
          class="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
        >
          <option v-for="y in [selectedYear - 1, selectedYear, selectedYear + 1]" :key="y" :value="y">
            {{ y }}
          </option>
        </select>
      </div>

      <!-- 1. Loading -->
      <template v-if="isLoadingAdmin">
        <AppSkeleton v-for="i in 3" :key="i" class="mb-4 h-32" />
      </template>

      <!-- 2. Error -->
      <AppErrorBanner
        v-else-if="adminError"
        :message="adminError"
        @retry="fetchAdminBalances(selectedYear)"
      />

      <!-- 3. Empty -->
      <AppEmptyState
        v-else-if="balancesByType.length === 0"
        title="Aucun solde pour cette année"
        description="Créez un type de congé pour initialiser automatiquement les soldes."
      />

      <!-- 4. Content — grouped by leave type -->
      <div v-else class="space-y-6">
        <div
          v-for="group in balancesByType"
          :key="group.type.id"
          class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
        >
          <!-- Group header -->
          <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div class="flex items-center gap-2">
              <span
                class="w-3 h-3 rounded-full inline-block flex-shrink-0"
                :style="{ backgroundColor: group.type.color }"
                :aria-label="`Couleur ${group.type.color}`"
              />
              <span class="font-medium text-gray-900 text-sm">{{ group.type.name }}</span>
            </div>
            <!-- Bulk set -->
            <div class="flex flex-wrap items-center gap-2">
              <label :for="`bulk-${group.type.id}`" class="text-xs text-gray-500">
                Appliquer à tous :
              </label>
              <div class="flex flex-col gap-1">
                <input
                  :id="`bulk-${group.type.id}`"
                  v-model.number="bulkDays[group.type.id]"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="jours"
                  class="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  :class="{ 'border-red-400': bulkError[group.type.id] }"
                  :aria-label="`Quota pour ${group.type.name}`"
                  :aria-describedby="bulkError[group.type.id] ? `bulk-error-${group.type.id}` : undefined"
                  @input="delete bulkError[group.type.id]"
                />
                <span
                  v-if="bulkError[group.type.id]"
                  :id="`bulk-error-${group.type.id}`"
                  class="text-xs text-red-600"
                  role="alert"
                >
                  {{ bulkError[group.type.id] }}
                </span>
              </div>
              <AppButton
                variant="secondary"
                :disabled="bulkDays[group.type.id] === undefined || bulkSavingId === group.type.id"
                @click="handleBulkSet(group.type.id)"
              >
                <span v-if="bulkSavingId === group.type.id" class="flex items-center gap-1">
                  <AppSpinner color="gray" />
                  Envoi…
                </span>
                <span v-else>Appliquer</span>
              </AppButton>
            </div>
          </div>

          <!-- Per-employee rows -->
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-500 border-b border-gray-100">
                  <th class="px-4 py-2 font-medium">Employé</th>
                  <th class="px-4 py-2 font-medium text-right">Alloués</th>
                  <th class="px-4 py-2 font-medium text-right">Utilisés</th>
                  <th class="px-4 py-2 font-medium text-right">Restants</th>
                  <th class="px-4 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="b in group.rows"
                  :key="b.id"
                  class="border-b border-gray-100 last:border-0"
                >
                  <td class="px-4 py-3 text-gray-900">
                    {{ b.profiles.first_name }} {{ b.profiles.last_name }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    <template v-if="editingDays[b.id] !== undefined">
                      <input
                        v-model.number="editingDays[b.id]"
                        type="number"
                        min="0"
                        step="1"
                        class="w-16 border border-gray-300 rounded px-2 py-0.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-primary"
                        :class="{ 'border-red-400': daysError[b.id] }"
                        :aria-label="`Jours alloués pour ${b.profiles.first_name} ${b.profiles.last_name}`"
                        :aria-describedby="daysError[b.id] ? `days-error-${b.id}` : undefined"
                        @input="delete daysError[b.id]"
                      />
                      <span
                        v-if="daysError[b.id]"
                        :id="`days-error-${b.id}`"
                        class="block text-xs text-red-600 mt-0.5 text-right"
                        role="alert"
                      >
                        {{ daysError[b.id] }}
                      </span>
                    </template>
                    <span v-else class="text-gray-900">{{ b.allocated_days }}</span>
                  </td>
                  <td class="px-4 py-3 text-right text-gray-500">{{ b.used_days }}</td>
                  <td
                    class="px-4 py-3 text-right"
                    :class="(b.allocated_days - b.used_days) < 0 ? 'text-red-600' : 'text-gray-900'"
                  >
                    {{ b.allocated_days - b.used_days }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    <template v-if="editingDays[b.id] !== undefined">
                      <AppButton
                        variant="ghost"
                        :disabled="savingId === b.id"
                        @click="handleSaveDays(b)"
                      >
                        <span v-if="savingId === b.id" class="flex items-center gap-1">
                          <AppSpinner color="gray" />
                          Envoi…
                        </span>
                        <span v-else>Enregistrer</span>
                      </AppButton>
                      <AppButton variant="ghost" @click="cancelEdit(b.id)">Annuler</AppButton>
                    </template>
                    <AppButton v-else variant="ghost" @click="startEdit(b)">Modifier</AppButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal create / edit -->
    <AppModal
      v-if="showModal"
      :title="editingType ? 'Modifier le type de congé' : 'Ajouter un type de congé'"
      @close="closeModal"
    >
      <form @submit.prevent="handleSave">
        <!-- Name field -->
        <div class="mb-4">
          <label for="type-name" class="block text-sm font-medium text-gray-700 mb-1">
            Nom <span class="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id="type-name"
            v-model="formName"
            type="text"
            required
            autocomplete="off"
            class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            placeholder="ex. Congé exceptionnel"
          />
        </div>

        <!-- Color field -->
        <div class="mb-6">
          <label for="type-color" class="block text-sm font-medium text-gray-700 mb-1">
            Couleur <span class="text-red-500" aria-hidden="true">*</span>
          </label>
          <div class="flex items-center gap-3">
            <input
              id="type-color"
              v-model="formColor"
              type="color"
              class="w-10 h-10 rounded cursor-pointer border border-gray-300"
            />
            <span class="text-sm text-gray-500 font-mono">{{ formColor }}</span>
          </div>
        </div>

        <!-- Inline error -->
        <div
          v-if="formError"
          class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {{ formError }}
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-3">
          <AppButton variant="secondary" type="button" @click="closeModal">Annuler</AppButton>
          <AppButton type="submit" :disabled="isSaving || !formName.trim()">
            <span v-if="isSaving" class="flex items-center gap-2">
              <AppSpinner />
              Enregistrement…
            </span>
            <span v-else>{{ editingType ? 'Modifier' : 'Ajouter' }}</span>
          </AppButton>
        </div>
      </form>
    </AppModal>
  </div>
</template>
