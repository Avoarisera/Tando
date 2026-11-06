<script setup lang="ts">
import type { HrPacket, ReviewCycle } from '~/composables/useReviews'
import { packetStep, type PacketStep } from '~/utils/reviews'

// HR — one campaign (TND-29): pick the people and launch (draft), then follow
// every packet step by step and open each file.
definePageMeta({ titleKey: 'nav.evaluations', layout: 'private', middleware: 'hr-access', key: r => String(r.params.id) })
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const route = useRoute()
const id = String(route.params.id)
const { getCycle, launchCycle, updateCycle, deleteCycle, remind, notify } = useReviews()
const { members, fetchMembers } = useTeamMembers()
const { teams, fetchTeams } = useTeams()

const cycle = ref<ReviewCycle | null>(null)
const packets = ref<HrPacket[]>([])
const responses = ref<{ packet_id: string, role: string, submitted_at: string | null }[]>([])
const error = ref<string | null>(null)
async function load() {
  error.value = null
  try {
    const r = await getCycle(id)
    if (!r.cycle) throw new Error(t('tnd29.cycle.notFound'))
    cycle.value = r.cycle
    packets.value = r.packets
    responses.value = r.responses
  }
  catch (e) { error.value = errorMessage(e) }
}
onMounted(() => { load(); fetchMembers(); fetchTeams() })
usePageHeader(() => ({ crumbs: [{ label: t('nav.evaluations'), to: '/evaluations' }, { label: cycle.value?.name ?? '…' }] }))

// ── Draft: who is reviewed ─────────────────────────────────────────────────
const people = computed(() => members.value.filter(m => m.role !== 'admin').slice().sort((a, b) => fullName(a).localeCompare(fullName(b))))
const picked = ref<string[]>([])
watch(people, (p) => { if (!picked.value.length) picked.value = p.map(x => x.id) }, { immediate: true })
const teamName = (tid: string | null) => teams.value.find(x => x.id === tid)?.name ?? t('r8a.people.noTeam')
const groups = computed(() => {
  const map = new Map<string, typeof people.value>()
  for (const p of people.value) map.set(teamName(p.team_id), [...(map.get(teamName(p.team_id)) ?? []), p])
  return [...map].sort((a, b) => a[0].localeCompare(b[0]))
})
const toggle = (pid: string, on: boolean) => { picked.value = on ? [...new Set([...picked.value, pid])] : picked.value.filter(x => x !== pid) }
const toggleGroup = (ids: string[], on: boolean) => { picked.value = on ? [...new Set([...picked.value, ...ids])] : picked.value.filter(x => !ids.includes(x)) }
const launching = ref(false)
const confirmLaunch = ref(false)
async function launch() {
  launching.value = true
  try {
    const n = await launchCycle(id, picked.value)
    const m = await notify()
    toast.add(`${t('tnd29.cycle.launched', { n }, n)} · ${m?.notConfigured ? t('tnd32.mail.notConfigured') : t('tnd32.mail.sent', { n: m?.sent ?? 0 }, m?.sent ?? 0)}`)
    confirmLaunch.value = false
    await load()
  }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { launching.value = false }
}
async function remove() {
  try { await deleteCycle(id); await navigateTo('/evaluations') }
  catch (e) { toast.add(errorMessage(e), 'error') }
}
async function close() {
  try { await updateCycle(id, { status: 'closed', closed_at: new Date().toISOString() }); toast.add(t('tnd29.cycle.closedToast')); await load() }
  catch (e) { toast.add(errorMessage(e), 'error') }
}

// reminder to everyone late (in-app + e-mail when the SMTP is set)
const reminding = ref(false)
async function doRemind() {
  reminding.value = true
  try {
    const r = await remind(id)
    toast.add(r.people ? t('tnd29.cycle.reminded', { n: r.people, mails: r.emailed }, r.people) : t('tnd29.cycle.nobodyLate'))
  }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { reminding.value = false }
}

