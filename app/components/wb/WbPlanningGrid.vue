<script setup lang="ts">
export interface PlanSpan { id: string, from: string, to: string, label: string, color: string, pending?: boolean }
export interface PlanPerson { id: string, name: string, spans: PlanSpan[] }

const props = withDefaults(defineProps<{
  days: string[]
  people: PlanPerson[]
  today: string
  holidays?: Record<string, string>
  dense?: boolean
  presenceLabel?: string
  /** Days to highlight, e.g. the request being reviewed */
  highlight?: { from: string, to: string }
}>(), { holidays: () => ({}) })
const { locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
// Columns stretch to the available width (never narrower than the base size)
const base = computed(() => (props.dense ? 28 : 36))
const wrap = ref<HTMLElement | null>(null)
const avail = ref(0)
let ro: ResizeObserver | undefined
function measure() {
  const el = wrap.value
  if (!el) return
  const name = el.querySelector<HTMLElement>('.wb-plan-n')?.offsetWidth ?? 200
  avail.value = Math.max(0, el.clientWidth - name)
}
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && wrap.value) {
    ro = new ResizeObserver(measure)
    ro.observe(wrap.value)
  }
})
onBeforeUnmount(() => ro?.disconnect())
const col = computed(() => Math.max(base.value, Math.floor(avail.value / Math.max(props.days.length, 1))))

function visibleSpans(p: PlanPerson) {
  const first = props.days[0]!
  const last = props.days.at(-1)!
  return p.spans.filter(s => s.to >= first && s.from <= last).map((s) => {
    const a = Math.max(props.days.indexOf(s.from), 0)
    const zi = props.days.indexOf(s.to)
    const z = zi < 0 ? props.days.length - 1 : zi
    return { ...s, a, z }
  })
}

// Present people per working day ("3/4"), flagged when under half the team
const presence = computed(() => props.days.map((d) => {
  if (isWeekend(d) || props.holidays[d]) return null
  const away = props.people.filter(p => p.spans.some(s => !s.pending && inRange(d, s.from, s.to))).length
  const of = props.people.length
  return { n: of - away, of, low: of > 0 && (of - away) / of < 0.5 }
}))
</script>

<template>
  <div ref="wrap" class="wb-scroll">
    <div class="wb-plan" :class="{ 'is-dense': dense }" role="table" :style="{ '--n': days.length, '--c': `${col}px` }">
      <div class="wb-plan-r wb-plan-hd" role="row">
        <span class="wb-plan-n" />
        <span
          v-for="d in days"
          :key="d"
          role="columnheader"
          :class="['wb-plan-dh', { 'is-today': d === today, 'is-we': isWeekend(d), 'is-hol': holidays[d] }]"
          :title="holidays[d] ?? fmtDay(d, tag)"
        >
          <i class="caption2">{{ fmtWeekday(d, tag).slice(0, 2) }}</i><b class="wb-num caption">{{ +d.slice(8) }}</b>
        </span>
      </div>
      <div v-for="p in people" :key="p.id" class="wb-plan-r" role="row">
        <span class="wb-plan-n" role="rowheader"><WbAvatar :name="p.name" :size="dense ? 22 : 26" /><span class="small">{{ p.name }}</span></span>
        <div class="wb-plan-cells">
          <span v-for="d in days" :key="d" :class="['wb-plan-c', { 'is-we': isWeekend(d), 'is-hol': holidays[d], 'is-today': d === today, 'is-hl': inRange(d, highlight?.from, highlight?.to) }]" />
          <div
            v-for="s in visibleSpans(p)"
            :key="s.id"
            :class="['wb-bar', { 'is-pend': s.pending }]"
            :title="s.label"
            :style="{ ...leaveVars(s.color), left: `calc(${s.a} * var(--c) + 2px)`, width: `calc(${s.z - s.a + 1} * var(--c) - 4px)` }"
          >
            <span>{{ s.z - s.a > 0 ? s.label : '' }}</span>
          </div>
        </div>
      </div>
      <div v-if="presenceLabel" class="wb-plan-r wb-plan-ft" role="row">
        <span class="wb-plan-n small"><b>{{ presenceLabel }}</b></span>
        <span v-for="(p, i) in presence" :key="days[i]" :class="['wb-plan-p', { 'is-low': p?.low }]">
          <b v-if="p" class="wb-num caption">{{ p.n }}/{{ p.of }}</b>
        </span>
      </div>
    </div>
  </div>
</template>
