<script setup lang="ts">
import type { Workspace, TeamRef } from '~/composables/useLinearWorkspace'

definePageMeta({ titleKey: 'nav.velocity', layout: 'private', middleware: 'admin-only' })

const {
  workspaces, isLoading, error,
  fetchWorkspaces, addWorkspace, deleteWorkspace,
  fetchLinearTeams, saveTeamSelection, triggerSync,
} = useLinearWorkspace()
const toast = useToast()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

// ── Per-workspace sync progress ───────────────────────────────────────────
function wsSyncing(ws: Workspace): boolean {
  return ws.sync_status === 'running'
}
function syncPct(ws: Workspace): number {
  if (ws.sync_status === 'done') return 100
  if (!ws.sync_teams_total) return 0
  return Math.round((ws.sync_teams_done / ws.sync_teams_total) * 100)
}

// ── Add workspace wizard ──────────────────────────────────────────────────
type Step = 'form' | 'teams'
const step = ref<Step | null>(null)
const formName = ref('')
const formApiKey = ref('')
const formError = ref<string | null>(null)
const isSubmitting = ref(false)

// holds the newly created workspace during step 2
const pendingWorkspace = ref<Workspace | null>(null)

// ── Team selection (shared: add + edit) ──────────────────────────────────
const availableTeams = ref<TeamRef[]>([])
const selectedIds = ref(new Set<string>())
const teamsLoading = ref(false)
const teamsError = ref<string | null>(null)
const editingWorkspace = ref<Workspace | null>(null)

// ── Delete ────────────────────────────────────────────────────────────────
const pendingDelete = ref<Workspace | null>(null)

// Teams of every workspace, so a team is one click away from this page (feedback 05/11)
const supabase = useSupabaseClient()
const wsTeams = ref<Record<string, { id: string, name: string }[]>>({})
async function loadWsTeams() {
  const { data } = await supabase.from('linear_teams').select('id, name, workspace_id').order('name')
  const map: Record<string, { id: string, name: string }[]> = {}
  for (const r of (data ?? []) as { id: string, name: string | null, workspace_id: string }[]) {
    (map[r.workspace_id] ??= []).push({ id: r.id, name: r.name ?? r.id })
  }
  wsTeams.value = map
}
function teamsOf(ws: Workspace) {
  const all = wsTeams.value[ws.id] ?? []
  const picked = ws.selected_teams?.map(x => x.id)
  if (all.length) return picked?.length ? all.filter(x => picked.includes(x.id)) : all
  return (ws.selected_teams ?? []).map(x => ({ id: x.id, name: x.name }))
}
// ── TND-24: overview of every team, one click to a team ────────────────────
interface TeamOverview { id: string, name: string, workspaceId: string, workspaceName: string, thisMonth: number, lastMonth: number, lastMonthToDate: number, monthly: { month: string, count: number }[], cycleMedianHours: number | null, blocked: number }
const overview = ref<TeamOverview[]>([])
const overviewLoading = ref(false)
const overviewError = ref<string | null>(null)
const teamSearch = ref('')
const lastTeam = ref<string | null>(null)
async function loadOverview(fresh = false) {
  overviewLoading.value = true
  overviewError.value = null
  try { overview.value = await $fetch<TeamOverview[]>('/api/teams-overview', { query: fresh ? { fresh: '1' } : {} }) }
  catch (e) { overviewError.value = errorMessage(e) }
  finally { overviewLoading.value = false }
}
const multiWorkspace = computed(() => new Set(overview.value.map(x => x.workspaceId)).size > 1)
// blocked teams first, then the last one opened, then by name
const teamCards = computed(() => overview.value
  .filter(x => textMatch(`${x.name} ${x.workspaceName}`, teamSearch.value))
  .sort((a, b) => Number(b.blocked > 0) - Number(a.blocked > 0) || Number(b.id === lastTeam.value) - Number(a.id === lastTeam.value) || a.name.localeCompare(b.name)))
