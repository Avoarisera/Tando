<script setup lang="ts">
import type { LeaveRequestWithRelations } from '~/types/index'
import type { PlanPerson } from '~/components/wb/WbPlanningGrid.vue'
import type { CalendarEvent } from '~/types/index'

const props = defineProps<{
  request: LeaveRequestWithRelations
  /** Approved leave of everyone visible, to compute overlaps */
  events: readonly CalendarEvent[]
  teamSize: number
  balanceAfter: number | null
  isAdmin: boolean
  selectable?: boolean
  busy?: boolean
  /** Dense team planning around the request (manager view) */
  planning?: PlanPerson[]
}>()
const selected = defineModel<boolean>('selected', { default: false })
defineEmits<{ approve: [], refuse: [] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

const r = computed(() => props.request)
const isCancellation = computed(() => r.value.status === 'cancel_requested')
const who = computed(() => fullName(r.value.profiles))
const team = computed(() => r.value.profiles.teams?.name ?? '')
const period = computed(() => formatPeriod(r.value.start_date, r.value.end_date, tag.value))

// Colleagues away on the same days (approved only), and the worst presence day
const overlaps = computed(() => props.events.filter(e =>
  e.userId !== r.value.user_id && e.status === 'approved'
  && e.startDate <= r.value.end_date && e.endDate >= r.value.start_date
  && (!r.value.profiles.team_id || e.teamId === r.value.profiles.team_id)))

const worstDay = computed(() => {
  if (!props.teamSize) return null
  let worst: { day: string, n: number } | null = null
  let d = r.value.start_date
  while (d <= r.value.end_date) {
    if (!isWeekend(d)) {
      const away = 1 + overlaps.value.filter(e => e.startDate <= d && e.endDate >= d).length
      const n = props.teamSize - away
      if (!worst || n < worst.n) worst = { day: d, n }
    }
    d = addDays(d, 1)
  }
  return worst
})

const impact = computed(() => {
  const items: { tone: 'success' | 'warning' | 'danger' | 'neutral', icon: string, text: string }[] = []
  if (overlaps.value.length) {
    const names = [...new Set(overlaps.value.map(e => e.employeeName.split(' ')[0]))].join(', ')
    items.push({ tone: 'warning', icon: 'triangle-alert', text: t('approvals.alsoAway', { who: names }) })
  }
  else {
    items.push({ tone: 'success', icon: 'check', text: t('approvals.noOverlap') })
  }
  if (worstDay.value) {
    const low = worstDay.value.n / props.teamSize < 0.5
    items.push({ tone: low ? 'danger' : 'neutral', icon: low ? 'triangle-alert' : 'users', text: t('approvals.presence', { day: fmtShort(worstDay.value.day, tag.value), n: worstDay.value.n, of: props.teamSize }) })
  }
  if (props.balanceAfter !== null) {
    items.push({ tone: props.balanceAfter < 0 ? 'danger' : 'neutral', icon: 'wallet', text: t('approvals.balanceAfter', { n: props.balanceAfter }) })
  }
  return items
})

// Admin acting on a request the manager has not seen yet
const skipsManager = computed(() => props.isAdmin && r.value.status === 'pending')
const highlight = computed(() => ({ from: r.value.start_date, to: r.value.end_date }))
const showPlan = ref(false)
const planDays = computed(() => {
  const start = addDays(r.value.start_date, -dayOfWeek(r.value.start_date) - 2)
  return Array.from({ length: 14 }, (_, i) => addDays(start, i))
})
</script>

<template>
  <article class="wb-ac wb-acx" :class="{ 'is-sel': selected }" :data-id="r.id">
    <div class="wb-acx-row">
      <WbCheckbox v-if="selectable" v-model="selected" class="wb-acx-chk" :aria-label="t('approvals.select', { who })" />
      <WbAvatar :name="who" :size="36" />
      <div class="wb-acx-main">
        <div class="wb-acx-l1">
          <h3 class="h3">{{ who }}</h3>
          <span v-if="team" class="small wb-mut">{{ team }}</span>
          <WbStatusBadge v-if="isCancellation" status="cancel_requested" />
          <WbBadge v-else-if="isAdmin" :tone="r.status === 'manager_approved' ? 'info' : 'warning'" size="sm">
            {{ r.status === 'manager_approved' ? t('approvals.level2') : t('approvals.level1') }}
          </WbBadge>
        </div>
        <div class="wb-acx-l2 small wb-mut2">
          <WbTypeBadge :name="r.leave_types?.name ?? ''" :color="r.leave_types?.color" />
          <span>{{ period }}</span>
          <b class="wb-num">{{ t('leave.workingDays', { n: fmtDays(Number(r.days_count), tag) }, Number(r.days_count)) }}</b>
        </div>
        <p v-if="r.comment" class="small wb-quote">« {{ r.comment }} »</p>
        <p v-if="isCancellation" class="small wb-mut2">{{ t('approvals.cancelHint', { who: r.profiles.first_name }) }}</p>
        <div v-else class="wb-acx-impact">
          <h4 class="wb-sr">{{ t('approvals.impact') }}</h4>
          <ul>
            <li v-for="(x, i) in impact" :key="i" :class="['caption', `wb-c-${x.tone}`, `wb-acx-chip-${x.tone}`]">
              <WbIcon :name="x.icon" :size="13" /><span>{{ x.text }}</span>
            </li>
          </ul>
        </div>
        <div v-if="skipsManager && !isCancellation" class="caption wb-c-warning wb-acx-warn"><WbIcon name="triangle-alert" :size="13" />{{ t('approvals.skipsManager') }}</div>
      </div>
      <div class="wb-acx-a">
        <WbButton v-if="planning?.length" variant="ghost" size="sm" icon="table" :aria-expanded="showPlan" @click="showPlan = !showPlan">
          {{ showPlan ? t('v2.hidePlanning') : t('v2.showPlanning') }}
        </WbButton>
        <WbButton variant="secondary" size="sm" :disabled="busy" @click="$emit('refuse')">{{ isCancellation ? t('approvals.keepLeave') : t('approvals.refuse') }}</WbButton>
        <WbButton icon="check" size="sm" :loading="busy" @click="$emit('approve')">{{ isCancellation ? t('approvals.acceptCancel') : t('approvals.approve') }}</WbButton>
      </div>
    </div>

    <WbPlanningGrid
      v-if="planning?.length && showPlan"
      dense
      :days="planDays"
      :people="planning"
      :today="todayIso()"
      :highlight="highlight"
    />
  </article>
</template>

<style scoped>
.wb-acx { padding: var(--space-3) var(--space-4); gap: var(--space-3); }
.wb-acx.is-sel { border-color: var(--brand); background: color-mix(in srgb, var(--brand-tint) 55%, var(--surface)); }
.wb-acx-row { display: flex; gap: var(--space-3); align-items: flex-start; }
.wb-acx-chk { margin-top: 6px; min-height: 24px; }
.wb-acx-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.wb-acx-l1 { display: flex; flex-wrap: wrap; align-items: center; gap: 6px var(--space-2); }
.wb-acx-l2 { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--space-2); }
.wb-acx-impact ul { list-style: none; margin: 2px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.wb-acx-impact li { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--radius-pill); background: var(--surface-2); }
.wb-acx-impact li.wb-acx-chip-success { background: var(--success-tint); }
.wb-acx-impact li.wb-acx-chip-warning { background: var(--warning-tint); }
.wb-acx-impact li.wb-acx-chip-danger { background: var(--danger-tint); }
.wb-acx-warn { display: inline-flex; gap: 4px; align-items: center; }
.wb-acx-a { display: flex; gap: var(--space-2); align-items: center; flex: none; }
.wb-acx-a :deep(.wb-btn) { margin: 0; flex: none; }
@container wbapp (max-width: 767px) {
  .wb-acx-row { flex-wrap: wrap; }
  .wb-acx-main { flex-basis: calc(100% - 80px); }
  .wb-acx-a { width: 100%; justify-content: flex-end; flex-wrap: wrap; }
  .wb-acx-a :deep(.wb-btn) { flex: 1; min-height: 44px; }
}
</style>
