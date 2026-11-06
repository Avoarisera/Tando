<script setup lang="ts">
import type { ReviewTemplate } from '~/composables/useReviews'
import { addDaysIso, addYearsIso, professionalDue, type DueStatus } from '~/utils/reviews'

/**
 * TND-35 — « entretien professionnel » schedule (Code du travail L6315-1): every
 * 2 years from hire or the last one shared, a 6-year review. HR picks people
 * and launches a campaign of interviews with them already ticked.
 */
const props = defineProps<{ templates: ReviewTemplate[] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const { profile } = useCurrentUser()
const { professionalStatus, createCycle } = useReviews()

const today = todayIso()
const rows = ref<(Awaited<ReturnType<typeof professionalStatus>>[number] & ReturnType<typeof professionalDue>)[] | null>(null)
const error = ref<string | null>(null)
async function load() {
  error.value = null
  try {
    const list = await professionalStatus()
    rows.value = list.map(p => ({ ...p, ...professionalDue(p, today) }))
      .sort((a, b) => (a.nextEp < b.nextBilan ? a.nextEp : b.nextBilan).localeCompare(b.nextEp < b.nextBilan ? b.nextEp : b.nextBilan))
  }
  catch (e) { error.value = errorMessage(e) }
}
onMounted(load)

const onlyDue = ref(true)
const shown = computed(() => (rows.value ?? []).filter(r => !onlyDue.value || r.epStatus !== 'ok' || r.bilanStatus !== 'ok'))
const counts = computed(() => ({
  overdue: (rows.value ?? []).filter(r => r.epStatus === 'overdue' || r.bilanStatus === 'overdue').length,
  soon: (rows.value ?? []).filter(r => r.epStatus !== 'overdue' && r.bilanStatus !== 'overdue' && (r.epStatus === 'soon' || r.bilanStatus === 'soon')).length,
}))
const picked = ref<string[]>([])
const toggle = (id: string, on: boolean) => { picked.value = on ? [...new Set([...picked.value, id])] : picked.value.filter(x => x !== id) }
const allShown = computed(() => shown.value.length > 0 && shown.value.every(r => picked.value.includes(r.id)))
const toggleAll = (on: boolean) => { picked.value = on ? [...new Set([...picked.value, ...shown.value.map(r => r.id)])] : picked.value.filter(id => !shown.value.some(r => r.id === id)) }

const tone = (s: DueStatus) => (s === 'overdue' ? 'danger' : s === 'soon' ? 'warning' : 'neutral') as 'danger' | 'warning' | 'neutral'
const fmt = (d: string | null) => (d ? fmtShort(d, tag.value) : '—')
const tplEp = computed(() => props.templates.find(x => x.content.professional && !x.content.bilan) ?? null)
const tplBilan = computed(() => props.templates.find(x => x.content.bilan) ?? null)

const launching = ref(false)
async function launch(bilan: boolean) {
  const tpl = bilan ? tplBilan.value : tplEp.value
  if (!tpl || !picked.value.length || !profile.value) return
  launching.value = true
  try {
    const month = new Intl.DateTimeFormat(tag.value, { month: 'long', year: 'numeric' }).format(new Date())
    const id = await createCycle({
      name: `${bilan ? t('tnd35.ep.bilanName') : t('tnd35.ep.campaignName')} — ${month}`.slice(0, 120),
      period_start: addYearsIso(today, bilan ? -6 : -2), period_end: today, template_id: tpl.id,
      self_due: addDaysIso(today, 14), manager_due: addDaysIso(today, 21), hr_due: addDaysIso(today, 30), peers_enabled: false, peer_due: null,
    }, profile.value.id)
    toast.add(t('tnd29.cycle.created'))
    await navigateTo({ path: `/evaluations/campagne/${id}`, query: { people: picked.value.join(',') } })
  }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { launching.value = false }
}
</script>

<template>
  <div class="wb-stack wb-eps">
    <p class="small wb-mut2">{{ t('tnd35.ep.intro') }}</p>
    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!rows" variant="table" />
    <template v-else>
      <div class="wb-row wb-wrap wb-eps-kpi">
        <WbBadge tone="danger" data-kpi="overdue">{{ t('tnd35.ep.overdue', { n: counts.overdue }, counts.overdue) }}</WbBadge>
        <WbBadge tone="warning" data-kpi="soon">{{ t('tnd35.ep.soon', { n: counts.soon }, counts.soon) }}</WbBadge>
        <span class="wb-grow" />
        <WbCheckbox v-model="onlyDue" :label="t('tnd35.ep.onlyDue')" />
      </div>
      <div class="wb-card wb-scroll wb-dt">
        <table>
          <caption class="wb-sr">{{ t('tnd35.tabs.professional') }}</caption>
          <thead><tr>
            <th><WbCheckbox :model-value="allShown" :aria-label="t('tnd35.ep.pickAll')" @update:model-value="toggleAll" /></th>
            <th>{{ t('tnd26.person') }}</th><th>{{ t('people.joined') }}</th><th>{{ t('tnd35.ep.last') }}</th><th>{{ t('tnd35.ep.next') }}</th><th>{{ t('tnd35.ep.bilan') }}</th>
          </tr></thead>
          <tbody>
            <tr v-if="!shown.length"><td colspan="6" class="small wb-mut2">{{ t('tnd35.ep.none') }}</td></tr>
            <tr v-for="r in shown" :key="r.id" :data-ep="r.name">
              <td><WbCheckbox :model-value="picked.includes(r.id)" :aria-label="r.name" @update:model-value="(v: boolean) => toggle(r.id, v)" /></td>
              <td><b class="small">{{ r.name }}</b><div class="caption wb-mut2">{{ r.team_name ?? '—' }}</div></td>
              <td class="small">{{ fmt(r.joined_at) }}</td>
              <td class="small">{{ r.last_ep ? fmt(r.last_ep) : t('tnd35.ep.never') }}</td>
              <td><WbBadge size="sm" :tone="tone(r.epStatus)">{{ fmt(r.nextEp) }}</WbBadge></td>
              <td><WbBadge size="sm" :tone="tone(r.bilanStatus)">{{ fmt(r.nextBilan) }}</WbBadge></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="wb-row wb-wrap wb-eps-act">
        <span class="small wb-mut2">{{ t('tnd35.ep.picked', { n: picked.length }, picked.length) }}</span>
        <span class="wb-grow" />
        <WbButton variant="secondary" size="sm" icon="send" :disabled="!picked.length || !tplBilan" :loading="launching" data-action="launch-bilan" @click="launch(true)">{{ t('tnd35.ep.launchBilan') }}</WbButton>
        <WbButton size="sm" icon="send" :disabled="!picked.length || !tplEp" :loading="launching" data-action="launch-ep" @click="launch(false)">{{ t('tnd35.ep.launch') }}</WbButton>
      </div>
      <p class="caption wb-mut">{{ t('tnd35.ep.legal') }}</p>
    </template>
  </div>
</template>

<style scoped>
.wb-eps-kpi, .wb-eps-act { gap: var(--space-2); align-items: center; }
.wb-eps-act :deep(.wb-btn) { margin: 0; }
</style>
