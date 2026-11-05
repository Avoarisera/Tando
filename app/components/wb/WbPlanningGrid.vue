<script setup lang="ts">
export interface PlanSpan { id: string, from: string, to: string, label: string, color: string, pending?: boolean, /** own requests: 'rejected' | 'cancel_requested' styling (TND-23) */ state?: string, /** a request I can approve (TND-25) */ review?: boolean, /** label for short bars (e.g. the type without « à valider ») */ shortLabel?: string }
export interface PlanPerson { id: string, name: string, spans: PlanSpan[], /** optional section (team) — a header row is shown when it changes */ group?: string }

const props = withDefaults(defineProps<{
  days: string[]
  people: PlanPerson[]
  today: string
  holidays?: Record<string, string>
  dense?: boolean
  presenceLabel?: string
  /** Days to highlight, e.g. the request being reviewed */
  highlight?: { from: string, to: string }
  /** bars are buttons that emit `open` (TND-25) */
  interactive?: boolean
  /** request to highlight */
  focus?: string | null
}>(), { holidays: () => ({}), focus: null })
defineEmits<{ open: [id: string] }>()
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
      <template v-for="(p, i) in people" :key="p.id">
      <div v-if="p.group && p.group !== people[i - 1]?.group" class="wb-plan-r wb-plan-g" role="row">
        <span class="wb-plan-n caption" role="rowheader"><b>{{ p.group }}</b><span class="wb-mut2">{{ people.filter(x => x.group === p.group).length }}</span></span>
      </div>
      <div class="wb-plan-r" role="row">
        <span class="wb-plan-n" role="rowheader"><WbAvatar :name="p.name" :size="dense ? 22 : 26" /><span class="small">{{ p.name }}</span></span>
        <div class="wb-plan-cells">
          <span v-for="d in days" :key="d" :class="['wb-plan-c', { 'is-we': isWeekend(d), 'is-hol': holidays[d], 'is-today': d === today, 'is-hl': inRange(d, highlight?.from, highlight?.to) }]" />
          <component
            :is="interactive ? 'button' : 'div'"
            v-for="s in visibleSpans(p)"
            :key="s.id"
            :type="interactive ? 'button' : undefined"
            :data-id="s.id"
            :class="['wb-bar', { 'is-pend': s.pending && s.state !== 'rejected', 'is-rej': s.state === 'rejected', 'is-canc': s.state === 'cancel_requested', 'is-focus': focus === s.id }]"
            :title="`${p.name} · ${s.label}`"
            :aria-label="interactive ? `${p.name}, ${s.label}, ${formatPeriod(s.from, s.to, tag)}` : undefined"
            :style="{ ...leaveVars(s.color), left: `calc(${s.a} * var(--c) + 2px)`, width: `calc(${s.z - s.a + 1} * var(--c) - 4px)` }"
            @click="interactive && $emit('open', s.id)"
          >
            <span>{{ (s.z - s.a + 1) * col >= 130 ? s.label : (s.z - s.a + 1) * col >= 56 ? (s.shortLabel ?? s.label) : '' }}</span>
          </component>
        </div>
      </div>
      </template>
      <div v-if="presenceLabel" class="wb-plan-r wb-plan-ft" role="row">
        <span class="wb-plan-n small"><b>{{ presenceLabel }}</b></span>
        <span v-for="(p, i) in presence" :key="days[i]" :class="['wb-plan-p', { 'is-low': p?.low }]">
          <b v-if="p" class="wb-num caption">{{ p.n }}/{{ p.of }}</b>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wb-plan-g { background: var(--surface-2); }
.wb-plan-g .wb-plan-n { background: var(--surface-2); gap: var(--space-2); text-transform: uppercase; letter-spacing: .04em; color: var(--ink-2); padding-block: 4px; }
</style>
