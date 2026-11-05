<script setup lang="ts">
import type { LeaveType } from '~/types/index'

definePageMeta({ titleKey: 'nav.rules', middleware: 'admin-only', layout: 'private' })

const { t } = useI18n()
const { leaveTypes, isLoading, error, fetchLeaveTypes, createLeaveType, updateLeaveType, toggleLeaveType } = useLeaveTypes()
const { adminBalances, isLoadingAdmin, adminError, fetchAdminBalances, updateAllocatedDays, upsertTypeBalances } = useLeaveBalances()
const toast = useToast()
const route = useRoute()
const router = useRouter()

type RulesTab = 'types' | 'balances' | 'holidays'
const tab = computed<RulesTab>({
  get: () => (route.query.tab === 'balances' || route.query.tab === 'holidays' ? route.query.tab : 'types'),
  set: (v) => { router.replace({ query: { ...route.query, tab: v } }) },
})
const tabs = computed(() => [
  { id: 'types', label: t('rules.tabTypes'), count: leaveTypes.value.length },
  { id: 'balances', label: t('rules.tabBalances') },
  { id: 'holidays', label: t('rules.tabHolidays') },
])

onMounted(() => fetchLeaveTypes(false))

// ── Types ────────────────────────────────────────────────────────────────────
const editing = ref<LeaveType | null>(null)
const creating = ref(false)
const formName = ref('')
const formColor = ref('#007840')
const formTracks = ref(true)
const formError = ref<string | null>(null)
const isSaving = ref(false)
const togglingId = ref<string | null>(null)
const allInactive = computed(() => leaveTypes.value.length > 0 && leaveTypes.value.every(x => !x.is_active))

function startCreate() {
  editing.value = null
  creating.value = true
  formName.value = ''
  formColor.value = '#007840'
  formTracks.value = true
  formError.value = null
}
function startEdit(type: LeaveType) {
  creating.value = false
  editing.value = type
  formName.value = type.name
  formColor.value = type.color
  formTracks.value = type.tracks_balance !== false
  formError.value = null
}
function stopEdit() {
  editing.value = null
  creating.value = false
}

async function save() {
  if (!formName.value.trim()) {
    formError.value = t('rules.nameRequired')
    return
  }
  isSaving.value = true
  formError.value = null
  try {
    if (editing.value) {
      await updateLeaveType(editing.value.id, formName.value.trim(), formColor.value, formTracks.value)
      toast.add(t('rules.typeSaved'))
    }
    else {
      await createLeaveType(formName.value.trim(), formColor.value, formTracks.value)
      toast.add(t('rules.typeAdded'))
    }
    stopEdit()
    await fetchLeaveTypes(false)
  }
  catch (e) {
    formError.value = e instanceof Error ? e.message : t('rules.saveError')
  }
  finally {
    isSaving.value = false
  }
}

async function toggle(type: LeaveType) {
  togglingId.value = type.id
  try {
    await toggleLeaveType(type.id, !type.is_active)
    toast.add(type.is_active ? t('rules.deactivated') : t('rules.activated'))
    await fetchLeaveTypes(false)
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : t('rules.saveError'), 'error')
  }
  finally {
    togglingId.value = null
  }
}

// ── Public holidays (lot R8) ─────────────────────────────────────────────────
const { all: holidays, fetchAll: fetchHolidays, add: addHoliday, remove: removeHoliday } = useHolidays()
const hCountry = ref<string>('FR')
const hYear = ref(String(new Date().getFullYear()))
const countryOptions = computed(() => COUNTRIES.map(c => ({ value: c, label: t(`countries.${c}`) })))
const hYearOptions = computed(() => {
  const y = new Date().getFullYear()
  return [y - 1, y, y + 1].map(v => ({ value: String(v), label: String(v) }))
})
const hLoading = ref(false)
const hError = ref<string | null>(null)
async function loadHolidays() {
  hLoading.value = true
  hError.value = null
  try { await fetchHolidays(hCountry.value, Number(hYear.value)) }
  catch (e) { hError.value = errorMessage(e) }
  finally { hLoading.value = false }
}
watch([tab, hCountry, hYear], ([tb]) => { if (tb === 'holidays') loadHolidays() }, { immediate: true })
const newDay = ref('')
const newName = ref('')
const hFormError = ref<string | null>(null)
async function saveHoliday() {
  if (!newDay.value || !newName.value.trim()) {
    hFormError.value = t('rules.holidayRequired')
    return
  }
  hFormError.value = null
  try {
    const added = newDay.value
    await addHoliday(hCountry.value, added, newName.value.trim())
    toast.add(t('rules.holidayAdded'))
    newDay.value = ''
    newName.value = ''
    await loadHolidays()
    holidaysPager.showIndex(holidays.value.findIndex(h => h.day === added))
  }
  catch (e) { hFormError.value = e instanceof Error ? e.message : t('rules.saveError') }
}
async function deleteHoliday(day: string) {
  try {
    await removeHoliday(hCountry.value, day)
    toast.add(t('rules.holidayRemoved'))
    await loadHolidays()
  }
  catch (e) { toast.add(e instanceof Error ? e.message : t('rules.saveError'), 'error') }
}
const { locale } = useI18n()
const htag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

