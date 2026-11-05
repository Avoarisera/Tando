<script setup lang="ts">
import type { LeaveType } from '~/types/index'

definePageMeta({ titleKey: 'nav.rules', middleware: 'admin-only', layout: 'private' })

const { t } = useI18n()
const { leaveTypes, isLoading, error, fetchLeaveTypes, createLeaveType, updateLeaveType, toggleLeaveType } = useLeaveTypes()
const { adminBalances, isLoadingAdmin, adminError, fetchAdminBalances, updateAllocatedDays, upsertTypeBalances } = useLeaveBalances()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const tab = computed<'types' | 'balances'>({
  get: () => (route.query.tab === 'balances' ? 'balances' : 'types'),
  set: (v) => { router.replace({ query: { ...route.query, tab: v } }) },
})
const tabs = computed(() => [
  { id: 'types', label: t('rules.tabTypes'), count: leaveTypes.value.length },
  { id: 'balances', label: t('rules.tabBalances') },
])

onMounted(() => fetchLeaveTypes(false))

// ── Types ────────────────────────────────────────────────────────────────────
const editing = ref<LeaveType | null>(null)
const creating = ref(false)
const formName = ref('')
const formColor = ref('#007840')
const formError = ref<string | null>(null)
const isSaving = ref(false)
const togglingId = ref<string | null>(null)
const allInactive = computed(() => leaveTypes.value.length > 0 && leaveTypes.value.every(x => !x.is_active))

function startCreate() {
  editing.value = null
  creating.value = true
  formName.value = ''
  formColor.value = '#007840'
  formError.value = null
}
function startEdit(type: LeaveType) {
  creating.value = false
  editing.value = type
  formName.value = type.name
  formColor.value = type.color
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
      await updateLeaveType(editing.value.id, formName.value.trim(), formColor.value)
      toast.add(t('rules.typeSaved'))
    }
    else {
      await createLeaveType(formName.value.trim(), formColor.value)
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

// ── Balances ─────────────────────────────────────────────────────────────────
const year = ref(new Date().getFullYear())
const typeId = ref('')
const yearOptions = computed(() => [year.value - 1, year.value, year.value + 1].map(y => ({ value: String(y), label: String(y) })))
const yearModel = computed({ get: () => String(year.value), set: (v: string) => { year.value = Number(v) } })
const typeOptions = computed(() => leaveTypes.value.map(x => ({ value: x.id, label: x.name })))

watch([tab, year], ([tb]) => { if (tb === 'balances') fetchAdminBalances(year.value) }, { immediate: true })
watch(leaveTypes, (types) => { if (!typeId.value && types[0]) typeId.value = types[0].id }, { immediate: true })

const rows = computed(() => adminBalances.value
  .filter(b => b.leave_type_id === typeId.value)
  .map(b => ({ ...b, name: fullName(b.profiles), left: b.allocated_days - b.used_days }))
  .sort((a, b) => a.name.localeCompare(b.name)))

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
    <div class="wb-row-b wb-wrap">
      <WbTabs v-model="tab" :tabs="tabs" :label="t('nav.rules')" />
      <WbButton v-if="tab === 'types'" icon="plus" @click="startCreate">{{ t('rules.addType') }}</WbButton>
    </div>

    <!-- Types -->
    <template v-if="tab === 'types'">
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
                <tr v-for="lt in leaveTypes" :key="lt.id" :class="{ 'is-sel': editing?.id === lt.id }" :data-type="lt.name">
                  <td><WbTypeBadge :name="lt.name" :color="lt.color" /></td>
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
        </WbCard>

        <WbCard v-if="editing || creating" :title="editing ? t('rules.editTitle', { name: editing.name }) : t('rules.addType')">
          <form class="wb-stack-s" novalidate @submit.prevent="save">
            <WbInput id="type-name" v-model="formName" :label="t('rules.name')" :error="formError" maxlength="60" />
            <WbColorPicker v-model="formColor" :label="t('rules.color')" />
            <div class="wb-row" style="gap: 8px">
              <WbButton type="submit" :loading="isSaving">{{ t('rules.save') }}</WbButton>
              <WbButton variant="ghost" @click="stopEdit">{{ t('approvals.cancel') }}</WbButton>
            </div>
          </form>
        </WbCard>
      </div>
    </template>

    <!-- Balances -->
    <template v-else>
      <div class="wb-row-b wb-wrap">
        <div class="wb-row wb-wrap">
          <WbSelect v-model="yearModel" :options="yearOptions" :aria-label="t('rules.year')" />
          <WbSelect v-model="typeId" :options="typeOptions" :aria-label="t('calendar.type')" />
        </div>
        <form class="wb-row wb-wrap" novalidate @submit.prevent="applyAll">
          <WbInput v-model="bulk" inputmode="numeric" :aria-label="t('rules.applyAllDays')" :placeholder="t('rules.applyAllDays')" :error="bulkError" style="width: 140px" />
          <WbButton type="submit" variant="secondary" :loading="bulkSaving" :disabled="!typeId">{{ t('rules.applyAll') }}</WbButton>
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
              <tr v-for="b in rows" :key="b.id" :data-person="b.name">
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
                <td class="is-r wb-num" :class="{ 'wb-c-danger': b.left <= 0 }"><b>{{ b.left }}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </WbCard>
    </template>
  </div>
</template>

<style scoped>
.wb-edit-n { all: unset; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; padding: 4px 8px; border-radius: var(--radius-sm); }
.wb-edit-n:hover { background: var(--surface-2); }
.wb-edit-n:focus-visible { outline: 2px solid var(--focus); }
</style>
