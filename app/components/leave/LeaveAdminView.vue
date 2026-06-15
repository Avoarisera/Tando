<script setup lang="ts">
import type { AdminConfirmAction, LeaveRequestWithRelations, LeaveStatus } from '~/types/index'

const { profile } = useCurrentUser()
const { requests, updateRequestStatus, fetchRequests } = useLeaveRequests()
const toast = useToast()

const statusFilter = ref<LeaveStatus | 'all'>('all')
const adminConfirmAction = ref<AdminConfirmAction | null>(null)

const FILTER_OPTIONS = [
  { value: 'all',              label: 'Tous les statuts' },
  { value: 'pending',          label: 'En attente' },
  { value: 'manager_approved', label: 'Validé manager' },
  { value: 'approved',         label: 'Approuvé' },
  { value: 'rejected',         label: 'Refusé' },
] as const satisfies ReadonlyArray<{ value: LeaveStatus | 'all'; label: string }>

const filteredRequests = computed(() =>
  statusFilter.value === 'all'
    ? requests.value
    : requests.value.filter(r => r.status === statusFilter.value)
)

const adminConfirmTitle = computed(() => {
  if (!adminConfirmAction.value) return ''
  const { type, currentStatus, employeeName } = adminConfirmAction.value
  if (type === 'approve') {
    return currentStatus === 'pending'
      ? 'Approuver directement (sans validation manager) ?'
      : `Approuver la demande de ${employeeName} ?`
  }
  return `Refuser la demande de ${employeeName} ?`
})

function canTakeAction(status: LeaveStatus): boolean {
  return status === 'pending' || status === 'manager_approved'
}

function openAdminApprove(request: LeaveRequestWithRelations) {
  adminConfirmAction.value = {
    type: 'approve',
    requestId: request.id,
    currentStatus: request.status,
    employeeName: `${request.profiles.first_name} ${request.profiles.last_name}`,
    period: `du ${formatDate(request.start_date)} au ${formatDate(request.end_date)}`,
  }
}

function openAdminReject(request: LeaveRequestWithRelations) {
  adminConfirmAction.value = {
    type: 'reject',
    requestId: request.id,
    currentStatus: request.status,
    employeeName: `${request.profiles.first_name} ${request.profiles.last_name}`,
    period: `du ${formatDate(request.start_date)} au ${formatDate(request.end_date)}`,
  }
}

async function handleAdminApprove() {
  if (!adminConfirmAction.value || !profile.value) return
  const { requestId } = adminConfirmAction.value
  try {
    await updateRequestStatus(requestId, {
      status: 'approved',
      admin_reviewed_by: profile.value.id,
      admin_reviewed_at: new Date().toISOString(),
    })
    toast.add('Demande approuvée — solde mis à jour')
    await fetchRequests()
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors de l\'approbation', 'error')
  } finally {
    adminConfirmAction.value = null
  }
}

async function handleAdminReject() {
  if (!adminConfirmAction.value || !profile.value) return
  const { requestId } = adminConfirmAction.value
  try {
    await updateRequestStatus(requestId, {
      status: 'rejected',
      admin_reviewed_by: profile.value.id,
      admin_reviewed_at: new Date().toISOString(),
    })
    toast.add('Demande refusée')
    await fetchRequests()
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors du refus', 'error')
  } finally {
    adminConfirmAction.value = null
  }
}

async function executeAdminAction() {
  if (!adminConfirmAction.value) return
  if (adminConfirmAction.value.type === 'approve') {
    await handleAdminApprove()
  } else {
    await handleAdminReject()
  }
}
</script>

