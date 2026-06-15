<script setup lang="ts">
import type { ConfirmAction, TeamMemberBalance } from '~/types/index'

definePageMeta({ layout: 'private' })

const { isEmployee, isManager, isAdmin, profile, loadProfile } = useCurrentUser()
const { requests, isLoading, error, fetchRequests, updateRequestStatus } = useLeaveRequests()
const { teamBalances, isLoadingTeam, teamError, fetchTeamBalances } = useLeaveBalances()
const { leaveTypes, fetchLeaveTypes } = useLeaveTypes()
const toast = useToast()

const showCreateModal = ref(false)
const confirmAction = ref<ConfirmAction | null>(null)

const pendingRequests = computed(() =>
  requests.value.filter(r => r.status === 'pending')
)

function remainingDays(balance: TeamMemberBalance): number | null {
  if (balance.allocated_days === null || balance.used_days === null) return null
  return balance.allocated_days - balance.used_days
}

function remainingClass(balance: TeamMemberBalance): string {
  const r = remainingDays(balance)
  if (r === null) return 'text-gray-400'
  return r > 0 ? 'text-green-700' : 'text-red-700'
}

function openApprove(requestId: string) {
  const req = requests.value.find(r => r.id === requestId)
  if (!req) return
  confirmAction.value = {
    type: 'approve',
    requestId,
    employeeName: `${req.profiles.first_name} ${req.profiles.last_name}`,
    startDate: req.start_date,
    endDate: req.end_date,
  }
}

function openReject(requestId: string) {
  const req = requests.value.find(r => r.id === requestId)
  if (!req) return
  confirmAction.value = {
    type: 'reject',
    requestId,
    employeeName: `${req.profiles.first_name} ${req.profiles.last_name}`,
    startDate: req.start_date,
    endDate: req.end_date,
  }
}

async function handleApprove() {
  if (!confirmAction.value || !profile.value) return
  const { requestId } = confirmAction.value
  try {
    await updateRequestStatus(requestId, {
      status: 'manager_approved',
      manager_reviewed_by: profile.value.id,
      manager_reviewed_at: new Date().toISOString(),
    })
    toast.add('Demande approuvée')
    await fetchRequests()
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors de l\'approbation', 'error')
  } finally {
    confirmAction.value = null
  }
}

async function handleReject() {
  if (!confirmAction.value || !profile.value) return
  const { requestId } = confirmAction.value
  try {
    await updateRequestStatus(requestId, {
      status: 'rejected',
      manager_reviewed_by: profile.value.id,
      manager_reviewed_at: new Date().toISOString(),
    })
    toast.add('Demande refusée')
    await fetchRequests()
  } catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors du refus', 'error')
  } finally {
    confirmAction.value = null
  }
}

async function handleCreated() {
  showCreateModal.value = false
  await fetchRequests()
}

