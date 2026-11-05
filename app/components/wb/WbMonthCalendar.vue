<script setup lang="ts">
export type BarState = 'pending' | 'approved' | 'rejected' | 'cancel_requested'
export interface CalBar { id: string, from: string, to: string, who: string, type?: string, color: string, pending?: boolean, /** own requests only: shown with their status */ state?: BarState, /** a request I can approve (manager / admin, TND-25) */ review?: boolean }

const props = withDefaults(defineProps<{ month: string, events: CalBar[], today: string, holidays?: Record<string, string>, /** bars are buttons that emit `open` (TND-25) */ interactive?: boolean, /** request to highlight */ focus?: string | null }>(), { holidays: () => ({}), focus: null })
defineEmits<{ day: [iso: string], open: [id: string] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const labels = computed(() => weekdayLabels(tag.value))

const weeks = computed(() => {
  const ds = monthDays(props.month)
  const first = addDays(ds[0]!, -dayOfWeek(ds[0]!))
  const count = Math.ceil((dayOfWeek(ds[0]!) + ds.length) / 7)
  return Array.from({ length: count }, (_, w) => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(first, w * 7 + i))
    const a = days[0]!
    const b = days[6]!
    // Stack overlapping bars on separate lanes
    const lanes: [number, number][][] = []
    const bars = props.events.filter(e => e.from <= b && e.to >= a).map((e) => {
      const s = e.from < a ? 0 : dayOfWeek(e.from)
      const f = e.to > b ? 6 : dayOfWeek(e.to)
      let l = 0
      while ((lanes[l] ?? []).some(x => s <= x[1] && f >= x[0])) l++
      ;(lanes[l] ??= []).push([s, f])
      return { ...e, s, f, l }
    })
    return { days, bars, lanes: Math.max(lanes.length, 2) }
  })
})
const short = computed(() => shortNames(props.events.map(b => b.who)))
/** Status words on one's own bars (TND-23): pending, refused, cancellation asked */
function stateLabel(bar: CalBar): string {
  if (bar.review) return t('tnd25.toReview')
  if (bar.state === 'rejected') return t('tnd23.state.rejected')
  if (bar.state === 'cancel_requested') return t('tnd23.state.cancelRequested')
  if (bar.pending) return t('calendar.pendingShort')
  return ''
}
</script>

<template>
  <div class="wb-cal">
    <div class="wb-cal-hd"><span v-for="w in labels" :key="w" class="caption">{{ w }}</span></div>
    <div v-for="(week, wi) in weeks" :key="wi" class="wb-cal-w" :style="{ '--lanes': week.lanes }">
      <button
        v-for="d in week.days"
        :key="d"
        type="button"
        :aria-label="fmtDay(d, tag)"
        :class="['wb-cal-d', { 'is-out': d.slice(0, 7) !== month, 'is-we': isWeekend(d), 'is-hol': holidays[d], 'is-today': d === today }]"
        @click="$emit('day', d)"
      >
        <span class="wb-num small">{{ +d.slice(8) }}</span>
        <span v-if="holidays[d]" class="wb-cal-h caption2">{{ holidays[d] }}</span>
      </button>
      <component
        :is="interactive ? 'button' : 'div'"
        v-for="bar in week.bars"
        :key="bar.id"
        :type="interactive ? 'button' : undefined"
        :data-id="bar.id"
        :class="['wb-bar', { 'is-pend': bar.pending && bar.state !== 'rejected', 'is-rej': bar.state === 'rejected', 'is-canc': bar.state === 'cancel_requested', 'is-focus': focus === bar.id }]"
        :style="{ ...leaveVars(bar.color), left: `calc(${bar.s} * 100% / 7 + 3px)`, width: `calc(${bar.f - bar.s + 1} * 100% / 7 - 6px)`, '--l': bar.l }"
        :title="`${bar.who} · ${bar.type ?? ''}${stateLabel(bar) ? ` · ${stateLabel(bar)}` : ''}`"
        :aria-label="interactive ? `${bar.who}, ${bar.type ?? ''}, ${formatPeriod(bar.from, bar.to, tag)}${stateLabel(bar) ? `, ${stateLabel(bar)}` : ''}` : undefined"
        @click="interactive && $emit('open', bar.id)"
      >
        <WbAvatar :name="bar.who" :size="16" />
        <span>{{ short(bar.who) }}{{ stateLabel(bar) ? ` · ${stateLabel(bar)}` : '' }}</span>
      </component>
    </div>
  </div>
</template>