<template>
  <!-- Header + filter -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <h2 class="text-base font-semibold text-gray-800">Toutes les demandes</h2>
    <div class="flex items-center gap-2">
      <label for="status-filter" class="text-sm text-gray-600 whitespace-nowrap">
        Filtrer par statut
      </label>
      <select
        id="status-filter"
        v-model="statusFilter"
        class="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option v-for="opt in FILTER_OPTIONS" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>
  </div>

  <!-- Empty state -->
  <AppEmptyState
    v-if="filteredRequests.length === 0"
    title="Aucune demande"
    :description="statusFilter === 'all'
      ? 'Aucune demande de congé enregistrée.'
      : 'Aucune demande ne correspond à ce filtre.'"
  />

  <template v-else>
    <!-- Mobile: card layout -->
    <ul class="space-y-3 md:hidden">
      <li
        v-for="req in filteredRequests"
        :key="req.id"
        class="bg-white border border-gray-200 rounded-lg p-4 space-y-3"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="w-3 h-3 rounded-full shrink-0"
              :style="{ backgroundColor: req.leave_types.color }"
              :aria-label="req.leave_types.name"
            />
            <span class="font-medium text-gray-900 truncate text-sm">{{ req.leave_types.name }}</span>
          </div>
          <LeaveStatusBadge :status="req.status" />
        </div>

        <div class="text-sm text-gray-700 font-medium">
          {{ req.profiles.first_name }} {{ req.profiles.last_name }}
          <span v-if="req.profiles.teams" class="text-gray-400 font-normal">
            — {{ req.profiles.teams.name }}
          </span>
        </div>

        <div class="text-sm text-gray-600">
          Du {{ formatDate(req.start_date) }} au {{ formatDate(req.end_date) }}
          <span class="text-gray-400 ml-1">({{ req.days_count }} j)</span>
        </div>

        <div class="text-xs text-gray-400">Créée le {{ formatDate(req.created_at) }}</div>

        <div v-if="canTakeAction(req.status)" class="flex gap-2 pt-1">
          <AppButton
            variant="primary"
            class="flex-1 text-xs py-1.5"
            @click="openAdminApprove(req)"
          >
            Approuver
          </AppButton>
          <AppButton
            variant="danger"
            class="flex-1 text-xs py-1.5"
            @click="openAdminReject(req)"
          >
            Refuser
          </AppButton>
        </div>
      </li>
    </ul>

    <!-- Desktop: table layout -->
    <div class="hidden md:block overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Employé
            </th>
            <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Équipe
            </th>
            <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Période
            </th>
            <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Durée
            </th>
            <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Statut
            </th>
            <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Créée le
            </th>
            <th scope="col" class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-100">
          <tr v-for="req in filteredRequests" :key="req.id" class="hover:bg-gray-50">
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
              {{ req.profiles.first_name }} {{ req.profiles.last_name }}
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
              {{ req.profiles.teams?.name ?? '—' }}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <div class="flex items-center gap-2">
                <span
                  class="w-2.5 h-2.5 rounded-full shrink-0"
                  :style="{ backgroundColor: req.leave_types.color }"
                  :aria-label="req.leave_types.name"
                />
                <span class="text-sm text-gray-900">{{ req.leave_types.name }}</span>
              </div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
              {{ formatDate(req.start_date) }} → {{ formatDate(req.end_date) }}
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
              {{ req.days_count }} j
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <LeaveStatusBadge :status="req.status" />
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
              {{ formatDate(req.created_at) }}
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
              <div class="flex justify-end gap-2">
                <AppButton
                  v-if="canTakeAction(req.status)"
                  variant="primary"
                  @click="openAdminApprove(req)"
                >
                  Approuver
                </AppButton>
                <AppButton
                  v-if="canTakeAction(req.status)"
                  variant="danger"
                  @click="openAdminReject(req)"
                >
                  Refuser
                </AppButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>

  <!-- Confirmation modal -->
  <AppConfirmModal
    v-if="adminConfirmAction"
    :title="adminConfirmTitle"
    :description="adminConfirmAction.period"
    :confirm-label="adminConfirmAction.type === 'approve' ? 'Approuver' : 'Refuser'"
    @confirm="executeAdminAction"
    @cancel="adminConfirmAction = null"
  />
</template>