onMounted(async () => {
  await loadProfile()
  await Promise.all([
    fetchRequests(),
    ...(isEmployee.value ? [fetchLeaveTypes()] : []),
  ])
  if (isManager.value) {
    await fetchTeamBalances()
  }
})
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-8">
    <!-- Page header -->
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold text-gray-900">Demandes de congé</h1>
      <AppButton v-if="isEmployee" @click="showCreateModal = true">
        Nouvelle demande
      </AppButton>
    </div>

    <!-- Shared loading state -->
    <template v-if="isLoading">
      <AppSkeleton v-for="i in 5" :key="i" class="h-16 mb-3" />
    </template>

    <!-- Shared error state -->
    <AppErrorBanner
      v-else-if="error"
      :message="error"
      @retry="fetchRequests"
    />

    <!-- Employee view -->
    <template v-else-if="isEmployee">
      <AppEmptyState
        v-if="requests.length === 0"
        title="Aucune demande pour le moment"
        description="Créez votre première demande de congé."
      >
        <AppButton class="mt-4" @click="showCreateModal = true">
          Nouvelle demande
        </AppButton>
      </AppEmptyState>

      <LeaveRequestTable
        v-else
        :requests="requests"
      />
    </template>

    <!-- Manager view -->
    <template v-else-if="isManager">
      <!-- Section 1: À valider -->
      <section>
        <h2 class="text-base font-semibold text-gray-800 mb-4">À valider</h2>

        <p v-if="pendingRequests.length === 0" class="text-sm text-gray-500 py-6 text-center">
          Aucune demande en attente de validation.
        </p>

        <LeaveRequestTable
          v-else
          :requests="pendingRequests"
          :show-employee="true"
          :show-actions="true"
          @approve="openApprove"
          @reject="openReject"
        />
      </section>

      <!-- Section 2: Soldes de l'équipe -->
      <section>
        <h2 class="text-base font-semibold text-gray-800 mb-4">Soldes de l'équipe — Congé payé</h2>

        <template v-if="isLoadingTeam">
          <AppSkeleton v-for="i in 3" :key="i" class="h-10 mb-2" />
        </template>

        <AppErrorBanner
          v-else-if="teamError"
          :message="teamError"
          @retry="fetchTeamBalances"
        />

        <p v-else-if="teamBalances.length === 0" class="text-sm text-gray-500 py-4 text-center">
          Aucun solde disponible pour l'équipe.
        </p>

        <template v-else>
          <!-- Mobile: card layout -->
          <ul class="space-y-3 md:hidden">
            <li
              v-for="balance in teamBalances"
              :key="balance.user_id"
              class="bg-white border border-gray-200 rounded-lg p-4"
            >
              <p class="font-medium text-gray-900 text-sm mb-3">
                {{ balance.first_name }} {{ balance.last_name }}
              </p>
              <dl class="grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <dt class="text-xs text-gray-500 mb-0.5">Acquis</dt>
                  <dd class="font-medium text-gray-700">{{ balance.allocated_days ?? '—' }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-gray-500 mb-0.5">Utilisés</dt>
                  <dd class="font-medium text-gray-700">{{ balance.used_days ?? '—' }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-gray-500 mb-0.5">Restants</dt>
                  <dd class="font-medium" :class="remainingClass(balance)">
                    {{ remainingDays(balance) ?? '—' }}
                  </dd>
                </div>
              </dl>
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
                  <th scope="col" class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jours acquis
                  </th>
                  <th scope="col" class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jours utilisés
                  </th>
                  <th scope="col" class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jours restants
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-100">
                <tr v-for="balance in teamBalances" :key="balance.user_id" class="hover:bg-gray-50">
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {{ balance.first_name }} {{ balance.last_name }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                    {{ balance.allocated_days ?? '—' }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                    {{ balance.used_days ?? '—' }}
                  </td>
                  <td
                    class="px-4 py-3 whitespace-nowrap text-sm font-medium text-right"
                    :class="remainingClass(balance)"
                  >
                    {{ remainingDays(balance) ?? '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>

      <!-- Section 3: Historique équipe -->
      <section>
        <h2 class="text-base font-semibold text-gray-800 mb-4">Historique équipe</h2>

        <AppEmptyState
          v-if="requests.length === 0"
          title="Aucune demande dans l'historique"
        />

        <LeaveRequestTable
          v-else
          :requests="requests"
          :show-employee="true"
        />
      </section>

      <!-- Confirmation modal -->
      <AppConfirmModal
        v-if="confirmAction"
        :title="confirmAction.type === 'approve'
          ? `Approuver la demande de ${confirmAction.employeeName} ?`
          : `Refuser la demande de ${confirmAction.employeeName} ?`"
        :description="`Du ${formatDate(confirmAction.startDate)} au ${formatDate(confirmAction.endDate)}`"
        :confirm-label="confirmAction.type === 'approve' ? 'Approuver' : 'Refuser'"
        @confirm="confirmAction.type === 'approve' ? handleApprove() : handleReject()"
        @cancel="confirmAction = null"
      />
    </template>

    <!-- Admin view -->
    <template v-else-if="isAdmin">
      <LeaveAdminView />
    </template>

    <!-- Employee create modal -->
    <LeaveRequestForm
      v-if="showCreateModal"
      :leave-types="leaveTypes"
      @close="showCreateModal = false"
      @created="handleCreated"
    />
  </div>
</template>
