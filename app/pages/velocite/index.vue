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

onMounted(fetchWorkspaces)

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
      <p class="wb-mut2">{{ t('velocityA.intro') }}</p>
      <WbButton v-if="!panelOpen" icon="plus" aria-haspopup="dialog" @click="step = 'form'">{{ t('velocityA.connect') }}</WbButton>
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

    <div v-else class="wb-grid wb-cols-2">
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
            <template v-if="ws.selected_teams?.length">
              <WbBadge v-for="tm in ws.selected_teams" :key="tm.id" tone="info">{{ tm.name }}</WbBadge>
            </template>
            <span v-else class="small wb-mut">{{ t('velocityA.allTeams') }}</span>
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
.row-lock { display: flex; gap: 6px; align-items: center; }
.wb-fill-info { background: var(--info-solid); }
</style>