const teamLink = (x: TeamOverview) => ({ path: `/velocite/teams/${x.id}`, query: { workspaceId: x.workspaceId, name: x.name } })
// compared with the same days of the previous month (1st → today), not the whole month
function delta(x: TeamOverview) {
  if (!x.lastMonthToDate) return null
  return Math.round(((x.thisMonth - x.lastMonthToDate) / x.lastMonthToDate) * 100)
}
/** tiny 6-month line, as an SVG path in a 100×28 box */
function spark(x: TeamOverview) {
  const vals = x.monthly.map(m => m.count)
  const max = Math.max(1, ...vals)
  return vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (vals.length - 1)) * 100},${26 - (v / max) * 24}`).join(' ')
}
// workspace management, folded under the teams (open when something needs attention)
const showWs = ref(false)
const wsAttention = computed(() => workspaces.value.some(ws => ws.sync_status === 'error' || wsSyncing(ws)))
const wsBadge = computed(() => (workspaces.value.some(ws => ws.sync_status === 'error')
  ? { tone: 'danger' as const, label: t('velocityA.status.error') }
  : workspaces.value.some(ws => wsSyncing(ws)) ? { tone: 'info' as const, label: t('velocityA.status.running') } : { tone: 'success' as const, label: t('velocityA.status.ok') }))

const route = useRoute()
onMounted(async () => {
  lastTeam.value = typeof localStorage === 'undefined' ? null : localStorage.getItem('wb_vel_last')
  await Promise.all([fetchWorkspaces(), loadOverview(), loadWsTeams().catch(() => undefined)])
  if (wsAttention.value) showWs.value = true
  // a single team: open it straight away (the overview stays reachable with ?all=1)
  if (overview.value.length === 1 && route.query.all !== '1') await navigateTo(teamLink(overview.value[0]!), { replace: true })
})

// ─── Step 1 : create workspace ───────────────────────────────────────────
async function handleAddWorkspace() {
  if (!formName.value.trim() || !formApiKey.value.trim()) {
    formError.value = t('velocityA.panel.required')
    return
  }
  isSubmitting.value = true
  formError.value = null
  try {
    const ws = await addWorkspace(formName.value.trim(), formApiKey.value.trim())
    pendingWorkspace.value = ws
    formName.value = ''
    formApiKey.value = ''
    step.value = 'teams'
    await loadTeams(ws.id, [])
  }
  catch (e) {
    formError.value = e instanceof Error ? e.message : t('velocityA.unknownError')
  }
  finally {
    isSubmitting.value = false
  }
}

// ─── Open team editor (add wizard or existing workspace) ─────────────────
async function openTeamEditor(ws: Workspace) {
  editingWorkspace.value = ws
  await loadTeams(ws.id, ws.selected_teams ? [...ws.selected_teams] : [])
}

async function loadTeams(workspaceId: string, preSelected: TeamRef[]) {
  teamsLoading.value = true
  teamsError.value = null
  availableTeams.value = []
  selectedIds.value = new Set(preSelected.map(t => t.id))
  try {
    availableTeams.value = await fetchLinearTeams(workspaceId)
    // If no prior selection, select all by default
    if (!preSelected.length) {
      selectedIds.value = new Set(availableTeams.value.map(t => t.id))
    }
  }
  catch (e) {
    teamsError.value = e instanceof Error ? e.message : t('velocityA.panel.teamsError')
  }
  finally {
    teamsLoading.value = false
  }
}

function toggleTeam(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    if (next.size > 1) next.delete(id)
  }
  else {
    next.add(id)
  }
  selectedIds.value = next
}

function toggleAll() {
  if (selectedIds.value.size === availableTeams.value.length) {
    // keep at least one
    selectedIds.value = new Set([availableTeams.value[0]!.id])
  }
  else {
    selectedIds.value = new Set(availableTeams.value.map(t => t.id))
  }
}

// ─── Confirm team selection ───────────────────────────────────────────────
async function confirmTeams() {
  const wsId = (pendingWorkspace.value ?? editingWorkspace.value)?.id
  if (!wsId) return
  const teams = availableTeams.value.filter(t => selectedIds.value.has(t.id))

  isSubmitting.value = true
  try {
    await saveTeamSelection(wsId, teams)

    if (pendingWorkspace.value) {
      // First setup — also trigger initial sync
      toast.add(t('velocityA.toast.syncStarted', { name: pendingWorkspace.value.name }))
      triggerSync(wsId).then(() => toast.add(t('velocityA.toast.syncFinished'))).catch(() => {})
      pendingWorkspace.value = null
      step.value = null
    }
    else {
      toast.add(t('velocityA.toast.teamsSaved'))
      editingWorkspace.value = null
    }
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : t('velocityA.toast.saveError'), 'error')
  }
  finally {
    isSubmitting.value = false
  }
}

function cancelTeams() {
  pendingWorkspace.value = null
  editingWorkspace.value = null
  step.value = null
  availableTeams.value = []
  selectedIds.value = new Set()
}

// ─── Sync ────────────────────────────────────────────────────────────────
async function handleSync(ws: Workspace) {
  try {
    await triggerSync(ws.id)
    toast.add(t('velocityA.toast.synced', { name: ws.name }))
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : t('velocityA.toast.syncError'), 'error')
  }
}

async function handleFullSync(ws: Workspace) {
  try {
    await triggerSync(ws.id, true)
    toast.add(t('velocityA.toast.fullSynced', { name: ws.name }))
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : t('velocityA.toast.syncError'), 'error')
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────
async function handleDelete() {
  if (!pendingDelete.value) return
  try {
    await deleteWorkspace(pendingDelete.value.id)
    toast.add(t('velocityA.toast.deleted', { name: pendingDelete.value.name }))
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : t('velocityA.toast.deleteError'), 'error')
  }
  finally {
    pendingDelete.value = null
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return t('velocityA.never')
  return new Intl.DateTimeFormat(tag.value, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

// ── Presentation helpers ──────────────────────────────────────────────────
const deleting = ref(false)
async function confirmDelete() {
  deleting.value = true
  try {
    await handleDelete()
  }
  finally {
    deleting.value = false
  }
}

const panelOpen = computed(() => step.value !== null || editingWorkspace.value !== null)
const panelTitle = computed(() => (editingWorkspace.value && !pendingWorkspace.value
  ? t('velocityA.panel.editTitle', { name: editingWorkspace.value.name })
  : t('velocityA.panel.connectTitle')))
const panelSubtitle = computed(() => (editingWorkspace.value && !pendingWorkspace.value
  ? t('velocityA.panel.editSubtitle')
  : t('velocityA.panel.stepOf', { n: step.value === 'teams' ? 2 : 1 })))
const wizardSteps = computed(() => [
  { label: t('velocityA.panel.step1'), state: step.value === 'teams' ? 'done' as const : 'wait' as const },
  { label: t('velocityA.panel.step2'), state: step.value === 'teams' ? 'wait' as const : 'todo' as const },
])
function closePanel() {
  if (step.value === 'form') {
    step.value = null
    formError.value = null
    return
  }
  cancelTeams()
}
const allSelected = computed({
  get: () => availableTeams.value.length > 0 && selectedIds.value.size === availableTeams.value.length,
  set: () => toggleAll(),
})
const someSelected = computed(() => selectedIds.value.size > 0 && selectedIds.value.size < availableTeams.value.length)

function statusBadge(ws: Workspace): { tone: 'success' | 'info' | 'danger' | 'neutral', icon: string, label: string } {
  if (ws.sync_status === 'running') return { tone: 'info', icon: 'refresh-cw', label: t('velocityA.status.running') }
  if (ws.sync_status === 'error') return { tone: 'danger', icon: 'x', label: t('velocityA.status.error') }
  if (ws.last_synced_at || ws.sync_status === 'done') return { tone: 'success', icon: 'check', label: t('velocityA.status.ok') }
  return { tone: 'neutral', icon: 'clock', label: t('velocityA.status.idle') }
}
function cardSubtitle(ws: Workspace): string {
  const parts = [t('velocityA.lastSync', { date: formatDate(ws.last_synced_at) })]
  if (ws.sync_issues_done) parts.push(t('velocityA.tickets', { n: ws.sync_issues_done }, ws.sync_issues_done))
  return parts.join(' · ')
}
</script>

<template>
  <div class="wb-page wb-stack">
    <div class="wb-row-b wb-wrap">
      <p class="wb-mut2">{{ workspaces.length ? t('tnd24.intro') : t('velocityA.intro') }}</p>
      <div class="wb-row wb-wrap" style="gap: 8px">
        <WbButton v-if="workspaces.length" variant="secondary" size="sm" icon="link" :aria-expanded="showWs" data-action="toggle-ws" @click="showWs = !showWs">
          {{ t('tnd24.workspaces') }} <WbBadge :tone="wsBadge.tone" size="sm">{{ wsBadge.label }}</WbBadge>
        </WbButton>
        <WbButton v-if="!panelOpen" size="sm" icon="plus" aria-haspopup="dialog" @click="step = 'form'">{{ t('velocityA.connect') }}</WbButton>
      </div>
    </div>

    <WbErrorState v-if="error" :message="readableApiError(error)" @retry="fetchWorkspaces" />
    <WbSkeleton v-else-if="isLoading && !workspaces.length" :count="2" />
    <div v-else-if="workspaces.length === 0" class="wb-card">
      <WbEmptyState art="link" :title="t('velocityA.emptyTitle')">
        {{ t('velocityA.emptyText') }}
        <template #action>
          <WbButton icon="plus" aria-haspopup="dialog" @click="step = 'form'">{{ t('velocityA.connect') }}</WbButton>
        </template>
      </WbEmptyState>
    </div>

    <template v-else>
    <!-- Teams first: one card per team, the whole card opens it -->
    <section class="wb-stack-s" :aria-label="t('tnd24.teams')">
      <div v-if="overview.length > 3" class="wb-fb-s wb-vo-search"><WbInput v-model="teamSearch" icon="search" type="search" :aria-label="t('tnd24.search')" :placeholder="t('tnd24.search')" /></div>
      <WbErrorState v-if="overviewError" :message="overviewError" @retry="loadOverview(true)" />
      <WbSkeleton v-else-if="overviewLoading && !overview.length" variant="metric" :count="3" />
      <p v-else-if="!overview.length" class="wb-card wb-card-b wb-mut">{{ t('tnd24.noTeams') }}</p>
      <div v-else class="wb-vo-grid">
        <NuxtLink v-for="x in teamCards" :key="x.id" :to="teamLink(x)" class="wb-card wb-vo-card" :data-team="x.name">
          <div class="wb-row-b">
            <div class="wb-vo-t">
              <span class="h3">{{ x.name }}</span>
              <span v-if="multiWorkspace" class="caption wb-mut2">{{ x.workspaceName }}</span>
            </div>
            <WbBadge v-if="x.blocked" tone="danger" size="sm" icon="clock">{{ t('tnd24.blocked', { n: x.blocked }, x.blocked) }}</WbBadge>
            <WbBadge v-else-if="x.id === lastTeam" tone="info" size="sm">{{ t('tnd24.recent') }}</WbBadge>
          </div>
          <div class="wb-vo-kpis">
            <div>
              <span class="caption wb-mut2">{{ t('tnd24.thisMonth') }}</span>
              <b class="display wb-num">{{ x.thisMonth }}</b>
              <span v-if="delta(x) !== null" :class="['caption wb-num', (delta(x) ?? 0) >= 0 ? 'wb-c-success' : 'wb-c-danger']">{{ (delta(x) ?? 0) >= 0 ? '+' : '' }}{{ delta(x) }} % {{ t('tnd24.vsLast') }}</span>
              <span v-else class="caption wb-mut2">{{ t('tnd24.lastMonth', { n: x.lastMonth }) }}</span>
            </div>
            <div>
              <span class="caption wb-mut2">{{ t('tnd24.cycle') }}</span>
              <b class="h2 wb-num">{{ velociteDuration(x.cycleMedianHours, tag) }}</b>
            </div>
          </div>
          <svg class="wb-vo-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path :d="spark(x)" /></svg>
          <span class="caption wb-mut2 wb-vo-cta">{{ t('tnd24.open') }} <WbIcon name="chevron-right" :size="14" /></span>
        </NuxtLink>
      </div>
    </section>

    <!-- Linear workspaces: sync and settings, folded by default -->
    <section v-show="showWs" class="wb-stack-s" :aria-label="t('tnd24.workspaces')">
      <h2 class="h3">{{ t('tnd24.workspaces') }}</h2>
    <div class="wb-grid wb-cols-2">
      <WbCard v-for="ws in workspaces" :key="ws.id" :title="ws.name" :subtitle="cardSubtitle(ws)" :data-ws="ws.name">
        <template #action>
          <NuxtLink class="small wb-card-l" :to="`/velocite/workspaces/${ws.id}`">{{ t('velocityA.seeTeams') }}</NuxtLink>
        </template>
        <div class="wb-stack-s">
          <WbBanner v-if="ws.sync_status === 'error'" tone="danger" :title="t('velocityA.syncFailedTitle')">
            {{ ws.sync_error || t('velocityA.unknownError') }}
            <template #action>
              <WbButton variant="secondary" size="sm" icon="refresh-cw" @click="handleSync(ws)">{{ t('velocityA.retry') }}</WbButton>
            </template>
          </WbBanner>

          <div class="wb-row wb-wrap">
            <WbBadge :tone="statusBadge(ws).tone" :icon="statusBadge(ws).icon">{{ statusBadge(ws).label }}</WbBadge>
            <span v-if="!teamsOf(ws).length" class="small wb-mut">{{ t('velocityA.allTeams') }}</span>
          </div>

          <div v-if="wsSyncing(ws) || ws.sync_status === 'done'" class="wb-stack-s" style="gap: 4px">
            <div
              class="wb-gauge-t"
              role="progressbar"
              :aria-valuenow="syncPct(ws)"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="t('velocityA.status.running')"
            >
              <span :class="ws.sync_status === 'done' ? 'wb-fill-success' : 'wb-fill-info'" :style="{ width: `${wsSyncing(ws) && !ws.sync_teams_total ? 8 : syncPct(ws)}%` }" />
            </div>
            <p class="caption wb-mut2 wb-num" aria-live="polite">
              <template v-if="wsSyncing(ws)">
                {{ ws.sync_teams_total
                  ? t('velocityA.syncing', { pct: syncPct(ws), done: ws.sync_teams_done, total: ws.sync_teams_total, issues: ws.sync_issues_done })
                  : t('velocityA.starting') }}
              </template>
              <template v-else>{{ t('velocityA.syncDone', { n: ws.sync_issues_done }) }}</template>
            </p>
          </div>

          <div class="wb-row wb-wrap">
            <WbButton size="sm" icon="refresh-cw" :loading="wsSyncing(ws)" @click="handleSync(ws)">{{ t('velocityA.sync') }}</WbButton>
            <WbButton size="sm" variant="secondary" :disabled="wsSyncing(ws)" @click="handleFullSync(ws)">{{ t('velocityA.fullSync') }}</WbButton>
            <WbButton size="sm" variant="secondary" aria-haspopup="dialog" @click="openTeamEditor(ws)">{{ t('velocityA.manageTeams') }}</WbButton>
            <WbButton size="sm" variant="ghost" icon="trash-2" @click="pendingDelete = ws">{{ t('velocityA.delete') }}</WbButton>
          </div>
        </div>
      </WbCard>
    </div>
    </section>
    </template>

    <!-- Connect wizard (step 1 → 2) and team editor -->
    <WbSidePanel v-if="panelOpen" :title="panelTitle" :subtitle="panelSubtitle" :width="560" @close="closePanel">
      <WbStepper v-if="step" :steps="wizardSteps" compact wait-label="" />

      <form v-if="step === 'form'" class="wb-stack" novalidate autocomplete="off" @submit.prevent="handleAddWorkspace">
        <WbBanner v-if="formError" tone="danger">{{ formError }}</WbBanner>
        <WbInput
          id="ws-name"
          v-model="formName"
          :label="t('velocityA.panel.name')"
          name="linear-workspace-name"
          autocomplete="off"
          data-1p-ignore
          data-lpignore="true"
          :placeholder="t('velocityA.panel.namePlaceholder')"
        />
        <WbInput
          id="ws-key"
          v-model="formApiKey"
          :label="t('velocityA.panel.apiKey')"
          type="password"
          name="linear-api-key"
          autocomplete="new-password"
          data-1p-ignore
          data-lpignore="true"
          placeholder="lin_api_…"
          :hint="t('velocityA.panel.apiKeyHint')"
          class="wb-mono"
        />
        <p class="small wb-mut row-lock"><WbIcon name="lock" :size="14" /> {{ t('velocityA.panel.private') }}</p>
        <div class="wb-panel-f">
          <WbButton type="submit" block :loading="isSubmitting">{{ isSubmitting ? t('velocityA.panel.checking') : t('velocityA.panel.continue') }}</WbButton>
        </div>
      </form>

      <template v-else>
        <h3 class="h3">{{ t('velocityA.panel.teamsTitle') }}</h3>
        <WbSkeleton v-if="teamsLoading" variant="table" :count="4" />
        <WbBanner v-else-if="teamsError" tone="danger">{{ teamsError }}</WbBanner>
        <p v-else-if="!availableTeams.length" class="wb-mut">{{ t('velocityA.panel.noTeams') }}</p>
        <template v-else>
          <div class="wb-stack-s" style="gap: 0">
            <WbCheckbox v-model="allSelected" :indeterminate="someSelected" :label="t('velocityA.panel.selectAll')" />
            <WbCheckbox
              v-for="team in availableTeams"
              :key="team.id"
              :model-value="selectedIds.has(team.id)"
              :label="team.name"
              @update:model-value="toggleTeam(team.id)"
            />
          </div>
          <p class="caption wb-mut wb-num">{{ t('velocityA.panel.selected', { n: selectedIds.size, of: availableTeams.length }) }}</p>
          <div class="wb-panel-f">
            <WbButton block :loading="isSubmitting" :disabled="selectedIds.size === 0" @click="confirmTeams">
              {{ isSubmitting
                ? t('velocityA.panel.saving')
                : step === 'teams' ? t('velocityA.panel.syncN', { n: selectedIds.size }, selectedIds.size) : t('velocityA.panel.save') }}
            </WbButton>
            <WbButton block variant="ghost" @click="cancelTeams">{{ t('velocityA.panel.cancel') }}</WbButton>
          </div>
        </template>
      </template>
    </WbSidePanel>

    <WbModal
      v-if="pendingDelete"
      tone="danger"
      :title="t('velocityA.deleteTitle', { name: pendingDelete.name })"
      :description="t('velocityA.deleteText')"
      @close="pendingDelete = null"
    >
      <template #footer>
        <WbButton variant="secondary" @click="pendingDelete = null">{{ t('velocityA.panel.cancel') }}</WbButton>
        <WbButton variant="danger" :loading="deleting" @click="confirmDelete">{{ t('velocityA.deleteConfirm') }}</WbButton>
      </template>
    </WbModal>
  </div>
</template>

<style scoped>
/* Team overview (TND-24) */
.wb-vo-search { max-width: 360px; }
.wb-vo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: var(--space-3); }
.wb-vo-card { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); color: inherit; text-decoration: none; transition: border-color .15s, box-shadow .15s; }
.wb-vo-card:hover { border-color: var(--brand); box-shadow: var(--shadow-2); }
.wb-vo-card:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.wb-vo-t { display: flex; flex-direction: column; min-width: 0; }
.wb-vo-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.wb-vo-kpis > div { display: flex; flex-direction: column; gap: 2px; }
.wb-vo-spark { width: 100%; height: 32px; }
.wb-vo-spark path { fill: none; stroke: var(--chart-1); stroke-width: 2; vector-effect: non-scaling-stroke; }
.wb-vo-cta { display: inline-flex; align-items: center; gap: 2px; margin-top: auto; color: var(--brand-text); }
/* Teams straight from the workspace card: one click to a team */
.wb-ws-teams { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-2); }
.wb-ws-team { display: flex; align-items: center; gap: var(--space-2); padding: 10px var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--ink); text-decoration: none; font-weight: 600; font-size: 14px; background: var(--surface); }
.wb-ws-team:hover { border-color: var(--brand); background: var(--brand-tint); color: var(--brand-text); }
.wb-ws-team:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.row-lock { display: flex; gap: 6px; align-items: center; }
.wb-fill-info { background: var(--info-solid); }
</style>
