<script setup lang="ts">
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { close, editId } = useLeavePanel()
const { profile } = useCurrentUser()
const { leaveTypes, fetchLeaveTypes } = useLeaveTypes()
const { balances, fetchBalances } = useLeaveBalances()
const { requests: mine, fetchMine } = useMyLeave()
const { events, fetchEvents } = useCalendar()
const { createRequest, updateRequest } = useLeaveRequests()
const { fetchCountry, holidaysOf } = useHolidays()
const toast = useToast()

const today = todayIso()
const year = Number(today.slice(0, 4))
const typeId = ref('')
const start = ref<string | null>(null)
const end = ref<string | null>(null)
const comment = ref('')
const startHalf = ref(false)
const endHalf = ref(false)
const country = computed(() => profile.value?.country ?? 'FR')
const holidays = computed(() => holidaysOf(country.value))
const editing = computed(() => mine.value.find(r => r.id === editId.value) ?? null)
const isSending = ref(false)
const serverError = ref<string | null>(null)

onMounted(async () => {
  await Promise.all([fetchLeaveTypes(), fetchBalances(), fetchMine(), fetchEvents(), fetchCountry(country.value)])
  if (editing.value) {
    // Edit mode: start from the pending request
    typeId.value = editing.value.leave_type_id
    start.value = editing.value.start_date
    end.value = editing.value.end_date
    startHalf.value = editing.value.start_half
    endHalf.value = editing.value.end_half
    comment.value = editing.value.comment ?? ''
    nextTick(() => { ready.value = true })
    return
  }
  nextTick(() => { ready.value = true })
  // Preselect the first type that still has days left
  const first = typeCards.value.find(c => (c.left ?? 0) > 0) ?? typeCards.value.find(c => !c.disabled)
  if (first && !typeId.value) typeId.value = first.id
})

/** Remaining days per type this year, pending requests reserved (same rule as the RPC) */
function remaining(id: string): number | null {
  const b = balances.value.find(x => x.leave_type_id === id)
  if (!b) return null
  const others = mine.value.filter(r => r.id !== editId.value)
  return Number(b.allocated_days) - Number(b.used_days) - reservedDays(others, id, year)
}

const typeCards = computed(() => leaveTypes.value.map((lt) => {
  const left = remaining(lt.id)
  return {
    id: lt.id,
    name: lt.name,
    color: lt.color,
    left,
    disabled: left === null,
    meta: left === null ? t('request.noBalance') : t('request.left', { n: fmtDays(left, tag.value) }, left),
  }
}))

const selectedType = computed(() => typeCards.value.find(c => c.id === typeId.value))
const lastDay = computed(() => end.value ?? start.value)
const singleDay = computed(() => !!start.value && start.value === lastDay.value)
// Half days: on a single day, "morning" = ends at noon, "afternoon" = starts at noon
const halfOptions = computed(() => [
  { value: 'full', label: t('request.fullDay') },
  ...(singleDay.value ? [{ value: 'am', label: t('request.morning') }] : []),
  { value: 'pm', label: t('request.afternoon') },
])
const endHalfOptions = computed(() => [{ value: 'full', label: t('request.fullDay') }, { value: 'am', label: t('request.morning') }])
const firstDayChoice = computed({
  get: () => (singleDay.value && endHalf.value ? 'am' : startHalf.value ? 'pm' : 'full'),
  set: (v: string) => {
    startHalf.value = v === 'pm'
    if (singleDay.value) endHalf.value = v === 'am'
  },
})
const lastDayChoice = computed({ get: () => (endHalf.value ? 'am' : 'full'), set: (v: string) => { endHalf.value = v === 'am' } })
// Switching between one day and a period resets the half-day choice
// (not while the edit mode loads the request)
const ready = ref(false)
watch(singleDay, () => {
  if (!ready.value) return
  startHalf.value = false
  endHalf.value = false
})
const days = computed(() => (start.value && lastDay.value ? countLeaveDays(start.value, lastDay.value, holidays.value, startHalf.value, endHalf.value) : 0))
const sameYear = computed(() => !start.value || start.value.slice(0, 4) === lastDay.value?.slice(0, 4))
const countsOnBalance = computed(() => !!start.value && Number(start.value.slice(0, 4)) === year && selectedType.value?.left != null)
const after = computed(() => (selectedType.value?.left ?? 0) - days.value)
const tooMany = computed(() => countsOnBalance.value && after.value < 0)

