<script setup lang="ts">
import type { ApplicationRow, Interview } from '~/composables/useRecruitment'
import type { Opening } from '~/utils/recruitment'

/**
 * TND-30 lot 2 — interviews of an application: list (date, stage, interviewers,
 * place / video link) and, for HR or the hiring manager, planning and cancelling.
 * Interviewers are told in the app; the candidate optionally by e-mail.
 */
const props = defineProps<{ app: ApplicationRow, opening: Opening, canManage: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const { profile } = useCurrentUser()
const { members, fetchMembers } = useTeamMembers()
const { listInterviews, planInterview, cancelInterview } = useRecruitment()

const items = ref<Interview[]>([])
async function load() {
  try { items.value = await listInterviews(props.app.id) }
  catch (e) { toast.add(errorMessage(e), 'error') }
}
watch(() => props.app.id, load, { immediate: true })
onMounted(() => { if (props.canManage) fetchMembers() })

const fmt = (iso: string) => new Intl.DateTimeFormat(tag.value, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const upcoming = computed(() => items.value.filter(i => i.status !== 'cancelled'))
const cancelled = computed(() => items.value.filter(i => i.status === 'cancelled'))

// planning form
const planning = ref(false)
const stageOptions = computed(() => props.opening.stages.filter(s => !['new', 'hired'].includes(s.key)).map(s => ({ value: s.key, label: s.label })))
const defaultStart = () => {
  // next working day after tomorrow, 10:00
  const d = new Date(Date.now() + 2 * 86_400_000)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const form = reactive({ stage_key: '', starts_at: defaultStart(), duration_min: '45', location: '', video_url: '', notes: '', notify: true })
const participants = ref<string[]>([])
function openPlan() {
  form.stage_key = stageOptions.value.some(s => s.value === props.app.stage) ? props.app.stage : (stageOptions.value[0]?.value ?? '')
  participants.value = profile.value ? [profile.value.id] : []
  planning.value = true
}
const search = ref('')
const people = computed(() => members.value.filter(m => textMatch(fullName(m), search.value)).slice(0, 30))
const toggle = (id: string, on: boolean) => { participants.value = on ? [...new Set([...participants.value, id])] : participants.value.filter(x => x !== id) }
const durations = [30, 45, 60, 90, 120].map(n => ({ value: String(n), label: t('tnd30.itv.minutes', { n }) }))
const error = ref<string | null>(null)
const saving = ref(false)
async function save() {
  error.value = null
  if (!participants.value.length) { error.value = t('tnd30.itv.needPeople'); return }
  if (form.video_url && !/^https?:\/\//i.test(form.video_url)) { error.value = t('tnd30.itv.badLink'); return }
  saving.value = true
  try {
    const r = await planInterview(props.app.id, { stage_key: form.stage_key, starts_at: new Date(form.starts_at).toISOString(), duration_min: Number(form.duration_min), location: form.location, video_url: form.video_url || null, notes: form.notes, participants: participants.value, notify_candidate: form.notify })
    toast.add(form.notify && r.emailed === false ? t('tnd30.itv.plannedNoMail') : t('tnd30.itv.planned'))
    planning.value = false
    await load()
    emit('changed')
  }
  catch (e) { error.value = errorMessage(e) }
  finally { saving.value = false }
}
async function cancel(id: string) {
  try { await cancelInterview(id); await load(); emit('changed') }
  catch (e) { toast.add(errorMessage(e), 'error') }
}
</script>

<template>
  <div class="wb-stack wb-iv">
    <div v-if="canManage && !planning && app.status === 'active'"><WbButton size="sm" icon="calendar-days" data-action="plan-interview" @click="openPlan">{{ t('tnd30.itv.plan') }}</WbButton></div>

    <form v-if="planning" class="wb-card wb-iv-form" novalidate @submit.prevent="save">
      <h3 class="h3">{{ t('tnd30.itv.plan') }}</h3>
      <WbBanner v-if="error" tone="danger">{{ error }}</WbBanner>
      <div class="wb-iv-grid">
        <WbSelect id="iv-stage" v-model="form.stage_key" :label="t('tnd30.panel.stage')" :options="stageOptions" />
        <WbInput id="iv-start" v-model="form.starts_at" type="datetime-local" :label="t('tnd30.itv.when')" required />
        <WbSelect id="iv-dur" v-model="form.duration_min" :label="t('tnd30.itv.duration')" :options="durations" />
        <WbInput id="iv-loc" v-model="form.location" :label="t('tnd30.itv.location')" :placeholder="t('tnd30.itv.locationPh')" maxlength="200" />
        <div class="wb-iv-wide"><WbInput id="iv-video" v-model="form.video_url" type="url" :label="t('tnd30.itv.video')" placeholder="https://meet.google.com/…" maxlength="500" /></div>
      </div>
      <fieldset class="wb-iv-people">
        <legend class="wb-label">{{ t('tnd30.itv.people', { n: participants.length }, participants.length) }}</legend>
        <WbInput v-model="search" icon="search" type="search" :aria-label="t('tnd26.search')" :placeholder="t('tnd26.search')" />
        <ul>
          <li v-for="m in people" :key="m.id">
            <WbCheckbox :model-value="participants.includes(m.id)" :label="fullName(m)" @update:model-value="(v: boolean) => toggle(m.id, v)" />
          </li>
        </ul>
        <p class="caption wb-mut">{{ t('tnd30.itv.peopleHint') }}</p>
      </fieldset>
      <WbTextarea id="iv-notes" v-model="form.notes" :label="t('tnd30.itv.notes')" :hint="t('tnd30.itv.notesHint')" :max="1000" :rows="2" />
      <WbCheckbox v-model="form.notify" :label="t('tnd30.itv.notify')" />
      <div class="wb-row wb-iv-act">
        <WbButton variant="secondary" size="sm" @click="planning = false">{{ t('approvals.cancel') }}</WbButton>
        <WbButton type="submit" size="sm" :loading="saving" data-action="save-interview">{{ t('tnd30.itv.save') }}</WbButton>
      </div>
    </form>

    <p v-if="!items.length && !planning" class="small wb-mut">{{ t('tnd30.itv.none') }}</p>
    <ul class="wb-iv-list">
      <li v-for="i in upcoming" :key="i.id" class="wb-iv-item">
        <div class="wb-grow">
          <p class="small"><b>{{ fmt(i.starts_at) }}</b> · {{ t('tnd30.itv.minutes', { n: i.duration_min }) }} · {{ stageLabel(opening.stages, i.stage_key) }}</p>
          <p class="caption wb-mut2">{{ i.interview_participants.map(p => p.profiles ? `${p.profiles.first_name} ${p.profiles.last_name}` : '').filter(Boolean).join(', ') }}</p>
          <p v-if="i.location || i.video_url" class="caption">
            <span v-if="i.location">{{ i.location }}</span><template v-if="i.location && i.video_url"> · </template>
            <a v-if="i.video_url" :href="i.video_url" target="_blank" rel="noopener noreferrer">{{ t('tnd30.itv.join') }}</a>
          </p>
          <p v-if="i.notes" class="caption wb-mut2">{{ i.notes }}</p>
        </div>
        <WbButton v-if="canManage" variant="ghost" size="sm" @click="cancel(i.id)">{{ t('tnd30.itv.cancel') }}</WbButton>
      </li>
      <li v-for="i in cancelled" :key="i.id" class="wb-iv-item is-cancel caption wb-mut">{{ fmt(i.starts_at) }} · {{ t('tnd30.itv.cancelled') }}</li>
    </ul>
  </div>
</template>

<style scoped>
.wb-iv-form { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.wb-iv-form h3 { margin: 0; }
.wb-iv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.wb-iv-wide { grid-column: 1 / -1; }
.wb-iv-people { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.wb-iv-people ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px var(--space-3); max-height: 180px; overflow-y: auto; }
.wb-iv-act { gap: var(--space-2); justify-content: flex-end; }
.wb-iv-act :deep(.wb-btn) { margin: 0; }
.wb-iv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.wb-iv-item { display: flex; gap: var(--space-3); align-items: flex-start; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); }
.wb-iv-item p { margin: 0; }
.wb-iv-item a { color: var(--brand-text); }
.wb-iv-item.is-cancel { text-decoration: line-through; padding-block: var(--space-2); }
@container wbapp (max-width: 767px) {
  .wb-iv-grid, .wb-iv-people ul { grid-template-columns: minmax(0, 1fr); }
}
</style>