// ── Active: follow-up ──────────────────────────────────────────────────────
const submitted = (pid: string, role: string) => responses.value.some(r => r.packet_id === pid && r.role === role && r.submitted_at)
const rows = computed(() => packets.value.map((p) => {
  const step = packetStep({ self_submitted: submitted(p.id, 'self'), manager_submitted: submitted(p.id, 'manager'), has_manager: !!p.manager_id, hr_done: !!p.hr_done_at && p.hr_rating !== null, shared: !!p.shared_at, acknowledged: !!p.acknowledged_at })
  return { p, step, name: p.employee ? `${p.employee.first_name} ${p.employee.last_name}` : '—', manager: p.manager ? `${p.manager.first_name} ${p.manager.last_name}` : t('tnd29.cycle.noManager') }
}).sort((a, b) => a.name.localeCompare(b.name)))
const stepFilter = ref<'all' | PacketStep>('all')
const stepOptions = computed(() => [{ value: 'all', label: t('tnd29.cycle.allSteps') }, ...(['self', 'manager', 'hr', 'ready', 'shared', 'acknowledged'] as const).map(s => ({ value: s, label: t(`tnd29.pstep.${s}`) }))])
const shown = computed(() => rows.value.filter(r => stepFilter.value === 'all' || r.step === stepFilter.value))
const stepTone = (s: PacketStep) => ({ self: 'warning', manager: 'warning', hr: 'info', ready: 'indigo', shared: 'success', acknowledged: 'success' }[s] as 'warning' | 'info' | 'indigo' | 'success')
const late = (due: string | null) => !!due && due < todayIso()
</script>

