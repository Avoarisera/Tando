<script setup lang="ts">
export interface BlockedRange { from: string, to: string, name: string }

const props = withDefaults(defineProps<{
  month: string
  months?: number
  today: string
  /** Days before this one cannot be picked */
  minDate?: string
  holidays?: Record<string, string>
  blocked?: BlockedRange[]
  /** Day → text, e.g. "Eddy absent" */
  conflicts?: Record<string, string>
}>(), { months: 2, holidays: () => ({}), blocked: () => [], conflicts: () => ({}) })

const start = defineModel<string | null>('start', { default: null })
const end = defineModel<string | null>('end', { default: null })
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

const offset = ref(0)
const shown = computed(() => Array.from({ length: props.months }, (_, i) => shiftMonth(props.month, i + offset.value)))
const labels = computed(() => weekdayLabels(tag.value))

function blockedName(d: string) {
  return props.blocked.find(b => inRange(d, b.from, b.to))?.name
}

function dayInfo(d: string) {
  const weekend = isWeekend(d)
  const holiday = props.holidays[d]
  const blocked = blockedName(d)
  const past = !!props.minDate && d < props.minDate
  const selected = d === start.value || d === end.value || inRange(d, start.value, end.value)
  const title = holiday ? `${fmtDay(d, tag.value)} · ${holiday}` : blocked ?? props.conflicts[d]
  return { weekend, holiday, blocked, past, off: weekend || !!holiday || !!blocked || past, selected, title }
}

function pick(d: string) {
  if (!start.value || end.value) {
    start.value = d
    end.value = null
  }
  else if (d < start.value) {
    end.value = start.value
    start.value = d
  }
  else {
    end.value = d
  }
}

function lead(m: string) {
  return dayOfWeek(monthDays(m)[0]!)
}
</script>

<template>
  <div class="wb-rp">
    <div class="wb-rp-nav">
      <WbButton variant="ghost" size="sm" icon="chevron-left" icon-only @click="offset--">{{ t('picker.prev') }}</WbButton>
      <WbButton variant="ghost" size="sm" icon="chevron-right" icon-only @click="offset++">{{ t('picker.next') }}</WbButton>
    </div>
    <div class="wb-rp-ms">
      <div v-for="m in shown" :key="m" class="wb-rp-m">
        <div class="wb-rp-t h3">{{ fmtMonth(`${m}-01`, tag) }}</div>
        <div class="wb-rp-g" role="group" :aria-label="fmtMonth(`${m}-01`, tag)">
          <span v-for="w in labels" :key="w" class="wb-rp-w caption" aria-hidden="true">{{ w }}</span>
          <span v-for="i in lead(m)" :key="`l${i}`" />
          <button
            v-for="d in monthDays(m)"
            :key="d"
            type="button"
            :disabled="dayInfo(d).off"
            :title="dayInfo(d).title"
            :aria-pressed="dayInfo(d).selected"
            :aria-label="fmtDay(d, tag) + (dayInfo(d).title ? ` · ${dayInfo(d).title}` : '')"
            :data-date="d"
            :class="['wb-rp-d', {
              'is-we': dayInfo(d).weekend || dayInfo(d).past,
              'is-hol': dayInfo(d).holiday,
              'is-bl': dayInfo(d).blocked,
              'is-sel': dayInfo(d).selected,
              'is-a': d === start,
              'is-b': d === end || (!end && d === start),
              'is-today': d === today,
            }]"
            @click="pick(d)"
          >
            <span class="wb-num">{{ +d.slice(8) }}</span>
            <i v-if="conflicts[d]" class="wb-rp-c" />
          </button>
        </div>
      </div>
    </div>
    <div class="wb-rp-lg caption">
      <span><i class="wb-lg wb-lg-off" />{{ t('picker.off') }}</span>
      <span><i class="wb-lg wb-lg-bl" />{{ t('picker.blocked') }}</span>
      <span><i class="wb-rp-c wb-lg-c" />{{ t('picker.colleague') }}</span>
    </div>
  </div>
</template>