// ── Balances ─────────────────────────────────────────────────────────────────
const year = ref(new Date().getFullYear())
const typeId = ref('')
const yearOptions = computed(() => [year.value - 1, year.value, year.value + 1].map(y => ({ value: String(y), label: String(y) })))
const yearModel = computed({ get: () => String(year.value), set: (v: string) => { year.value = Number(v) } })
const typeOptions = computed(() => leaveTypes.value.filter(x => x.tracks_balance !== false).map(x => ({ value: x.id, label: x.name })))
const overOnly = ref(false)
const balanceSearch = ref('')

watch([tab, year], ([tb]) => { if (tb === 'balances') fetchAdminBalances(year.value) }, { immediate: true })
watch(leaveTypes, (types) => { const first = types.find(x => x.tracks_balance !== false); if (!typeId.value && first) typeId.value = first.id }, { immediate: true })

const rows = computed(() => adminBalances.value
  .filter(b => b.leave_type_id === typeId.value)
  .map(b => ({ ...b, name: fullName(b.profiles), left: b.allocated_days - b.used_days }))
  .filter(b => !overOnly.value || b.left < 0)
  .filter(b => textMatch(b.name, balanceSearch.value))
  .sort((a, b) => a.name.localeCompare(b.name)))
const overCount = computed(() => adminBalances.value.filter(b => b.leave_type_id === typeId.value && b.allocated_days - b.used_days < 0).length)

// Tables: 20 rows per page, count and pages under each table
const typesPager = usePagination(leaveTypes)
const holidaysPager = usePagination(holidays)
const balancesPager = usePagination(rows)

function validDays(v: string): number | null {
  if (!/^\d+$/.test(v.trim())) return null
  return Number(v)
}

const drafts = ref<Record<string, string>>({})
const draftErrors = ref<Record<string, string>>({})
const savingId = ref<string | null>(null)

async function saveRow(id: string) {
  const days = validDays(drafts.value[id] ?? '')
  if (days === null) {
    draftErrors.value[id] = t('rules.daysInvalid')
    return
  }
  delete draftErrors.value[id]
  savingId.value = id
  try {
    await updateAllocatedDays(id, days)
    toast.add(t('rules.balanceSaved'))
    delete drafts.value[id]
    await fetchAdminBalances(year.value)
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : t('rules.saveError'), 'error')
  }
  finally {
    savingId.value = null
  }
}

const bulk = ref('')
const bulkError = ref<string | null>(null)
const bulkSaving = ref(false)
async function applyAll() {
  const days = validDays(bulk.value)
  if (days === null) {
    bulkError.value = t('rules.daysInvalid')
    return
  }
  bulkError.value = null
  bulkSaving.value = true
  try {
    await upsertTypeBalances(typeId.value, year.value, days)
    toast.add(t('rules.appliedAll'))
    bulk.value = ''
    await fetchAdminBalances(year.value)
  }
  catch (e) {
    toast.add(e instanceof Error ? e.message : t('rules.saveError'), 'error')
  }
  finally {
    bulkSaving.value = false
  }
}
</script>

