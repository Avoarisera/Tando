<script setup lang="ts">
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { close } = useLeavePanel()
const { profile } = useCurrentUser()
const { leaveTypes, fetchLeaveTypes } = useLeaveTypes()
const { balances, fetchBalances } = useLeaveBalances()
const { requests: mine, fetchMine } = useMyLeave()
const { events, fetchEvents } = useCalendar()
const { createRequest } = useLeaveRequests()
const toast = useToast()

const today = todayIso()
const year = Number(today.slice(0, 4))
const typeId = ref('')
const start = ref<string | null>(null)
const end = ref<string | null>(null)
const comment = ref('')
const isSending = ref(false)
const serverError = ref<string | null>(null)

onMounted(async () => {
  await Promise.all([fetchLeaveTypes(), fetchBalances(), fetchMine(), fetchEvents()])
  // Preselect the first type that still has days left
  const first = typeCards.value.find(c => (c.left ?? 0) > 0) ?? typeCards.value.find(c => !c.disabled)
  if (first && !typeId.value) typeId.value = first.id
})

/** Remaining days per type this year, pending requests reserved (same rule as the RPC) */
function remaining(id: string): number | null {
  const b = balances.value.find(x => x.leave_type_id === id)
  if (!b) return null
  return b.allocated_days - b.used_days - reservedDays(mine.value, id, year)
}

const typeCards = computed(() => leaveTypes.value.map((lt) => {
  const left = remaining(lt.id)
  return {
    id: lt.id,
    name: lt.name,
    color: lt.color,
    left,
    disabled: left === null,
    meta: left === null ? t('request.noBalance') : t('request.left', { n: left }, left),
  }
}))

const selectedType = computed(() => typeCards.value.find(c => c.id === typeId.value))
const lastDay = computed(() => end.value ?? start.value)
const days = computed(() => (start.value && lastDay.value ? calendarDays(start.value, lastDay.value) : 0))
const sameYear = computed(() => !start.value || start.value.slice(0, 4) === lastDay.value?.slice(0, 4))
const countsOnBalance = computed(() => !!start.value && Number(start.value.slice(0, 4)) === year && selectedType.value?.left != null)
const after = computed(() => (selectedType.value?.left ?? 0) - days.value)
const tooMany = computed(() => countsOnBalance.value && after.value < 0)

// Own requests block their days; colleagues' approved leave is flagged, not blocked
const blocked = computed(() => mine.value
  .filter(r => r.status !== 'rejected')
  .map(r => ({ from: r.start_date, to: r.end_date, name: t('request.alreadyBooked') })))
const conflicts = computed(() => {
  const map: Record<string, string> = {}
  for (const e of events.value) {
    if (e.isOwn || e.status !== 'approved') continue
    let d = e.startDate
    while (d <= e.endDate) {
      const first = e.employeeName.split(' ')[0] ?? e.employeeName
      map[d] = map[d] ? `${map[d]}, ${first}` : t('request.away', { who: first })
      d = addDays(d, 1)
    }
  }
  return map
})
const clashNames = computed(() => {
  if (!start.value || !lastDay.value) return []
  const names = new Set<string>()
  for (const e of events.value) {
    if (e.isOwn || e.status !== 'approved') continue
    if (e.startDate <= lastDay.value && e.endDate >= start.value) names.add(e.employeeName.split(' ')[0] ?? e.employeeName)
  }
  return [...names]
})
const crossesBlocked = computed(() => !!start.value && !!lastDay.value
  && blocked.value.some(b => b.from <= lastDay.value! && b.to >= start.value!))

const summary = computed(() => {
  if (!start.value || !lastDay.value) return t('request.pickDates')
  return `${t('leave.days', { n: days.value }, days.value)} · ${formatPeriod(start.value, lastDay.value, tag.value)}`
})
const invalid = computed(() => !typeId.value || !days.value || tooMany.value || !sameYear.value || crossesBlocked.value)
const approvalNote = computed(() => (profile.value?.role === 'manager' ? t('request.byAdmin') : t('request.byManager')))

async function send() {
  if (invalid.value || !start.value || !lastDay.value) return
  isSending.value = true
  serverError.value = null
  try {
    await createRequest({ leaveTypeId: typeId.value, startDate: start.value, endDate: lastDay.value, comment: comment.value.trim() || null })
    await Promise.all([fetchMine(), fetchBalances()])
    toast.add(t('request.sent'))
    close()
  }
  catch (e) {
    serverError.value = e instanceof Error ? e.message : t('request.error')
  }
  finally {
    isSending.value = false
  }
}
</script>

<template>
  <WbSidePanel :title="t('nav.leave')" :width="760" @close="close">
    <fieldset class="wb-req-types">
      <legend class="h3">{{ t('request.type') }}</legend>
      <div class="wb-grid wb-cols-2" style="gap: 8px">
        <WbRadioCard
          v-for="c in typeCards"
          :key="c.id"
          v-model="typeId"
          name="leave-type"
          :value="c.id"
          :title="c.name"
          :meta="c.meta"
          :color="c.color"
          :disabled="c.disabled"
        />
      </div>
    </fieldset>

    <div class="wb-stack-s">
      <h3 class="h3">{{ t('request.period') }}</h3>
      <WbDateRangePicker
        v-model:start="start"
        v-model:end="end"
        :month="today.slice(0, 7)"
        :today="today"
        :min-date="today"
        :blocked="blocked"
        :conflicts="conflicts"
      />
    </div>

    <div class="wb-card wb-card-b wb-stack-s wb-req-sum">
      <p class="h3 wb-num" aria-live="polite">{{ summary }}</p>
      <p v-if="countsOnBalance && days && !tooMany">{{ t('request.after') }} <b class="wb-num">{{ t('leave.days', { n: after }, after) }}</b></p>
      <WbBanner v-if="tooMany" tone="danger" :title="t('request.tooManyTitle')">
        {{ t('request.tooManyText', { n: selectedType?.left ?? 0 }, selectedType?.left ?? 0) }}
      </WbBanner>
      <WbBanner v-if="!sameYear" tone="danger">{{ t('request.twoYears') }}</WbBanner>
      <WbBanner v-if="crossesBlocked" tone="danger">{{ t('request.overlapOwn') }}</WbBanner>
      <WbBanner v-if="clashNames.length" tone="warning">{{ t('request.clash', { who: clashNames.join(', ') }) }}</WbBanner>
    </div>

    <WbTextarea v-model="comment" :label="t('request.comment')" :max="500" />
    <WbBanner v-if="serverError" tone="danger">{{ serverError }}</WbBanner>

    <div class="wb-panel-f">
      <p class="small wb-mut2">{{ approvalNote }}</p>
      <WbButton block size="lg" :disabled="invalid" :loading="isSending" @click="send">{{ t('request.submit') }}</WbButton>
    </div>
  </WbSidePanel>
</template>

<style scoped>
.wb-req-types { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.wb-req-types legend { padding: 0 0 8px; }
.wb-req-sum { background: var(--bg); box-shadow: none; }
</style>
