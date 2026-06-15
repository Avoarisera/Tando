<script setup lang="ts">
import type { UserRole } from '~/types/index'

definePageMeta({ layout: 'private' })

const supabase = useSupabaseClient()
const supabaseUser = useSupabaseUser()
const { profile, loadProfile, isAdmin } = useCurrentUser()
const { balances, isLoading: balancesLoading, error: balancesError, fetchBalances } = useLeaveBalances()

const isProfileLoading = ref(!profile.value)
const profileError = ref<string | null>(null)
const teamName = ref<string | null>(null)
const currentYear = new Date().getFullYear()

const roleBadge: Record<UserRole, { label: string; variant: 'red' | 'blue' | 'green' }> = {
  admin:    { label: 'Administrateur', variant: 'red' },
  manager:  { label: 'Manager',        variant: 'blue' },
  employee: { label: 'Employé',        variant: 'green' },
}

const formattedJoinedAt = computed(() => formatDate(profile.value?.joined_at))

async function loadTeamName() {
  if (!profile.value?.team_id) {
    teamName.value = null
    return
  }
  const { data } = await supabase
    .from('teams')
    .select('name')
    .eq('id', profile.value.team_id)
    .single()
  teamName.value = data?.name ?? null
}

async function retryProfile() {
  isProfileLoading.value = true
  profileError.value = null
  try {
    // force reload by resetting cache
    useState('current-profile').value = null
    await loadProfile()
    await loadTeamName()
  } catch (e) {
    profileError.value = e instanceof Error ? e.message : 'Erreur lors du chargement du profil'
  } finally {
    isProfileLoading.value = false
  }
}

onMounted(async () => {
  try {
    await loadProfile()
    await loadTeamName()
    if (!isAdmin.value) {
      await fetchBalances()
    }
  } catch (e) {
    profileError.value = e instanceof Error ? e.message : 'Erreur lors du chargement du profil'
  } finally {
    isProfileLoading.value = false
  }
})
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <h1 class="text-xl font-semibold text-gray-900">Mon profil</h1>

    <!-- Carte profil -->
    <section class="bg-white rounded-lg border border-gray-200 p-6">
      <h2 class="text-base font-medium text-gray-700 mb-4">Informations personnelles</h2>

      <!-- Loading -->
      <template v-if="isProfileLoading">
        <div class="space-y-3">
          <AppSkeleton class="h-5 w-1/2" />
          <AppSkeleton class="h-5 w-2/3" />
          <AppSkeleton class="h-5 w-1/3" />
          <AppSkeleton class="h-5 w-1/2" />
        </div>
      </template>

      <!-- Erreur -->
      <AppErrorBanner
        v-else-if="profileError"
        :message="profileError"
        @retry="retryProfile"
      />

      <!-- Vide (cas théorique : session active mais profil absent) -->
      <AppEmptyState
        v-else-if="!profile"
        title="Profil introuvable"
        description="Votre profil n'a pas pu être chargé. Contactez votre administrateur."
      />

      <!-- Contenu -->
      <dl v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <dt class="text-xs text-gray-500 uppercase tracking-wide">Prénom</dt>
          <dd class="mt-1 text-sm font-medium text-gray-900">{{ profile.first_name }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500 uppercase tracking-wide">Nom</dt>
          <dd class="mt-1 text-sm font-medium text-gray-900">{{ profile.last_name }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500 uppercase tracking-wide">Adresse e-mail</dt>
          <dd class="mt-1 text-sm font-medium text-gray-900">{{ supabaseUser?.email ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500 uppercase tracking-wide">Rôle</dt>
          <dd class="mt-1">
            <AppBadge
              :label="roleBadge[profile.role].label"
              :variant="roleBadge[profile.role].variant"
            />
          </dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500 uppercase tracking-wide">Équipe</dt>
          <dd class="mt-1 text-sm font-medium text-gray-900">
            {{ profile.team_id ? (teamName ?? '—') : 'Toute l\'entreprise' }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-gray-500 uppercase tracking-wide">Date d'entrée</dt>
          <dd class="mt-1 text-sm font-medium text-gray-900">{{ formattedJoinedAt }}</dd>
        </div>
      </dl>
    </section>

    <!-- Soldes de congés (employee + manager uniquement) -->
    <section v-if="!isAdmin" class="bg-white rounded-lg border border-gray-200 p-6">
      <h2 class="text-base font-medium text-gray-700 mb-4">Soldes de congés {{ currentYear }}</h2>

      <!-- Loading -->
      <template v-if="balancesLoading">
        <div class="space-y-3">
          <AppSkeleton v-for="i in 3" :key="i" class="h-14" />
        </div>
      </template>

      <!-- Erreur -->
      <AppErrorBanner
        v-else-if="balancesError"
        :message="balancesError"
        @retry="fetchBalances"
      />

      <!-- Vide -->
      <AppEmptyState
        v-else-if="balances.length === 0"
        title="Aucun solde configuré pour cette année"
        description="Contactez votre administrateur pour configurer vos soldes de congés."
      />

      <!-- Contenu -->
      <ul v-else class="space-y-3">
        <li v-for="balance in balances" :key="balance.id">
          <LeaveBalanceCard
            :type-name="balance.leave_types.name"
            :type-color="balance.leave_types.color"
            :allocated-days="balance.allocated_days"
            :used-days="balance.used_days"
          />
        </li>
      </ul>
    </section>
  </div>
</template>
