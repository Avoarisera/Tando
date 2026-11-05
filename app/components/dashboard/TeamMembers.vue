<script setup lang="ts">
/**
 * TND-26 — the manager's team, read-only: today's status, next leave and the
 * remaining balances of each member. A click opens the person's leave history.
 * Data comes through RLS (profiles, leave_requests, leave_balances of the team).
 */
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const supabase = useSupabaseClient()
const { members, fetchMembers } = useTeamMembers()
const { requests, fetchAll } = useApprovals()
const { profile } = useCurrentUser()

interface Bal { user_id: string, allocated_days: number, used_days: number, leave_types: { name: string, color: string, tracks_balance: boolean | null } | null }
const balances = ref<Bal[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
const today = todayIso()
const year = Number(today.slice(0, 4))

async function load() {
  isLoading.value = true
  error.value = null
  try {
    const [, , bals] = await Promise.all([
      fetchMembers(), fetchAll(),
      supabase.from('leave_balances').select('user_id, allocated_days, used_days, leave_types (name, color, tracks_balance)').eq('year', year),
    ])
    if (bals.error) throw bals.error
    balances.value = (bals.data ?? []) as unknown as Bal[]
  }
  catch (e) { error.value = errorMessage(e) }
  finally { isLoading.value = false }
}
onMounted(load)

const team = computed(() => members.value.filter(m => m.role !== 'admin' && m.team_id && m.team_id === profile.value?.team_id))
/** balance types shown as columns: tracked ones, in a stable order */
const types = computed(() => [...new Map(balances.value
  .filter(b => b.leave_types && b.leave_types.tracks_balance !== false && Number(b.allocated_days) > 0)
  .map(b => [b.leave_types!.name, b.leave_types!])).values()].sort((a, b) => a.name.localeCompare(b.name)))

const search = ref('')
const rows = computed(() => team.value
  .filter(m => textMatch(fullName(m), search.value))
  .map((m) => {
    const mine = requests.value.filter(r => r.user_id === m.id)
    const now = mine.find(r => (r.status === 'approved' || r.status === 'cancel_requested') && r.start_date <= today && r.end_date >= today)
    const next = mine.filter(r => (r.status === 'approved' || r.status === 'manager_approved' || r.status === 'pending') && r.start_date > today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    const left = Object.fromEntries(types.value.map((ty) => {
      const b = balances.value.find(x => x.user_id === m.id && x.leave_types?.name === ty.name)
      return [ty.name, b ? Number(b.allocated_days) - Number(b.used_days) : null]
    }))
    return { m, now, next, left }
  }))

// History panel
const openId = ref<string | null>(null)
const openMember = computed(() => team.value.find(m => m.id === openId.value) ?? null)
const history = computed(() => requests.value.filter(r => r.user_id === openId.value).sort((a, b) => b.start_date.localeCompare(a.start_date)))
</script>

<template>
  <section class="wb-card wb-tm" :aria-label="t('tnd26.members')">
    <header class="wb-card-h wb-row-b wb-wrap">
      <div>
        <h2 class="h2">{{ t('tnd26.members') }}</h2>
        <p class="small wb-mut2">{{ t('tnd26.membersSub', { n: team.length }, team.length) }}</p>
      </div>
      <WbInput v-model="search" class="wb-tm-search" icon="search" type="search" :aria-label="t('tnd26.search')" :placeholder="t('tnd26.search')" />
    </header>
    <div class="wb-card-b">
      <WbErrorState v-if="error" :message="error" @retry="load" />
      <WbSkeleton v-else-if="isLoading && !team.length" variant="table" />
      <p v-else-if="!rows.length" class="wb-mut">{{ t('tnd26.noMember') }}</p>
      <div v-else class="wb-scroll wb-dt">
        <table class="wb-tm-t">
          <caption class="wb-sr">{{ t('tnd26.members') }}</caption>
          <thead>
            <tr>
              <th>{{ t('tnd26.person') }}</th>
              <th>{{ t('tnd26.today') }}</th>
              <th>{{ t('tnd26.nextLeave') }}</th>
              <th v-for="ty in types" :key="ty.name" class="wb-num-c">{{ ty.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.m.id" :data-id="r.m.id">
              <td>
                <button type="button" class="wb-tm-who" @click="openId = r.m.id">
                  <WbAvatar :name="fullName(r.m)" :size="28" />
                  <span><b class="small">{{ fullName(r.m) }}</b><br><span class="caption wb-mut2">{{ t(`roles.${r.m.role}`) }}</span></span>
                </button>
              </td>
              <td>
                <WbBadge v-if="r.now" tone="warning" size="sm">{{ t('tnd26.awayUntil', { date: fmtShort(r.now.end_date, tag) }) }}</WbBadge>
                <WbBadge v-else tone="success" size="sm">{{ t('tnd26.present') }}</WbBadge>
              </td>
              <td class="small">
                <template v-if="r.next">
                  {{ formatPeriod(r.next.start_date, r.next.end_date, tag) }}
                  <span v-if="r.next.status !== 'approved'" class="caption wb-mut2"> · {{ t('leave.status.pending') }}</span>
                </template>
                <span v-else class="wb-mut">—</span>
              </td>
              <td v-for="ty in types" :key="ty.name" class="wb-num wb-num-c small">
                <span v-if="r.left[ty.name] !== null" :class="{ 'wb-c-danger': (r.left[ty.name] ?? 0) < 0 }">{{ fmtDays(r.left[ty.name] ?? 0, tag) }}</span>
                <span v-else class="wb-mut">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="caption wb-mut wb-tm-hint">{{ t('tnd26.readOnlyHint') }}</p>
    </div>

    <WbSidePanel v-if="openMember" :title="fullName(openMember)" :subtitle="t(`roles.${openMember.role}`)" @close="openId = null">
      <p v-if="!history.length" class="wb-mut">{{ t('tnd26.noHistory') }}</p>
      <ul v-else class="wb-list wb-tm-h">
        <li v-for="h in history" :key="h.id">
          <WbTypeBadge :name="h.leave_types?.name ?? ''" :color="h.leave_types?.color" />
          <span class="wb-grow small">{{ formatPeriod(h.start_date, h.end_date, tag) }} · {{ t('leave.workingDays', { n: fmtDays(Number(h.days_count), tag) }, Number(h.days_count)) }}</span>
          <WbStatusBadge :status="h.status" />
        </li>
      </ul>
    </WbSidePanel>
  </section>
</template>

<style scoped>
.wb-tm-search { max-width: 280px; }
.wb-tm-t { width: 100%; }
.wb-tm-t th, .wb-tm-t td { white-space: nowrap; }
.wb-num-c { text-align: right; }
.wb-tm-who { display: inline-flex; align-items: center; gap: var(--space-2); padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.wb-tm-who:hover b { color: var(--brand-text); }
.wb-tm-hint { margin-top: var(--space-3); }
.wb-tm-h li { gap: var(--space-2); padding-block: 8px; }
.wb-tm-h li + li { border-top: 1px solid var(--border); }
</style>
