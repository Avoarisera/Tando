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
const planDays = computed(() => {
  const start = addDays(r.value.start_date, -dayOfWeek(r.value.start_date) - 2)
  return Array.from({ length: 14 }, (_, i) => addDays(start, i))
})
</script>

<template>
  <article class="wb-ac" :data-id="r.id">
    <div class="wb-ac-h">
      <WbCheckbox v-if="selectable" v-model="selected" :aria-label="t('approvals.select', { who })" />
      <WbAvatar :name="who" :size="40" />
      <div class="wb-grow">
        <h3 class="h3">{{ who }} <span v-if="team" class="wb-mut small">· {{ team }}</span></h3>
        <p class="small wb-mut2">
          <WbTypeBadge :name="r.leave_types?.name ?? ''" :color="r.leave_types?.color" />
          {{ period }} · <b class="wb-num">{{ t('leave.days', { n: r.days_count }, r.days_count) }}</b>
        </p>
      </div>
      <WbBadge v-if="isAdmin" :tone="r.status === 'manager_approved' ? 'info' : 'warning'" size="sm">
        {{ r.status === 'manager_approved' ? t('approvals.level2') : t('approvals.level1') }}
      </WbBadge>
    </div>

    <p v-if="r.comment" class="small wb-quote">« {{ r.comment }} »</p>

    <div class="wb-ac-i">
      <h4 class="caption wb-mut">{{ t('approvals.impact') }}</h4>
      <ul>
        <li v-for="(x, i) in impact" :key="i" :class="['small', `wb-c-${x.tone}`]">
          <WbIcon :name="x.icon" :size="15" /><span>{{ x.text }}</span>
        </li>
      </ul>
    </div>

    <WbPlanningGrid
      v-if="planning?.length"
      dense
      :days="planDays"
      :people="planning"
      :today="todayIso()"
      :highlight="highlight"
    />

    <div v-if="skipsManager" class="small wb-c-warning wb-row"><WbIcon name="triangle-alert" :size="15" />{{ t('approvals.skipsManager') }}</div>

    <div class="wb-ac-a">
      <WbButton variant="secondary" :disabled="busy" @click="$emit('refuse')">{{ t('approvals.refuse') }}</WbButton>
      <WbButton icon="check" :loading="busy" @click="$emit('approve')">{{ t('approvals.approve') }}</WbButton>
    </div>
  </article>
</template>
