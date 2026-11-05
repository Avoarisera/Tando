<script setup lang="ts">
definePageMeta({ titleKey: 'nav.people', middleware: 'admin-only', layout: 'private' })

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const supabase = useSupabaseClient()
const { teams, fetchTeams } = useTeams()
const { snapshot, fetchSnapshot } = useDashboard()

type Role = 'employee' | 'manager' | 'admin'
interface Person { id: string, first_name: string, last_name: string, role: Role, team_id: string | null, joined_at: string, country: string }
const people = ref<Person[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

async function load() {
  isLoading.value = true
  error.value = null
  try {
    const [{ data, error: e }] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, role, team_id, joined_at, country').order('last_name'),
      loadDefaultCountry(),
      fetchTeams(true),
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
const toast = useToast()
const countries = computed(() => countryOptions(tag.value))
const roleChoices = computed(() => (['employee', 'manager', 'admin'] as const).map(r => ({ value: r, label: t(`roles.${r}`) })))
const teamChoices = computed(() => [{ value: '', label: t('r8a.people.noTeam') }, ...teams.value.map(x => ({ value: x.id, label: x.name }))])

// Default country for invitations comes from the company settings
const defaultCountry = ref('FR')
async function loadDefaultCountry() {
  const { data } = await supabase.from('company_settings').select('default_country').maybeSingle()
  if (data?.default_country) defaultCountry.value = data.default_country
}

// ── Invite / edit (one side panel) ───────────────────────────────────────────
interface PersonForm { email: string, first_name: string, last_name: string, role: Role, team_id: string, country: string, joined_at: string }
const panel = ref<'invite' | 'edit' | null>(null)
const editingId = ref<string | null>(null)
const form = reactive<PersonForm>({ email: '', first_name: '', last_name: '', role: 'employee', team_id: '', country: 'FR', joined_at: '' })
const formError = ref<string | null>(null)
const saving = ref(false)

function openInvite() {
  Object.assign(form, { email: '', first_name: '', last_name: '', role: 'employee', team_id: '', country: defaultCountry.value, joined_at: todayIso() })
  editingId.value = null
  formError.value = null
  panel.value = 'invite'
}
function openEdit(p: Person) {
  Object.assign(form, { email: '', first_name: p.first_name, last_name: p.last_name, role: p.role, team_id: p.team_id ?? '', country: p.country, joined_at: p.joined_at })
  editingId.value = p.id
  formError.value = null
  panel.value = 'edit'
}

async function savePerson() {
  formError.value = null
  if (!form.first_name.trim() || !form.last_name.trim() || (panel.value === 'invite' && !form.email.trim())) {
    formError.value = t('r8a.people.required')
    return
  }
  saving.value = true
  try {
    if (panel.value === 'invite') {
      const { data: { session } } = await supabase.auth.getSession()
      await $fetch('/api/people/invite', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: { ...form, team_id: form.team_id || null },
      })
      toast.add(t('r8a.people.invited', { email: form.email.trim() }))
    }
    else {
      const { error: e } = await supabase.rpc('admin_update_profile', {
        p_id: editingId.value!, p_first_name: form.first_name, p_last_name: form.last_name, p_role: form.role,
        // NULL is a valid value (no team); the generated types only know strings
        p_team_id: (form.team_id || null) as unknown as string, p_country: form.country, p_joined_at: (form.joined_at || null) as unknown as string,
      })
      if (e) throw new Error(e.message)
      toast.add(t('r8a.people.saved'))
    }
    panel.value = null
    await load()
  }
  catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    formError.value = status === 409 ? t('r8a.people.exists') : e instanceof Error ? (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? e.message : t('rules.saveError')
  }
  finally {
    saving.value = false
  }
}

// ── Teams: name, manager and members in one panel ───────────────────────────
const teamPanel = ref(false)
const teamId = ref<string | null>(null)
const teamNameDraft = ref('')
const teamManager = ref('')
const teamMembers = ref<string[]>([])
const teamError = ref<string | null>(null)
const confirmDelete = ref(false)
const memberSearch = ref('')
/** Admins validate every team: they are never members */
const assignable = computed(() => people.value.filter(p => p.role !== 'admin'))
const memberList = computed(() => {
  const q = memberSearch.value.trim().toLowerCase()
  return assignable.value
    .filter(p => !q || fullName(p).toLowerCase().includes(q))
    .sort((a, b) => Number(teamMembers.value.includes(b.id)) - Number(teamMembers.value.includes(a.id)) || fullName(a).localeCompare(fullName(b)))
})
const managerChoices = computed(() => [
  { value: '', label: t('teams.noManager') },
  ...assignable.value.filter(p => teamMembers.value.includes(p.id)).map(p => ({ value: p.id, label: fullName(p) })),
])
function otherTeamOf(p: Person) {
  return p.team_id && p.team_id !== teamId.value ? teamName(p.team_id) : ''
}
function openTeam(id: string | null, name = '') {
  teamId.value = id
  teamNameDraft.value = name
  teamMembers.value = id ? people.value.filter(p => p.team_id === id && p.role !== 'admin').map(p => p.id) : []
  teamManager.value = id ? people.value.find(p => p.team_id === id && p.role === 'manager')?.id ?? '' : ''
  teamError.value = null
  memberSearch.value = ''
  confirmDelete.value = false
  teamPanel.value = true
}
function toggleMember(id: string, on: boolean) {
  teamMembers.value = on ? [...new Set([...teamMembers.value, id])] : teamMembers.value.filter(x => x !== id)
  if (!on && teamManager.value === id) teamManager.value = ''
}
async function saveTeam() {
  teamError.value = null
  if (!teamNameDraft.value.trim()) {
    teamError.value = t('teams.nameRequired')
    return
  }
  saving.value = true
  const { error: e } = await supabase.rpc('admin_save_team', {
    p_id: teamId.value, p_name: teamNameDraft.value, p_manager_id: teamManager.value || null, p_member_ids: teamMembers.value,
  })
  saving.value = false
  if (e) {
    teamError.value = e.message
    return
  }
  toast.add(teamId.value ? t('teams.saved') : t('r8a.people.teamCreated'))
  teamPanel.value = false
  await Promise.all([fetchTeams(true), load()])
}
async function deleteTeam() {
  if (!teamId.value) return
  saving.value = true
  const { error: e } = await supabase.rpc('admin_delete_team', { p_id: teamId.value })
  saving.value = false
  if (e) {
    teamError.value = e.message
    return
  }
  toast.add(t('teams.deleted'))
  teamPanel.value = false
  await Promise.all([fetchTeams(true), load()])
}

const teamCards = computed(() => teams.value.map((tm) => {
  const members = people.value.filter(p => p.team_id === tm.id)
  return { ...tm, members, managers: members.filter(m => m.role === 'manager') }
}))

// Tables: 20 rows per page, count and pages under the table
const rowsPager = usePagination(computed(() => rows.value))
const teamsPager = usePagination(computed(() => teamCards.value))
</script>

<template>
  <div class="wb-page wb-stack">
    <WbTabs v-model="tab" :tabs="tabs" :label="t('nav.people')" />

    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="isLoading && !people.length" variant="table" :count="6" />

    <template v-else-if="tab === 'people'">
      <div class="wb-adm-bar">
        <div class="wb-adm-f">
          <div class="wb-fb-s"><WbInput v-model="search" icon="search" type="search" :aria-label="t('approvals.search')" :placeholder="t('approvals.search')" /></div>
          <WbSelect v-model="teamFilter" :options="teamOptions" :aria-label="t('calendar.team')" />
          <WbSelect v-model="roleFilter" :options="roleOptions" :aria-label="t('people.role')" />
        </div>
        <WbButton size="sm" icon="user-plus" aria-haspopup="dialog" data-action="invite-person" @click="openInvite">{{ t('r8a.people.invite') }}</WbButton>
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
                <th scope="col">{{ t('r8a.people.country') }}</th>
                <th scope="col">{{ t('people.joined') }}</th>
                <th scope="col">{{ t('rules.status') }}</th>
                <th scope="col" class="is-r">{{ t('rules.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in rowsPager.items.value" :key="p.id" :data-person="fullName(p)">
                <td><span class="wb-cp"><WbAvatar :name="fullName(p)" :size="28" /><b class="small">{{ fullName(p) }}</b></span></td>
                <td>{{ teamName(p.team_id) }}</td>
                <td><WbBadge :tone="ROLE_TONE[p.role]">{{ t(`roles.${p.role}`) }}</WbBadge></td>
                <td>{{ countryName(p.country, tag) }}</td>
                <td class="wb-num">{{ fmtDate(p.joined_at, tag, { day: '2-digit', month: '2-digit', year: 'numeric' }) }}</td>
                <td>
                  <WbBadge v-if="onLeave(p.id)?.on_leave" tone="warning" icon="tree-palm">{{ onLeave(p.id)?.leave_type_name ?? t('people.away') }}</WbBadge>
                  <WbBadge v-else-if="p.role !== 'admin'" tone="success" icon="check">{{ t('people.present') }}</WbBadge>
                </td>
                <td class="is-r"><WbButton variant="ghost" size="sm" icon="pencil" data-action="edit-person" @click="openEdit(p)">{{ t('rules.edit') }}</WbButton></td>
              </tr>
            </tbody>
          </table>
        </div>
        <WbTableFooter v-model:page="rowsPager.page.value" :total="rowsPager.total.value" :page-size="rowsPager.pageSize.value" />
      </WbCard>
    </template>

    <template v-else>
      <div class="wb-adm-bar wb-adm-bar-end">
        <WbButton size="sm" icon="plus" aria-haspopup="dialog" data-action="new-team" @click="openTeam(null)">{{ t('r8a.people.newTeam') }}</WbButton>
      </div>
      <WbCard :pad="false">
        <div class="wb-scroll wb-dt">
          <table>
            <caption class="wb-sr">{{ t('people.tabTeams') }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ t('calendar.team') }}</th>
                <th scope="col">{{ t('v2.members') }}</th>
                <th scope="col">{{ t('v2.manager') }}</th>
                <th scope="col" class="is-r">{{ t('rules.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tm in teamsPager.items.value" :key="tm.id" :data-team="tm.name">
                <td><b class="small">{{ tm.name }}</b><br><span class="caption wb-mut">{{ t('people.members', { n: tm.members.length }, tm.members.length) }}</span></td>
                <td><span class="wb-avg"><WbAvatar v-for="m in tm.members.slice(0, 8)" :key="m.id" :name="fullName(m)" :size="26" /></span></td>
                <td>
                  <span v-if="tm.managers.length" class="small">{{ t('people.managedBy', { who: tm.managers.map(fullName).join(', ') }) }}</span>
                  <WbBadge v-else tone="warning" icon="triangle-alert" size="sm">{{ t('people.noManager') }}</WbBadge>
                </td>
                <td class="is-r"><WbButton variant="ghost" size="sm" icon="pencil" data-action="edit-team" @click="openTeam(tm.id, tm.name)">{{ t('rules.edit') }}</WbButton></td>
              </tr>
            </tbody>
          </table>
        </div>
        <WbTableFooter v-model:page="teamsPager.page.value" :total="teamsPager.total.value" :page-size="teamsPager.pageSize.value" />
      </WbCard>
    </template>

    <WbSidePanel
      v-if="panel"
      :title="panel === 'invite' ? t('r8a.people.inviteTitle') : t('r8a.people.editTitle', { name: `${form.first_name} ${form.last_name}` })"
      :subtitle="panel === 'invite' ? t('r8a.people.inviteHint') : undefined"
      @close="panel = null"
    >
      <form class="wb-stack" novalidate @submit.prevent="savePerson">
        <WbBanner v-if="formError" tone="danger">{{ formError }}</WbBanner>
        <WbInput v-if="panel === 'invite'" id="person-email" v-model="form.email" type="email" :label="t('auth.login.email')" required autocomplete="off" />
        <div class="wb-grid wb-cols-2" style="gap: 16px">
          <WbInput id="person-first" v-model="form.first_name" :label="t('r8a.people.firstName')" required />
          <WbInput id="person-last" v-model="form.last_name" :label="t('r8a.people.lastName')" required />
          <WbSelect id="person-role" v-model="form.role" :label="t('people.role')" :options="roleChoices" />
          <WbSelect id="person-team" v-model="form.team_id" :label="t('calendar.team')" :options="teamChoices" />
          <WbSelect id="person-country" v-model="form.country" :label="t('r8a.people.country')" :options="countries" :hint="t('r8a.people.countryHint')" />
          <WbInput id="person-joined" v-model="form.joined_at" type="date" :label="t('people.joined')" />
        </div>
        <div class="wb-panel-f">
          <WbButton type="submit" block size="lg" :loading="saving">{{ panel === 'invite' ? t('r8a.people.send') : t('rules.save') }}</WbButton>
        </div>
      </form>
    </WbSidePanel>

    <WbSidePanel v-if="teamPanel" :title="teamId ? t('teams.editTitle', { name: teamNameDraft }) : t('r8a.people.newTeam')" :subtitle="t('teams.hint')" :width="520" @close="teamPanel = false">
      <form class="wb-stack" novalidate @submit.prevent="saveTeam">
        <WbBanner v-if="teamError" tone="danger">{{ teamError }}</WbBanner>
        <WbInput id="team-name" v-model="teamNameDraft" :label="t('r8a.people.teamName')" maxlength="60" required />

        <fieldset class="wb-tm-f">
          <legend class="wb-label">{{ t('teams.members', { n: teamMembers.length }, teamMembers.length) }}</legend>
          <WbInput v-model="memberSearch" icon="search" type="search" :aria-label="t('approvals.search')" :placeholder="t('approvals.search')" />
          <ul class="wb-tm-list">
            <li v-for="p in memberList" :key="p.id">
              <WbCheckbox :model-value="teamMembers.includes(p.id)" :aria-label="fullName(p)" @update:model-value="(v: boolean) => toggleMember(p.id, v)" />
              <WbAvatar :name="fullName(p)" :size="26" />
              <span class="wb-grow small"><b>{{ fullName(p) }}</b>
                <span v-if="otherTeamOf(p)" :class="teamMembers.includes(p.id) ? 'wb-c-warning' : 'wb-mut2'"> · {{ teamMembers.includes(p.id) ? t('teams.movesFrom', { team: otherTeamOf(p) }) : otherTeamOf(p) }}</span>
              </span>
              <WbBadge size="sm" :tone="ROLE_TONE[p.role]">{{ t(`roles.${p.role}`) }}</WbBadge>
            </li>
            <li v-if="!memberList.length" class="small wb-mut">{{ t('people.noMatch') }}</li>
          </ul>
        </fieldset>

        <WbSelect id="team-manager" v-model="teamManager" :options="managerChoices" :label="t('teams.manager')" :hint="t('teams.managerHint')" />

        <div class="wb-panel-f">
          <WbButton type="submit" block :loading="saving">{{ t('rules.save') }}</WbButton>
          <template v-if="teamId">
            <WbButton v-if="!confirmDelete" variant="ghost" block icon="trash-2" data-action="delete-team" @click="confirmDelete = true">{{ t('teams.delete') }}</WbButton>
            <div v-else class="wb-tm-del">
              <p class="small">{{ t('teams.deleteConfirm', { n: teamMembers.length }, teamMembers.length) }}</p>
              <div class="wb-row" style="gap: 8px">
                <WbButton variant="danger" size="sm" :loading="saving" @click="deleteTeam">{{ t('teams.deleteYes') }}</WbButton>
                <WbButton variant="ghost" size="sm" @click="confirmDelete = false">{{ t('approvals.cancel') }}</WbButton>
              </div>
            </div>
          </template>
        </div>
      </form>
    </WbSidePanel>
  </div>
</template>

<style scoped>
/* Toolbar row: filters on the left, primary action on the right */
.wb-adm-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-3); }
.wb-adm-f { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; }
.wb-adm-bar :deep(.wb-btn) { margin: 0; }
.wb-adm-bar-end { justify-content: flex-end; }
/* Team panel */
.wb-tm-f { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.wb-tm-list { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-md); }
.wb-tm-list li { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); }
.wb-tm-list li + li { border-top: 1px solid var(--border); }
.wb-tm-del { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--danger-border); background: var(--danger-tint); border-radius: var(--radius-md); }
.wb-tm-del :deep(.wb-btn) { margin: 0; }
</style>