// Own requests block their days; colleagues' approved leave is flagged, not blocked
const blocked = computed(() => mine.value
  .filter(r => r.status !== 'rejected' && r.status !== 'cancelled' && r.id !== editId.value)
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
  if (!days.value) return t('request.noWorkingDay')
  return `${t('leave.workingDays', { n: fmtDays(days.value, tag.value) }, days.value)} · ${formatPeriod(start.value, lastDay.value, tag.value)}`
})
const invalid = computed(() => !typeId.value || !days.value || tooMany.value || !sameYear.value || crossesBlocked.value)
const title = computed(() => (editing.value ? t('request.editTitle') : t('nav.leave')))
const approvalNote = computed(() => (profile.value?.role === 'manager' ? t('request.byAdmin') : t('request.byManager')))

async function send() {
  if (invalid.value || !start.value || !lastDay.value) return
  isSending.value = true
  serverError.value = null
  try {
    const input = { leaveTypeId: typeId.value, startDate: start.value, endDate: lastDay.value, comment: comment.value.trim() || null, startHalf: startHalf.value, endHalf: endHalf.value }
    if (editing.value) await updateRequest(editing.value.id, input)
    else await createRequest(input)
    await Promise.all([fetchMine(), fetchBalances()])
    toast.add(editing.value ? t('request.updated') : t('request.sent'))
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
  <WbSidePanel :title="title" :width="760" @close="close">
    <fieldset class="wb-req-types">
      <legend class="h3">{{ t('request.type') }}</legend>
      <div class="wb-req-grid">
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
        :holidays="holidays"
      />
      <div v-if="start" class="wb-rp-half">
        <div>
          <span class="caption wb-mut">{{ singleDay ? t('request.theDay') : t('request.firstDay') }}</span>
          <WbSegmented v-model="firstDayChoice" :options="halfOptions" :label="singleDay ? t('request.theDay') : t('request.firstDay')" />
        </div>
        <div v-if="!singleDay">
          <span class="caption wb-mut">{{ t('request.lastDay') }}</span>
          <WbSegmented v-model="lastDayChoice" :options="endHalfOptions" :label="t('request.lastDay')" />
        </div>
      </div>
    </div>

    <div class="wb-card wb-card-b wb-stack-s wb-req-sum">
      <p class="h3 wb-num" aria-live="polite">{{ summary }}</p>
      <p v-if="countsOnBalance && days && !tooMany">{{ t('request.after') }} <b class="wb-num">{{ t('leave.days', { n: fmtDays(after, tag) }, after) }}</b></p>
      <WbBanner v-if="tooMany" tone="danger" :title="t('request.tooManyTitle')">
        {{ t('request.tooManyText', { n: fmtDays(selectedType?.left ?? 0, tag) }, selectedType?.left ?? 0) }}
      </WbBanner>
      <WbBanner v-if="!sameYear" tone="danger">{{ t('request.twoYears') }}</WbBanner>
      <WbBanner v-if="crossesBlocked" tone="danger">{{ t('request.overlapOwn') }}</WbBanner>
      <WbBanner v-if="clashNames.length" tone="warning">{{ t('request.clash', { who: clashNames.join(', ') }) }}</WbBanner>
    </div>

    <WbTextarea v-model="comment" :label="t('request.comment')" :max="500" :rows="2" />
    <WbBanner v-if="serverError" tone="danger">{{ serverError }}</WbBanner>

    <div class="wb-panel-f">
      <p class="small wb-mut2">{{ approvalNote }}</p>
      <WbButton block size="lg" :disabled="invalid" :loading="isSending" @click="send">{{ editing ? t('request.saveChanges') : t('request.submit') }}</WbButton>
    </div>
  </WbSidePanel>
</template>

<style scoped>
.wb-req-types { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.wb-req-types legend { padding: 0 0 8px; }
.wb-req-sum { background: var(--bg); box-shadow: none; }
/* Dense type picker: 3 columns, compact cards */
.wb-req-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.wb-req-grid :deep(.wb-rc) { min-height: 44px; padding: 6px 10px; gap: 8px; }
.wb-req-grid :deep(.wb-rc .h3) { font-size: 13px; line-height: 18px; }
.wb-req-grid :deep(.wb-rc .small) { font-size: 12px; }
.wb-req-grid :deep(.wb-rc .wb-rc-b) { flex-direction: column; }
/* Compact calendar cells (still 36 px targets) */
:deep(.wb-rp-d) { height: 36px; }
:deep(.wb-rp-d span) { width: 32px; height: 32px; }
:deep(.wb-rp-ms) { gap: var(--space-5); }
@container wbapp (max-width: 767px) {
  .wb-req-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  :deep(.wb-rp-d) { height: 44px; }
}
</style>
