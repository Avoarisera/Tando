<script setup lang="ts">
definePageMeta({ layout: 'private' })

const { isManager, isAdmin, loadProfile } = useCurrentUser()
const { events, isLoading, error, fetchEvents } = useCalendar()
const { teams, fetchTeams } = useTeams()

const currentMonth = ref(new Date())
const selectedTeamId = ref<string | 'all'>('all')

const _now = new Date()
const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`

const absentToday = computed(() =>
  events.value.filter(e =>
    e.status === 'approved'
    && e.startDate <= today
    && e.endDate >= today,
  ),
)

const filteredEvents = computed(() => {
  if (!isAdmin.value || selectedTeamId.value === 'all') return events.value
  return events.value.filter(e => e.teamId === selectedTeamId.value)
})

function prevMonth() {
  currentMonth.value = new Date(
    currentMonth.value.getFullYear(),
    currentMonth.value.getMonth() - 1,
    1,
  )
}

function nextMonth() {
  currentMonth.value = new Date(
    currentMonth.value.getFullYear(),
    currentMonth.value.getMonth() + 1,
    1,
  )
}

onMounted(async () => {
  await loadProfile()
  await fetchEvents()
  if (isAdmin.value) {
    await fetchTeams()
  }
})
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- Page header -->
    <h1 class="text-xl font-semibold text-gray-900">Calendrier</h1>

    <!-- Loading -->
    <template v-if="isLoading">
      <AppSkeleton class="h-8 w-48 mb-4" />
      <AppSkeleton class="h-96" />
    </template>

    <!-- Error -->
    <AppErrorBanner
      v-else-if="error"
      :message="error"
      @retry="fetchEvents"
    />

    <!-- Content -->
    <template v-else>
      <!-- Manager: Absents aujourd'hui -->
      <div v-if="isManager" class="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <h3 class="font-medium text-amber-900 mb-2">Absents aujourd'hui</h3>
        <p v-if="absentToday.length === 0" class="text-sm text-amber-700">
          Aucune absence aujourd'hui.
        </p>
        <ul v-else class="text-sm text-amber-800 space-y-1">
          <li v-for="e in absentToday" :key="e.id">
            {{ e.employeeName }} — {{ e.leaveTypeName }}
          </li>
        </ul>
      </div>

      <!-- Admin: team filter -->
      <div v-if="isAdmin && teams.length > 0" class="flex items-center gap-3">
        <label for="team-filter" class="text-sm font-medium text-gray-700">
          Filtrer par équipe
        </label>
        <select
          id="team-filter"
          v-model="selectedTeamId"
          class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary"
        >
          <option value="all">Toutes les équipes</option>
          <option v-for="team in teams" :key="team.id" :value="team.id">
            {{ team.name }}
          </option>
        </select>
      </div>

      <!-- Calendar grid (handles empty months internally) -->
      <CalendarGrid
        :events="filteredEvents"
        :current-month="currentMonth"
        @prev-month="prevMonth"
        @next-month="nextMonth"
      />
    </template>
  </div>
</template>