<template>
  <div class="wb-page wb-stack">
    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!cycle" variant="table" />
    <template v-else>
      <div class="wb-row-b wb-wrap">
        <div>
          <p class="small wb-mut2">{{ formatPeriod(cycle.period_start, cycle.period_end, tag) }} · {{ t(`tnd29.status.${cycle.status}`) }}</p>
          <p class="caption wb-mut">
            <template v-if="cycle.self_due">{{ t('tnd29.cycle.selfDue') }} : <b :class="{ 'wb-c-danger': cycle.status === 'active' && late(cycle.self_due) }">{{ fmtShort(cycle.self_due, tag) }}</b></template>
            <template v-if="cycle.peers_enabled && cycle.peer_due"> · {{ t('tnd29.cycle.peerDue') }} : <b>{{ fmtShort(cycle.peer_due, tag) }}</b></template>
            <template v-if="cycle.manager_due"> · {{ t('tnd29.cycle.managerDue') }} : <b>{{ fmtShort(cycle.manager_due, tag) }}</b></template>
            <template v-if="cycle.hr_due"> · {{ t('tnd29.cycle.hrDue') }} : <b>{{ fmtShort(cycle.hr_due, tag) }}</b></template>
          </p>
        </div>
        <div class="wb-row wb-wrap" style="gap: 8px">
          <template v-if="cycle.status === 'draft'">
            <WbButton variant="ghost" size="sm" icon="circle-x" @click="remove">{{ t('tnd29.cycle.delete') }}</WbButton>
            <WbButton size="sm" icon="send" :disabled="!picked.length" data-action="launch" @click="confirmLaunch = true">{{ t('tnd29.cycle.launch', { n: picked.length }, picked.length) }}</WbButton>
          </template>
          <WbButton v-if="cycle.status === 'active'" variant="secondary" size="sm" icon="bell" :loading="reminding" data-action="remind" @click="doRemind">{{ t('tnd29.cycle.remind') }}</WbButton>
          <WbButton v-if="cycle.status === 'active'" variant="secondary" size="sm" @click="close">{{ t('tnd29.cycle.close') }}</WbButton>
        </div>
      </div>

      <!-- draft: where we are (TND-32) -->
      <ol v-if="cycle.status === 'draft'" class="wb-cy-steps" :aria-label="t('tnd32.steps.label')">
        <li class="is-done"><WbIcon name="check" :size="14" /> {{ t('tnd32.steps.create') }}</li>
        <li class="is-cur"><b>2</b> {{ t('tnd32.steps.people') }}</li>
        <li><b>3</b> {{ t('tnd32.steps.launch') }}</li>
      </ol>
      <!-- draft: choose the people -->
      <section v-if="cycle.status === 'draft'" class="wb-card wb-cy-pick">
        <header class="wb-card-h"><h2 class="h3">{{ t('tnd29.cycle.who') }}</h2><p class="small wb-mut2">{{ t('tnd29.cycle.whoHint') }}</p></header>
        <div class="wb-card-b wb-cy-groups">
          <fieldset v-for="[g, list] in groups" :key="g" class="wb-cy-g">
            <legend class="small">
              <WbCheckbox :model-value="list.every(p => picked.includes(p.id))" :indeterminate="list.some(p => picked.includes(p.id)) && !list.every(p => picked.includes(p.id))" :label="`${g} (${list.length})`" @update:model-value="(v: boolean) => toggleGroup(list.map(p => p.id), v)" />
            </legend>
            <ul>
              <li v-for="p in list" :key="p.id"><WbCheckbox :model-value="picked.includes(p.id)" :label="fullName(p)" @update:model-value="(v: boolean) => toggle(p.id, v)" /></li>
            </ul>
          </fieldset>
        </div>
      </section>

      <!-- active / closed: follow-up -->
      <section v-else class="wb-card">
        <header class="wb-card-h wb-row-b wb-wrap">
          <h2 class="h3">{{ t('tnd29.cycle.packets', { n: packets.length }, packets.length) }}</h2>
          <WbSelect v-model="stepFilter" :options="stepOptions" :aria-label="t('tnd29.cycle.step')" />
        </header>
        <div class="wb-scroll wb-dt">
          <table>
            <caption class="wb-sr">{{ cycle.name }}</caption>
            <thead><tr><th>{{ t('tnd26.person') }}</th><th>{{ t('tnd29.syn.manager') }}</th><th>{{ t('tnd29.step.self') }}</th><th>{{ t('tnd29.step.manager') }}</th><th>{{ t('tnd29.cycle.step') }}</th><th class="is-r" /></tr></thead>
            <tbody>
              <tr v-for="r in shown" :key="r.p.id" :data-packet="r.name">
                <td><span class="wb-cp"><WbAvatar :name="r.name" :size="26" /><b class="small">{{ r.name }}</b></span></td>
                <td class="small">{{ r.manager }}</td>
                <td><WbIcon :name="submitted(r.p.id, 'self') ? 'circle-check' : 'clock'" :size="16" :class="submitted(r.p.id, 'self') ? 'wb-c-success' : 'wb-mut2'" /></td>
                <td><WbIcon v-if="r.p.manager_id" :name="submitted(r.p.id, 'manager') ? 'circle-check' : 'clock'" :size="16" :class="submitted(r.p.id, 'manager') ? 'wb-c-success' : 'wb-mut2'" /><span v-else class="caption wb-mut">—</span></td>
                <td><WbBadge :tone="stepTone(r.step)" size="sm">{{ t(`tnd29.pstep.${r.step}`) }}</WbBadge></td>
                <td class="is-r"><WbButton variant="ghost" size="sm" :to="`/evaluations/dossier/${r.p.id}`">{{ t('tnd29.cycle.open') }}</WbButton></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <WbModal v-if="confirmLaunch" :title="t('tnd29.cycle.launchTitle')" :description="t('tnd29.cycle.launchText', { n: picked.length }, picked.length)" @close="confirmLaunch = false">
      <template #footer>
        <WbButton variant="secondary" @click="confirmLaunch = false">{{ t('approvals.cancel') }}</WbButton>
        <WbButton icon="send" :loading="launching" data-action="confirm-launch" @click="launch">{{ t('tnd29.cycle.launchConfirm') }}</WbButton>
      </template>
    </WbModal>
  </div>
</template>

<style scoped>
.wb-cy-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
.wb-cy-steps li { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border: 1px solid var(--border); border-radius: var(--radius-pill); font-size: 13px; color: var(--ink-2); }
.wb-cy-steps li b { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--surface-2, #eef1f6); font-size: 12px; }
.wb-cy-steps li.is-done { border-color: var(--success-solid); color: var(--success-text, inherit); }
.wb-cy-steps li.is-cur { border-color: var(--brand); background: var(--brand-tint); color: inherit; font-weight: 600; }
.wb-cy-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-4); }
.wb-cy-g { border: 0; margin: 0; padding: 0; }
.wb-cy-g legend { padding: 0; margin-bottom: var(--space-2); font-weight: 650; }
.wb-cy-g ul { list-style: none; margin: 0; padding: 0 0 0 var(--space-4); display: flex; flex-direction: column; gap: 4px; }
</style>