<template>
  <div class="wb-page wb-stack">
    <WbTabs v-model="tab" :tabs="tabs" :label="t('nav.rules')" />

    <!-- Types -->
    <template v-if="tab === 'types'">
      <div class="wb-adm-bar">
        <span class="small wb-mut2">{{ t('v2.typesHint') }}</span>
        <WbButton size="sm" icon="plus" @click="startCreate">{{ t('rules.addType') }}</WbButton>
      </div>
      <WbBanner v-if="allInactive" tone="warning">{{ t('rules.allInactive') }}</WbBanner>
      <WbErrorState v-if="error" :message="error" @retry="fetchLeaveTypes(false)" />
      <WbSkeleton v-else-if="isLoading && !leaveTypes.length" variant="table" />
      <div v-else :class="editing || creating ? 'wb-split' : undefined">
        <WbCard :pad="false">
          <div class="wb-scroll wb-dt">
            <table>
              <caption class="wb-sr">{{ t('rules.tabTypes') }}</caption>
              <thead>
                <tr>
                  <th scope="col">{{ t('rules.name') }}</th>
                  <th scope="col">{{ t('rules.status') }}</th>
                  <th scope="col" class="is-r">{{ t('rules.actions') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="lt in typesPager.items.value" :key="lt.id" :class="{ 'is-sel': editing?.id === lt.id }" :data-type="lt.name">
                  <td><span class="wb-row" style="gap: 6px"><WbTypeBadge :name="lt.name" :color="lt.color" /><span v-if="lt.tracks_balance === false" class="caption wb-mut2">{{ t('tnd23.noCount') }}</span></span></td>
                  <td>
                    <WbBadge :tone="lt.is_active ? 'success' : 'neutral'" :icon="lt.is_active ? 'circle-check' : 'ban'">
                      {{ lt.is_active ? t('rules.active') : t('rules.inactive') }}
                    </WbBadge>
                  </td>
                  <td class="is-r">
                    <div class="wb-row" style="justify-content: flex-end; gap: 4px">
                      <WbButton variant="ghost" size="sm" icon="pencil" @click="startEdit(lt)">{{ t('rules.edit') }}</WbButton>
                      <WbButton variant="ghost" size="sm" :loading="togglingId === lt.id" @click="toggle(lt)">
                        {{ lt.is_active ? t('rules.deactivate') : t('rules.activate') }}
                      </WbButton>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <WbTableFooter v-model:page="typesPager.page.value" :total="typesPager.total.value" :page-size="typesPager.pageSize.value" />
        </WbCard>

        <WbCard v-if="editing || creating" :title="editing ? t('rules.editTitle', { name: editing.name }) : t('rules.addType')">
          <form class="wb-stack-s" novalidate @submit.prevent="save">
            <WbInput id="type-name" v-model="formName" :label="t('rules.name')" :error="formError" maxlength="60" />
            <WbColorPicker v-model="formColor" :label="t('rules.color')" />
            <div class="wb-stack-s" style="gap: 2px">
              <WbCheckbox v-model="formTracks" :label="t('tnd23.tracks')" />
              <p class="caption wb-mut2">{{ t('tnd23.tracksHint') }}</p>
            </div>
            <div class="wb-row" style="gap: 8px">
              <WbButton type="submit" size="sm" :loading="isSaving">{{ t('rules.save') }}</WbButton>
              <WbButton variant="ghost" size="sm" @click="stopEdit">{{ t('approvals.cancel') }}</WbButton>
            </div>
          </form>
        </WbCard>
      </div>
    </template>

    <!-- Public holidays -->
    <template v-else-if="tab === 'holidays'">
      <div class="wb-adm-bar">
        <div class="wb-row wb-wrap">
          <WbSelect v-model="hCountry" :options="countryOptions" :aria-label="t('rules.country')" />
          <WbSelect v-model="hYear" :options="hYearOptions" :aria-label="t('rules.year')" />
        </div>
        <form class="wb-row wb-wrap" novalidate @submit.prevent="saveHoliday">
          <WbInput id="holiday-day" v-model="newDay" type="date" :aria-label="t('rules.holidayDate')" />
          <WbInput id="holiday-name" v-model="newName" :aria-label="t('rules.holidayName')" :placeholder="t('rules.holidayName')" maxlength="80" />
          <WbButton type="submit" size="sm" icon="plus">{{ t('rules.addHoliday') }}</WbButton>
        </form>
      </div>
      <WbBanner v-if="hFormError" tone="danger">{{ hFormError }}</WbBanner>
      <p class="small wb-mut2">{{ t('rules.holidaysHint') }}</p>
      <WbErrorState v-if="hError" :message="hError" @retry="loadHolidays" />
      <WbSkeleton v-else-if="hLoading && !holidays.length" variant="table" />
      <p v-else-if="!holidays.length" class="wb-card wb-card-b wb-mut">{{ t('rules.noHolidays') }}</p>
      <WbCard v-else :pad="false">
        <div class="wb-scroll wb-dt">
          <table>
            <caption class="wb-sr">{{ t('rules.tabHolidays') }}</caption>
            <thead><tr><th scope="col">{{ t('rules.holidayDate') }}</th><th scope="col">{{ t('rules.holidayName') }}</th><th scope="col" class="is-r">{{ t('rules.actions') }}</th></tr></thead>
            <tbody>
              <tr v-for="h in holidaysPager.items.value" :key="h.day" :data-day="h.day">
                <td class="wb-num">{{ fmtDate(h.day, htag, { weekday: 'short', day: 'numeric', month: 'long' }) }}</td>
                <td>{{ h.name }}</td>
                <td class="is-r"><WbButton variant="ghost" size="sm" icon="trash-2" @click="deleteHoliday(h.day)">{{ t('rules.remove') }}</WbButton></td>
              </tr>
            </tbody>
          </table>
        </div>
        <WbTableFooter v-model:page="holidaysPager.page.value" :total="holidaysPager.total.value" :page-size="holidaysPager.pageSize.value" />
      </WbCard>
    </template>

    <!-- Balances -->
    <template v-else>
      <div class="wb-adm-bar">
        <div class="wb-row wb-wrap">
          <WbSelect v-model="yearModel" :options="yearOptions" :aria-label="t('rules.year')" />
          <WbSelect v-model="typeId" :options="typeOptions" :aria-label="t('calendar.type')" />
          <div class="wb-fb-s"><WbInput v-model="balanceSearch" icon="search" type="search" :aria-label="t('approvals.search')" :placeholder="t('approvals.search')" /></div>
          <WbFilterChip v-model="overOnly" :count="overCount">{{ t('tnd23.overFilter') }}</WbFilterChip>
        </div>
        <form class="wb-row wb-wrap" novalidate @submit.prevent="applyAll">
          <WbInput v-model="bulk" inputmode="numeric" :aria-label="t('rules.applyAllDays')" :placeholder="t('rules.applyAllDays')" :error="bulkError" style="width: 140px" />
          <WbButton type="submit" size="sm" variant="secondary" :loading="bulkSaving" :disabled="!typeId">{{ t('rules.applyAll') }}</WbButton>
        </form>
      </div>

      <WbErrorState v-if="adminError" :message="adminError" @retry="fetchAdminBalances(year)" />
      <WbSkeleton v-else-if="isLoadingAdmin && !rows.length" variant="table" />
      <p v-else-if="!rows.length" class="wb-card wb-card-b wb-mut">{{ t('rules.noBalances') }}</p>
      <WbCard v-else :pad="false">
        <div class="wb-scroll wb-dt">
          <table>
            <caption class="wb-sr">{{ t('rules.tabBalances') }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ t('dashboard.csv.person') }}</th>
                <th scope="col" class="is-r">{{ t('balance.allocated') }}</th>
                <th scope="col" class="is-r">{{ t('balance.used') }}</th>
                <th scope="col" class="is-r">{{ t('balance.left') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in balancesPager.items.value" :key="b.id" :data-person="b.name">
                <td><span class="wb-cp"><WbAvatar :name="b.name" :size="32" /><b class="small">{{ b.name }}</b></span></td>
                <td class="is-r">
                  <form v-if="drafts[b.id] !== undefined" class="wb-row" style="justify-content: flex-end; gap: 4px" novalidate @submit.prevent="saveRow(b.id)">
                    <WbInput v-model="drafts[b.id]" inputmode="numeric" :aria-label="t('rules.allocatedFor', { who: b.name })" :error="draftErrors[b.id]" style="width: 90px" />
                    <WbButton type="submit" size="sm" :loading="savingId === b.id">{{ t('rules.save') }}</WbButton>
                    <WbButton variant="ghost" size="sm" @click="delete drafts[b.id]">{{ t('approvals.cancel') }}</WbButton>
                  </form>
                  <button v-else type="button" class="wb-edit-n wb-num" :aria-label="t('rules.editAllocated', { who: b.name })" @click="drafts[b.id] = String(b.allocated_days)">
                    {{ b.allocated_days }} <WbIcon name="pencil" :size="14" />
                  </button>
                </td>
                <td class="is-r wb-num">{{ b.used_days }}</td>
                <td class="is-r wb-num" :class="{ 'wb-c-danger': b.left <= 0 }"><b>{{ b.left }}</b><span v-if="b.left < 0" class="caption"> · {{ t('tnd23.advance') }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <WbTableFooter v-model:page="balancesPager.page.value" :total="balancesPager.total.value" :page-size="balancesPager.pageSize.value" />
      </WbCard>
    </template>
  </div>
</template>

<style scoped>
/* Toolbar row: filters on the left, primary action on the right */
.wb-adm-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-3); padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.wb-adm-bar :deep(.wb-btn) { margin: 0; }
.wb-adm-bar :deep(.wb-row) { gap: var(--space-2); }
.wb-edit-n { all: unset; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; padding: 4px 8px; border-radius: var(--radius-sm); }
.wb-edit-n:hover { background: var(--surface-2); }
.wb-edit-n:focus-visible { outline: 2px solid var(--focus); }
</style>
