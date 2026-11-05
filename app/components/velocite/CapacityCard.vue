<script setup lang="ts">
// Capacity of the team over the coming weeks (R8-H, mockup V03): working days
// of each dev minus their approved leave, from /api/capacity (admin, or a manager of a linked team — TND-26).
const props = defineProps<{ workspaceId: string, teamId: string }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const supabase = useSupabaseClient()
const { isAdmin } = useCurrentUser()

interface CapacityDev { id: string, name: string, linked: boolean, working: number, leave: number, available: number, absences: { start: string, end: string, type: string }[] }

const weeks = ref('2')
const weekOptions = computed(() => ['1', '2', '4'].map(w => ({ value: w, label: t('r8b.capacity.weeks', { n: Number(w) }, Number(w)) })))
const today = todayIso()
const from = computed(() => addDays(today, -dayOfWeek(today)))
const to = computed(() => addDays(from.value, Number(weeks.value) * 7 - 1))

const devs = ref<CapacityDev[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

async function load() {
  isLoading.value = true
  error.value = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error(t('r8b.capacity.authError'))
    const res = await $fetch<{ devs: CapacityDev[] }>('/api/capacity', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      query: { workspaceId: props.workspaceId, teamId: props.teamId, from: from.value, to: to.value },
    })
    devs.value = res.devs
  }
  catch (e) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    error.value = err.data?.statusMessage ?? err.message ?? t('common.loadError')
  }
  finally {
    isLoading.value = false
  }
}
onMounted(load)
watch(weeks, load)

// TND-24: people not linked to a WakaBods account are grouped on one foldable line
const linked = computed(() => devs.value.filter(d => d.linked))
const unlinked = computed(() => devs.value.filter(d => !d.linked))
const showUnlinked = ref(false)
const totals = computed(() => devs.value.filter(d => d.linked).reduce((s, d) => ({ working: s.working + d.working, available: s.available + d.available }), { working: 0, available: 0 }))
const gaugeState = (d: CapacityDev) => (d.working === 0 ? 'ok' : d.available / d.working < 0.5 ? 'over' : d.available < d.working ? 'busy' : 'ok')
const fmtNum = (n: number) => new Intl.NumberFormat(tag.value, { maximumFractionDigits: 1 }).format(n)
const period = computed(() => formatPeriod(from.value, to.value, tag.value))
</script>

<template>
  <WbCard :title="t('r8b.capacity.title')" :subtitle="period">
    <template #action>
      <WbSegmented v-model="weeks" :options="weekOptions" :label="t('r8b.capacity.window')" />
    </template>
    <WbErrorState v-if="error" :message="readableApiError(error)" @retry="load" />
    <WbSkeleton v-else-if="isLoading && !devs.length" variant="table" :count="3" />
    <p v-else-if="!devs.length" class="wb-mut">{{ t('r8b.capacity.empty') }}</p>
    <div v-else class="wb-stack">
      <p v-if="linked.length" class="small wb-mut2">
        {{ t('r8b.capacity.summary', { available: fmtNum(totals.available), working: fmtNum(totals.working) }) }}
      </p>
      <ul v-if="linked.length" class="wb-list wb-cap-list">
        <li v-for="d in linked" :key="d.id" class="wb-cap-row" :data-dev="d.name">
          <WbAvatar :name="d.name" :size="32" />
          <div class="wb-grow wb-stack-s" style="gap: 4px; min-width: 0">
            <div class="wb-row-b wb-wrap">
              <b class="small">{{ d.name }}</b>
              <WbBadge v-if="!d.linked" tone="neutral" icon="link" size="sm">{{ t('r8b.capacity.unlinked') }}</WbBadge>
            </div>
            <WbCapacityGauge
              v-if="d.linked"
              :label="t('r8b.capacity.available')"
              :value="d.available"
              :max="d.working"
              :unit="t('r8b.capacity.daysUnit')"
              :state="gaugeState(d)"
            />
            <p v-if="d.absences.length" class="caption wb-mut">
              {{ t('r8b.capacity.away') }}
              <span v-for="(a, i) in d.absences" :key="i">{{ i ? ', ' : '' }}{{ a.type }} ({{ formatPeriod(a.start, a.end, tag) }})</span>
            </p>
          </div>
        </li>
      </ul>
      <div v-if="unlinked.length" class="wb-cap-unl">
        <div class="wb-row-b wb-wrap" style="gap: 8px">
          <span class="small"><WbIcon name="link" :size="14" /> {{ t('tnd24.unlinked', { n: unlinked.length }, unlinked.length) }}</span>
          <span class="wb-row" style="gap: 4px">
            <WbButton variant="ghost" size="sm" :aria-expanded="showUnlinked" data-action="toggle-unlinked" @click="showUnlinked = !showUnlinked">{{ showUnlinked ? t('tnd24.unlinkedHide') : t('tnd24.unlinkedShow') }}</WbButton>
            <WbButton v-if="isAdmin" variant="ghost" size="sm" to="/people">{{ t('tnd24.linkPeople') }}</WbButton>
          </span>
        </div>
        <p v-if="showUnlinked" class="caption wb-mut2 wb-cap-names">{{ unlinked.map(d => d.name).join(', ') }}</p>
        <p class="caption wb-mut">{{ t('tnd24.unlinkedHint') }}</p>
      </div>
      <p class="caption wb-mut">{{ t('r8b.capacity.hint') }}</p>
    </div>
  </WbCard>
</template>

<style scoped>
.wb-cap-unl { display: flex; flex-direction: column; gap: 4px; padding: var(--space-2) var(--space-3); border: 1px dashed var(--border); border-radius: var(--radius-md); background: var(--surface-2); }
.wb-cap-unl :deep(.wb-btn) { margin: 0; }
.wb-cap-names { line-height: 1.6; }
.wb-cap-row { align-items: flex-start; }
</style>
