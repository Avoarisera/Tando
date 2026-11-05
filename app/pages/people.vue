<script setup lang="ts">
definePageMeta({ titleKey: 'nav.people', middleware: 'admin-only', layout: 'private' })

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const supabase = useSupabaseClient()
const { teams, fetchTeams } = useTeams()
const { snapshot, fetchSnapshot } = useDashboard()

interface Person { id: string, first_name: string, last_name: string, role: 'employee' | 'manager' | 'admin', team_id: string | null, joined_at: string }
const people = ref<Person[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

async function load() {
  isLoading.value = true
  error.value = null
  try {
    const [{ data, error: e }] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, role, team_id, joined_at').order('last_name'),
      fetchTeams(),
      fetchSnapshot(),
    ])
    if (e) throw e
    people.value = (data ?? []) as Person[]
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    isLoading.value = false
  }
}
onMounted(load)

const tab = ref<'people' | 'teams'>('people')
const tabs = computed(() => [
  { id: 'people', label: t('people.tabPeople'), count: people.value.length },
  { id: 'teams', label: t('people.tabTeams'), count: teams.value.length },
])

const search = ref('')
const teamFilter = ref('all')
const roleFilter = ref('all')
const teamOptions = computed(() => [{ value: 'all', label: t('calendar.allTeams') }, ...teams.value.map(x => ({ value: x.id, label: x.name }))])
const roleOptions = computed(() => [{ value: 'all', label: t('people.allRoles') }, ...(['employee', 'manager', 'admin'] as const).map(r => ({ value: r, label: t(`roles.${r}`) }))])
const teamName = (id: string | null) => teams.value.find(x => x.id === id)?.name ?? '—'
const onLeave = (id: string) => snapshot.value?.employees.find(e => e.id === id)

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return people.value.filter(p =>
    (!q || fullName(p).toLowerCase().includes(q))
    && (teamFilter.value === 'all' || p.team_id === teamFilter.value)
    && (roleFilter.value === 'all' || p.role === roleFilter.value))
})
const ROLE_TONE = { employee: 'neutral', manager: 'info', admin: 'indigo' } as const

const teamCards = computed(() => teams.value.map((tm) => {
  const members = people.value.filter(p => p.team_id === tm.id)
  return { ...tm, members, managers: members.filter(m => m.role === 'manager') }
}))
</script>

<template>
  <div class="wb-page wb-stack">
    <WbTabs v-model="tab" :tabs="tabs" :label="t('nav.people')" />
    <WbBanner tone="info">{{ t('people.readOnly') }}</WbBanner>

    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="isLoading && !people.length" variant="table" :count="6" />

    <template v-else-if="tab === 'people'">
      <div class="wb-fb">
        <div class="wb-fb-s"><WbInput v-model="search" icon="search" type="search" :aria-label="t('approvals.search')" :placeholder="t('approvals.search')" /></div>
        <div class="wb-fb-c">
          <WbSelect v-model="teamFilter" :options="teamOptions" :aria-label="t('calendar.team')" />
          <WbSelect v-model="roleFilter" :options="roleOptions" :aria-label="t('people.role')" />
        </div>
      </div>
      <p v-if="!rows.length" class="wb-card wb-card-b wb-mut">{{ t('people.noMatch') }}</p>
      <WbCard v-else :pad="false">
        <div class="wb-scroll wb-dt">
          <table>
            <caption class="wb-sr">{{ t('people.tabPeople') }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ t('dashboard.csv.person') }}</th>
                <th scope="col">{{ t('calendar.team') }}</th>
                <th scope="col">{{ t('people.role') }}</th>
                <th scope="col">{{ t('people.joined') }}</th>
                <th scope="col">{{ t('rules.status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in rows" :key="p.id" :data-person="fullName(p)">
                <td><span class="wb-cp"><WbAvatar :name="fullName(p)" :size="32" /><b class="small">{{ fullName(p) }}</b></span></td>
                <td>{{ teamName(p.team_id) }}</td>
                <td><WbBadge :tone="ROLE_TONE[p.role]">{{ t(`roles.${p.role}`) }}</WbBadge></td>
                <td class="wb-num">{{ fmtDate(p.joined_at, tag, { day: '2-digit', month: '2-digit', year: 'numeric' }) }}</td>
                <td>
                  <WbBadge v-if="onLeave(p.id)?.on_leave" tone="warning" icon="tree-palm">{{ onLeave(p.id)?.leave_type_name ?? t('people.away') }}</WbBadge>
                  <WbBadge v-else-if="p.role !== 'admin'" tone="success" icon="check">{{ t('people.present') }}</WbBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </WbCard>
    </template>

    <div v-else class="wb-grid wb-cols-3">
      <WbCard v-for="tm in teamCards" :key="tm.id" :title="tm.name" :subtitle="t('people.members', { n: tm.members.length }, tm.members.length)">
        <div class="wb-stack-s">
          <span class="wb-avg"><WbAvatar v-for="m in tm.members.slice(0, 6)" :key="m.id" :name="fullName(m)" :size="28" /></span>
          <p v-if="tm.managers.length" class="small wb-mut2">{{ t('people.managedBy', { who: tm.managers.map(fullName).join(', ') }) }}</p>
          <p v-else class="small wb-c-warning">{{ t('people.noManager') }}</p>
        </div>
      </WbCard>
    </div>
  </div>
</template>
