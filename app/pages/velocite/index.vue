<script setup lang="ts">
import type { Workspace, TeamRef } from '~/composables/useLinearWorkspace'

definePageMeta({ layout: 'private', middleware: 'admin-only' })

const {
  workspaces, isLoading, error, isSyncing,
  fetchWorkspaces, addWorkspace, deleteWorkspace,
  fetchLinearTeams, saveTeamSelection, triggerSync,
} = useLinearWorkspace()
const toast = useToast()

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
    formError.value = 'Le nom et la clé API sont obligatoires.'
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
    formError.value = e instanceof Error ? e.message : 'Erreur inconnue'
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
    teamsError.value = e instanceof Error ? e.message : 'Impossible de récupérer les équipes Linear.'
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
      toast.add(`Synchronisation de « ${pendingWorkspace.value.name} » en cours…`)
      triggerSync(wsId).then(() => toast.add('Synchronisation terminée')).catch(() => {})
      pendingWorkspace.value = null
      step.value = null
    }
    else {
      toast.add('Équipes mises à jour')
      editingWorkspace.value = null
    }
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde', 'error')
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
    toast.add(`Synchronisation de « ${ws.name} » terminée`)
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur de synchronisation', 'error')
  }
}

async function handleFullSync(ws: Workspace) {
  try {
    await triggerSync(ws.id, true)
    toast.add(`Resync complet de « ${ws.name} » terminé`)
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur de synchronisation', 'error')
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────
async function handleDelete() {
  if (!pendingDelete.value) return
  try {
    await deleteWorkspace(pendingDelete.value.id)
    toast.add(`Workspace « ${pendingDelete.value.name} » supprimé`)
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : 'Erreur lors de la suppression', 'error')
  }
  finally {
    pendingDelete.value = null
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="max-w-7xl mx-auto">

    <!-- Header -->
    <div class="flex items-start justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Vélocité Dev</h1>
        <p class="text-sm text-gray-400 mt-1">
          Connectez un workspace
          <span class="inline-flex items-center gap-1 font-medium text-gray-600">
            <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.5 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM0 6.75A.75.75 0 0 1 .75 6h3.5a.75.75 0 0 1 0 1.5H1.5v7h13v-7h-2.75a.75.75 0 0 1 0-1.5h3.5a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75.75H.75A.75.75 0 0 1 0 15.25V6.75Zm9-6.75a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-2.5 5a2.5 2.5 0 0 1 5 0v.5a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5V5Z"/>
            </svg>
            Linear
          </span>
          pour visualiser les métriques de vélocité de vos équipes.
        </p>
      </div>
      <AppButton v-if="!step" @click="step = 'form'">
        + Ajouter un workspace
      </AppButton>
    </div>

    <!-- ── STEP 1 : Add workspace form ── -->
    <div v-if="step === 'form'" class="mb-6 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div class="flex items-center gap-3 mb-5">
        <div class="w-8 h-8 rounded-full bg-brand-primary text-white text-sm font-bold flex items-center justify-center">1</div>
        <div>
          <h2 class="text-base font-semibold text-gray-900">Connecter un workspace Linear</h2>
          <p class="text-xs text-gray-400">Vos données restent privées et chiffrées.</p>
        </div>
      </div>

      <div v-if="formError" class="mb-4 rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
        {{ formError }}
      </div>

      <div class="space-y-4">
        <div>
          <label for="ws-name" class="block text-sm font-medium text-gray-700 mb-1">Nom du workspace</label>
          <input
            id="ws-name"
            v-model="formName"
            type="text"
            placeholder="ex : Acme Engineering"
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent"
          >
        </div>
        <div>
          <label for="ws-key" class="block text-sm font-medium text-gray-700 mb-1">Clé API Linear</label>
          <input
            id="ws-key"
            v-model="formApiKey"
            type="password"
            placeholder="lin_api_..."
            class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent"
            aria-describedby="ws-key-hint"
          >
          <p id="ws-key-hint" class="mt-1.5 text-xs text-gray-400">
            Dans Linear : <span class="font-medium text-gray-600">Settings → Account → Security & Access → Personal API Keys</span>
          </p>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <AppButton variant="secondary" @click="step = null; formError = null">Annuler</AppButton>
          <AppButton :disabled="isSubmitting" @click="handleAddWorkspace">
            <span v-if="isSubmitting">Vérification…</span>
            <span v-else>Continuer →</span>
          </AppButton>
        </div>
      </div>
    </div>

    <!-- ── STEP 2 / EDIT : Team selection ── -->
    <div
      v-if="step === 'teams' || editingWorkspace"
      class="mb-6 bg-white rounded-xl border border-gray-200 p-6 shadow-sm"
    >
      <div class="flex items-center gap-3 mb-5">
        <div
          v-if="step === 'teams'"
          class="w-8 h-8 rounded-full bg-brand-primary text-white text-sm font-bold flex items-center justify-center"
        >2</div>
        <div>
          <h2 class="text-base font-semibold text-gray-900">
            {{ step === 'teams' ? 'Choisir les équipes à synchroniser' : 'Modifier les équipes synchronisées' }}
          </h2>
          <p class="text-xs text-gray-400">Seules les équipes sélectionnées seront importées.</p>
        </div>
      </div>

      <!-- Loading teams -->
      <template v-if="teamsLoading">
        <AppSkeleton v-for="i in 4" :key="i" class="mb-2 h-11 rounded-lg" />
      </template>

      <!-- Error fetching teams -->
      <div v-else-if="teamsError" class="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700 mb-4">
        {{ teamsError }}
      </div>

      <template v-else-if="availableTeams.length">
        <!-- Select all toggle -->
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs text-gray-500">{{ selectedIds.size }} / {{ availableTeams.length }} équipes sélectionnées</span>
          <button class="text-xs text-brand-primary hover:underline" @click="toggleAll">
            {{ selectedIds.size === availableTeams.length ? 'Tout désélectionner' : 'Tout sélectionner' }}
          </button>
        </div>

        <div class="space-y-2 mb-5">
          <label
            v-for="team in availableTeams"
            :key="team.id"
            class="flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors"
            :class="selectedIds.has(team.id)
              ? 'border-brand-primary bg-blue-50'
              : 'border-gray-200 hover:bg-gray-50'"
          >
            <input
              type="checkbox"
              :checked="selectedIds.has(team.id)"
              class="rounded accent-brand-primary"
              @change="toggleTeam(team.id)"
            >
            <span class="text-sm font-medium text-gray-800">{{ team.name }}</span>
          </label>
        </div>

        <div class="flex justify-end gap-2">
          <AppButton variant="secondary" @click="cancelTeams">Annuler</AppButton>
          <AppButton :disabled="isSubmitting || selectedIds.size === 0" @click="confirmTeams">
            <span v-if="isSubmitting">Enregistrement…</span>
            <span v-else-if="step === 'teams'">Synchroniser {{ selectedIds.size }} équipe{{ selectedIds.size > 1 ? 's' : '' }}</span>
            <span v-else>Enregistrer</span>
          </AppButton>
        </div>
      </template>
    </div>

    <!-- ── Workspace list ── -->
    <template v-if="isLoading">
      <AppSkeleton v-for="i in 3" :key="i" class="mb-3 h-24 rounded-xl" />
    </template>

    <AppErrorBanner v-else-if="error" :message="error" @retry="fetchWorkspaces" />

    <AppEmptyState
      v-else-if="workspaces.length === 0 && !step"
      title="Aucun workspace Linear configuré"
      description="Connectez votre première clé API Linear pour importer les données de vélocité."
    >
      <AppButton class="mt-4" @click="step = 'form'">+ Ajouter un workspace</AppButton>
    </AppEmptyState>

    <div v-else class="space-y-3">
      <div
        v-for="ws in workspaces"
        :key="ws.id"
        class="bg-white rounded-xl border border-gray-200 p-5"
      >
        <!-- Workspace header -->
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="font-semibold text-gray-900 truncate">{{ ws.name }}</p>
              <span class="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">Linear</span>
            </div>
            <p class="text-xs text-gray-400 mt-0.5">
              Dernière sync : {{ formatDate(ws.last_synced_at) }}
            </p>
          </div>
          <NuxtLink
            :to="`/velocite/workspaces/${ws.id}`"
            class="shrink-0 text-sm font-medium text-brand-primary hover:underline"
          >
            Voir les équipes →
          </NuxtLink>
        </div>

        <!-- Selected teams chips -->
        <div class="mb-3">
          <div v-if="ws.selected_teams?.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="t in ws.selected_teams"
              :key="t.id"
              class="inline-flex items-center text-xs bg-blue-50 text-blue-700 rounded-full px-2.5 py-0.5 font-medium"
            >
              {{ t.name }}
            </span>
          </div>
          <p v-else class="text-xs text-gray-400 italic">Toutes les équipes synchronisées</p>
        </div>

        <!-- Actions -->
        <div class="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
          <AppButton variant="secondary" :disabled="isSyncing" @click="handleSync(ws)">
            {{ isSyncing ? 'Sync…' : 'Synchroniser' }}
          </AppButton>
          <AppButton variant="ghost" :disabled="isSyncing" @click="handleFullSync(ws)">
            Resync complet
          </AppButton>
          <AppButton variant="ghost" @click="openTeamEditor(ws)">
            Gérer les équipes
          </AppButton>
          <AppButton
            variant="ghost"
            class="ml-auto text-red-500 hover:bg-red-50"
            @click="pendingDelete = ws"
          >
            Supprimer
          </AppButton>
        </div>
      </div>
    </div>

    <!-- Confirmation suppression -->
    <AppConfirmModal
      v-if="pendingDelete"
      :title="`Supprimer « ${pendingDelete.name} » ?`"
      description="Toutes les données Linear associées (issues, historique, métriques) seront supprimées définitivement."
      @confirm="handleDelete"
      @cancel="pendingDelete = null"
    />

  </div>
</template>
