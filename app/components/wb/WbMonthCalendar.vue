<script setup lang="ts">
export interface CalBar { id: string, from: string, to: string, who: string, type?: string, color: string, pending?: boolean }

const props = withDefaults(defineProps<{ month: string, events: CalBar[], today: string, holidays?: Record<string, string> }>(), { holidays: () => ({}) })
defineEmits<{ day: [iso: string] }>()
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
      <div
        v-for="bar in week.bars"
        :key="bar.id"
        :class="['wb-bar', { 'is-pend': bar.pending }]"
        :style="{ ...leaveVars(bar.color), left: `calc(${bar.s} * 100% / 7 + 3px)`, width: `calc(${bar.f - bar.s + 1} * 100% / 7 - 6px)`, '--l': bar.l }"
        :title="`${bar.who} · ${bar.type ?? ''}${bar.pending ? ` · ${t('leave.status.pending')}` : ''}`"
      >
        <WbAvatar :name="bar.who" :size="16" />
        <span>{{ bar.who.split(' ')[0] }}{{ bar.pending ? ` · ${t('calendar.pendingShort')}` : '' }}</span>
      </div>
    </div>
  </div>
</template>
