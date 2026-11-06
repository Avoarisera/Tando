<script setup lang="ts">
import type { ApplicationEvent, ApplicationRow } from '~/composables/useRecruitment'
import type { Opening } from '~/utils/recruitment'
import { isAnonymous } from '~/utils/recruitment'
import { pseudonym } from '~/utils/recruit-stats'

/**
 * TND-30 — one application: CV preview (PDF in the page), cover letter, answers,
 * activity feed with internal notes, stage change, decline (internal reason +
 * optional polite e-mail), reopen.
 */
/** canManage: HR or the hiring manager (stage, decline, e-mail, interviews); an invited interviewer only reads and scores */
const props = defineProps<{ app: ApplicationRow, opening: Opening, canManage: boolean }>()
const emit = defineEmits<{ close: [], changed: [] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const { profile, isRecruiter } = useCurrentUser()
const { listEvents, addNote, moveStage, reject, restore, fileUrl, listTemplates, sendEmail, hire } = useRecruitment()
const { teams, fetchTeams } = useTeams()

const c = computed(() => props.app.candidates)
// anonymous screening: no identity at the first stages (TND-30 lot 3)
const anon = computed(() => isAnonymous(props.opening, props.app))
const name = computed(() => (anon.value ? t('tnd30.anon.name', { id: pseudonym(props.app.id) }) : c.value ? `${c.value.first_name} ${c.value.last_name}` : '—'))
const cv = computed(() => props.app.application_files.find(f => f.kind === 'cv') ?? null)
const letterFile = computed(() => props.app.application_files.find(f => f.kind === 'cover_letter') ?? null)

type Tab = 'cv' | 'letter' | 'answers' | 'scorecards' | 'interviews' | 'activity'
const tab = ref<Tab>('cv')
const tabs = computed(() => [
  { id: 'cv', label: t('tnd30.panel.cv') },
  ...(props.app.cover_letter_text || letterFile.value ? [{ id: 'letter', label: t('tnd30.panel.letter') }] : []),
  ...(props.opening.questions.length ? [{ id: 'answers', label: t('tnd30.panel.answers') }] : []),
  { id: 'scorecards', label: t('tnd30.panel.scorecards') },
  { id: 'interviews', label: t('tnd30.panel.interviews') },
  { id: 'activity', label: t('tnd30.panel.activity'), count: events.value.filter(e => e.kind === 'note').length || undefined },
])

// CV preview: PDF inline through a short-lived signed URL; DOC/DOCX → download
const preview = ref<string | null>(null)
const previewError = ref<string | null>(null)
async function loadPreview() {
  preview.value = null
  previewError.value = null
  const f = tab.value === 'letter' ? letterFile.value : cv.value
  if (!f || f.mime_type !== 'application/pdf') return
  try { preview.value = (await fileUrl(f.id)).url }
  catch (e) { previewError.value = errorMessage(e) }
}
async function download(id: string) {
  try { window.open((await fileUrl(id, true)).url, '_blank', 'noopener') }
  catch (e) { toast.add(errorMessage(e), 'error') }
}
watch([tab, () => props.app.id], loadPreview, { immediate: true })

// Activity
const events = ref<ApplicationEvent[]>([])
async function loadEvents() {
  try { events.value = await listEvents(props.app.id) }
  catch { events.value = [] }
}
watch(() => props.app.id, loadEvents, { immediate: true })
const note = ref('')
const savingNote = ref(false)
async function saveNote() {
  if (!note.value.trim() || !profile.value) return
  savingNote.value = true
  try {
    await addNote(props.app.id, note.value.trim().slice(0, 2000), profile.value.id)
    note.value = ''
    await loadEvents()
  }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { savingNote.value = false }
}
const fmtTime = (iso: string) => new Intl.DateTimeFormat(tag.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
function eventText(e: ApplicationEvent): string {
  const d = e.data as Record<string, string | boolean | null>
  switch (e.kind) {
    case 'submitted': return t('tnd30.event.submitted')
    case 'stage': return t('tnd30.event.stage', { from: stageLabel(props.opening.stages, String(d.from)), to: stageLabel(props.opening.stages, String(d.to)) })
    case 'rejected': return t('tnd30.event.rejected', { reason: String(d.reason ?? '') })
    case 'restored': return t('tnd30.event.restored')
    case 'email': return d.sent ? t(`tnd30.event.email.${d.template}`) : t('tnd30.event.emailNotSent', { what: t(`tnd30.event.emailName.${d.template}`) })
    case 'note': return String(d.text ?? '')
    case 'interview': return d.cancelled ? t('tnd30.event.interviewCancelled') : t('tnd30.event.interview', { stage: stageLabel(props.opening.stages, String(d.stage)), date: d.starts_at ? fmtTime(String(d.starts_at)) : '' })
    case 'scorecard': return t('tnd30.event.scorecard', { stage: stageLabel(props.opening.stages, String(d.stage)), rec: d.recommendation ? t(`tnd30.rec.${d.recommendation}`) : '' })
    case 'hired': return t('tnd30.event.hired')
    case 'withdrawn': return t('tnd30.event.withdrawn')
    default: return e.kind
  }
}

// Decisions
const busy = ref(false)
const stageOptions = computed(() => props.opening.stages
  .filter(s => isRecruiter.value || s.key !== 'hired')
  .map(s => ({ value: s.key, label: s.label })))
const stage = computed({
  get: () => props.app.stage,
  set: async (v: string) => {
    busy.value = true
    try { await moveStage(props.app.id, v); toast.add(t('tnd30.panel.moved', { stage: stageLabel(props.opening.stages, v) })); emit('changed'); await loadEvents() }
    catch (e) { toast.add(errorMessage(e), 'error') }
    finally { busy.value = false }
  },
})
const declining = ref(false)
const reason = ref('')
const sendRejection = ref(true)
const reasonError = ref<string | null>(null)
async function confirmDecline() {
  if (!reason.value.trim()) { reasonError.value = t('tnd30.panel.reasonRequired'); return }
  busy.value = true
  try {
    const r = await reject(props.app.id, reason.value.trim(), sendRejection.value)
    toast.add(sendRejection.value && !r.emailed ? t('tnd30.panel.declinedNoMail') : t('tnd30.panel.declined', { who: c.value?.first_name ?? '' }))
    declining.value = false
    emit('changed')
    await loadEvents()
  }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { busy.value = false }
}
async function reopen() {
  busy.value = true
  try { await restore(props.app.id); emit('changed'); await loadEvents() }
  catch (e) { toast.add(errorMessage(e), 'error') }
  finally { busy.value = false }
}
// ── E-mail to the candidate (from a template, editable) ─────────────────────
const composing = ref(false)
const mail = reactive({ template: 'invitation', subject: '', text: '' })
const templates = ref<{ key: string, subject: string, body: string }[]>([])
const mailVars = computed(() => ({ prenom: c.value?.first_name ?? '', nom: c.value?.last_name ?? '', poste: props.opening.title, entreprise: '', date: '', lieu: '' }))
async function openMail() {
  composing.value = true
  try { templates.value = await listTemplates() }
  catch { templates.value = [] }
  applyTemplate()
}
function applyTemplate() {
  const tpl = templates.value.find(x => x.key === mail.template)
  mail.subject = tpl ? fillTemplate(tpl.subject, mailVars.value) : ''
  mail.text = tpl ? fillTemplate(tpl.body, mailVars.value) : ''
}
watch(() => mail.template, applyTemplate)
const mailTemplates = computed(() => [
  { value: 'invitation', label: t('tnd30.tpl.invitation') }, { value: 'offer', label: t('tnd30.tpl.offer') }, { value: 'custom', label: t('tnd30.tpl.custom') },
])
const mailError = ref<string | null>(null)
async function send() {
  mailError.value = null
  if (!mail.subject.trim() || !mail.text.trim()) { mailError.value = t('tnd30.mail.required'); return }
  if (/\{(prenom|nom|poste|entreprise|date|lieu)\}/.test(mail.text + mail.subject)) { mailError.value = t('tnd30.mail.unfilled'); return }
  busy.value = true
  try {
    const r = await sendEmail(props.app.id, { subject: mail.subject.trim(), text: mail.text.trim(), template: mail.template })
    toast.add(r.sent ? t('tnd30.mail.sent', { email: c.value?.email ?? '' }) : t('tnd30.mail.notSent'), r.sent ? undefined : 'error')
    composing.value = false
    await loadEvents()
  }
  catch (e) { mailError.value = errorMessage(e) }
  finally { busy.value = false }
}

// ── Hire: creates the employee account ──────────────────────────────────────
const hiring = ref(false)
const hireForm = reactive({ team_id: props.opening.team_id ?? '', role: 'employee', joined_at: todayIso(), country: 'FR' })
const hireError = ref<string | null>(null)
const teamChoices = computed(() => [{ value: '', label: t('r8a.people.noTeam') }, ...teams.value.map(x => ({ value: x.id, label: x.name }))])
const roleChoices = computed(() => [{ value: 'employee', label: t('roles.employee') }, { value: 'manager', label: t('roles.manager') }])
const countryChoices = computed(() => countryOptions(tag.value))
async function openHire() { hiring.value = true; hireError.value = null; fetchTeams() }
async function confirmHire() {
  hireError.value = null
  busy.value = true
  try {
    await hire(props.app.id, { team_id: hireForm.team_id || null, role: hireForm.role, joined_at: hireForm.joined_at, country: hireForm.country })
    toast.add(t('tnd30.hire.done', { who: c.value?.first_name ?? '', email: c.value?.email ?? '' }))
    hiring.value = false
    emit('changed')
    await loadEvents()
  }
  catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    hireError.value = err.data?.statusMessage ?? errorMessage(e)
  }
  finally { busy.value = false }
}

const size = (b: number) => (b < 1024 * 1024
  ? `${Math.max(1, Math.round(b / 1024)).toLocaleString(tag.value)} Ko`
  : `${(b / 1024 / 1024).toLocaleString(tag.value, { maximumFractionDigits: 1 })} Mo`)
const purgeIn = computed(() => Math.max(0, Math.round((Date.parse(props.app.purge_after) - Date.now()) / 86_400_000)))
</script>

<template>
  <WbSidePanel :title="name" :subtitle="`${opening.title} · ${t('tnd30.panel.applied', { date: fmtShort(app.created_at.slice(0, 10), tag) })}`" :width="760" @close="emit('close')">
    <div class="wb-cp-top">
      <p v-if="anon" class="small wb-mut2 wb-cp-anon"><WbIcon name="eye" :size="14" /> {{ t('tnd30.anon.panel') }}</p>
      <ul v-else class="wb-cp-contact small">
        <li><WbIcon name="mail" :size="14" /><a :href="`mailto:${c?.email}`">{{ c?.email }}</a></li>
        <li v-if="c?.phone"><WbIcon name="circle-user-round" :size="14" /><a :href="`tel:${c.phone}`">{{ c.phone }}</a></li>
        <li v-if="c?.linkedin_url"><WbIcon name="external-link" :size="14" /><a :href="c.linkedin_url" target="_blank" rel="noopener noreferrer">{{ t('tnd30.panel.profileLink') }}</a></li>
      </ul>
      <div class="wb-cp-act">
        <template v-if="!canManage">
          <WbBadge size="sm">{{ stageLabel(opening.stages, app.stage) }}</WbBadge>
        </template>
        <template v-else-if="app.status === 'rejected' || app.status === 'withdrawn'">
          <WbBadge tone="danger" size="sm">{{ t(`tnd30.appStatus.${app.status}`) }}</WbBadge>
          <WbButton v-if="app.status === 'rejected'" variant="secondary" size="sm" icon="rotate-ccw" :loading="busy" @click="reopen">{{ t('tnd30.panel.reopen') }}</WbButton>
        </template>
        <template v-else-if="app.status === 'hired'">
          <WbBadge tone="success" size="sm" icon="circle-check">{{ t('tnd30.appStatus.hired') }}</WbBadge>
        </template>
        <template v-else>
          <WbSelect v-model="stage" :options="stageOptions" :aria-label="t('tnd30.panel.stage')" :disabled="busy" />
          <WbButton variant="secondary" size="sm" icon="mail" data-action="email" @click="openMail">{{ t('tnd30.mail.button') }}</WbButton>
          <WbButton v-if="isRecruiter && (app.stage === 'offer' || app.stage === 'hired')" size="sm" icon="user-plus" data-action="hire" @click="openHire">{{ t('tnd30.hire.button') }}</WbButton>
          <WbButton variant="ghost" size="sm" icon="circle-x" data-action="decline" @click="declining = true; reason = ''; reasonError = null">{{ t('tnd30.panel.decline') }}</WbButton>
        </template>
      </div>
    </div>
    <p v-if="app.status === 'rejected' && app.rejection_reason" class="wb-why small"><b>{{ t('tnd30.panel.reason') }}</b> {{ app.rejection_reason }}</p>

    <WbTabs v-model="tab" class="wb-cp-tabs" :tabs="tabs" :label="t('tnd30.panel.sections')" />

    <section v-if="tab === 'cv' || tab === 'letter'" class="wb-cp-doc">
      <template v-if="tab === 'letter' && app.cover_letter_text">
        <p class="wb-cp-letter">{{ app.cover_letter_text }}</p>
      </template>
      <template v-else>
        <template v-for="f in [tab === 'letter' ? letterFile : cv]" :key="f?.id ?? 'none'">
          <div v-if="f" class="wb-row-b wb-cp-file small">
            <span><WbIcon name="file-text" :size="16" /> <b>{{ anon ? (f.kind === 'cv' ? 'CV' : t('tnd30.panel.letter')) : f.file_name }}</b> · {{ size(f.size_bytes) }}</span>
            <WbButton variant="ghost" size="sm" icon="download" @click="download(f.id)">{{ t('tnd30.panel.download') }}</WbButton>
          </div>
          <iframe v-if="f && preview" :src="preview" class="wb-cp-frame" :title="f.file_name" />
          <p v-else-if="f && f.mime_type !== 'application/pdf'" class="small wb-mut">{{ t('tnd30.panel.noPreview') }}</p>
          <p v-else-if="previewError" class="small wb-c-danger">{{ previewError }}</p>
          <WbSkeleton v-else-if="f" variant="table" />
          <p v-else class="small wb-mut">{{ t('tnd30.panel.noFile') }}</p>
        </template>
      </template>
    </section>

    <ScorecardsTab v-else-if="tab === 'scorecards'" :app="app" :opening="opening" />
    <InterviewsTab v-else-if="tab === 'interviews'" :app="app" :opening="opening" :can-manage="canManage" @changed="loadEvents" />

    <section v-else-if="tab === 'answers'" class="wb-stack-s">
      <div v-for="q in opening.questions" :key="q.id" class="wb-cp-qa">
        <p class="small wb-mut2">{{ q.label }}</p>
        <p>{{ app.answers[q.id] || '—' }}</p>
      </div>
    </section>

    <section v-else class="wb-stack-s">
      <ol class="wb-cp-feed">
        <li v-for="e in events" :key="e.id" :class="['small', { 'is-note': e.kind === 'note' }]">
          <span class="caption wb-mut">{{ fmtTime(e.created_at) }}<template v-if="e.profiles"> · {{ e.profiles.first_name }} {{ e.profiles.last_name }}</template></span>
          <span>{{ eventText(e) }}</span>
        </li>
      </ol>
      <div class="wb-cp-note">
        <WbTextarea id="cp-note" v-model="note" :label="t('tnd30.panel.note')" :max="2000" :rows="3" :hint="t('tnd30.panel.noteHint')" />
        <div><WbButton size="sm" :loading="savingNote" :disabled="!note.trim()" @click="saveNote">{{ t('tnd30.panel.addNote') }}</WbButton></div>
      </div>
    </section>

    <p class="caption wb-mut wb-cp-rgpd">{{ t('tnd30.panel.purge', { n: purgeIn }, purgeIn) }}<template v-if="app.consent_pool"> · {{ t('tnd30.panel.pool') }}</template></p>

    <WbModal v-if="composing" :title="t('tnd30.mail.title', { who: name })" :description="t('tnd30.mail.text', { email: c?.email ?? '' })" @close="composing = false">
      <WbBanner v-if="mailError" tone="danger">{{ mailError }}</WbBanner>
      <WbSelect id="mail-tpl" v-model="mail.template" :label="t('tnd30.mail.template')" :options="mailTemplates" />
      <WbInput id="mail-subject" v-model="mail.subject" :label="t('tnd30.mail.subject')" maxlength="200" />
      <WbTextarea id="mail-text" v-model="mail.text" :label="t('tnd30.mail.message')" :max="6000" :rows="10" :hint="t('tnd30.mail.hint')" />
      <template #footer>
        <WbButton variant="secondary" @click="composing = false">{{ t('approvals.cancel') }}</WbButton>
        <WbButton icon="send" :loading="busy" data-action="send-email" @click="send">{{ t('tnd30.mail.send') }}</WbButton>
      </template>
    </WbModal>

    <WbModal v-if="hiring" :title="t('tnd30.hire.title', { who: name })" :description="t('tnd30.hire.text', { email: c?.email ?? '' })" @close="hiring = false">
      <WbBanner v-if="hireError" tone="danger">{{ hireError }}</WbBanner>
      <div class="wb-grid wb-cols-2" style="gap: 16px">
        <WbSelect id="hire-team" v-model="hireForm.team_id" :label="t('calendar.team')" :options="teamChoices" />
        <WbSelect id="hire-role" v-model="hireForm.role" :label="t('people.role')" :options="roleChoices" />
        <WbInput id="hire-date" v-model="hireForm.joined_at" type="date" :label="t('tnd30.hire.start')" />
        <WbSelect id="hire-country" v-model="hireForm.country" :label="t('r8a.people.country')" :options="countryChoices" />
      </div>
      <template #footer>
        <WbButton variant="secondary" @click="hiring = false">{{ t('approvals.cancel') }}</WbButton>
        <WbButton icon="user-plus" :loading="busy" data-action="confirm-hire" @click="confirmHire">{{ t('tnd30.hire.confirm') }}</WbButton>
      </template>
    </WbModal>

    <WbModal v-if="declining" tone="danger" :title="t('tnd30.panel.declineTitle', { who: name })" :description="t('tnd30.panel.declineText')" @close="declining = false">
      <WbTextarea id="cp-reason" v-model="reason" :label="t('tnd30.panel.reasonLabel')" :max="300" :rows="2" :error="reasonError" required />
      <WbCheckbox v-model="sendRejection" :label="t('tnd30.panel.sendRejection')" />
      <template #footer>
        <WbButton variant="secondary" @click="declining = false">{{ t('approvals.cancel') }}</WbButton>
        <WbButton variant="danger" :loading="busy" data-action="confirm-decline" @click="confirmDecline">{{ t('tnd30.panel.decline') }}</WbButton>
      </template>
    </WbModal>
  </WbSidePanel>
</template>

<style scoped>
/* the panel body is a flex column: these must not shrink */
.wb-cp-tabs, .wb-cp-top, .wb-cp-doc, .wb-cp-file { flex: none; }
.wb-cp-top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-3); align-items: center; }
.wb-cp-contact { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px var(--space-4); }
.wb-cp-contact li { display: inline-flex; align-items: center; gap: 6px; }
.wb-cp-contact a { color: var(--brand-text); }
.wb-cp-act { display: flex; gap: var(--space-2); align-items: center; }
.wb-cp-act :deep(.wb-field) { flex: 0 0 auto; }
.wb-cp-act :deep(.wb-btn) { margin: 0; }
.wb-cp-doc { display: flex; flex-direction: column; gap: var(--space-2); }
.wb-cp-file { padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--surface-2); }
.wb-cp-frame { width: 100%; height: min(70dvh, 820px); border: 1px solid var(--border); border-radius: var(--radius-md); background: #fff; }
.wb-cp-letter { white-space: pre-wrap; line-height: 1.6; margin: 0; }
.wb-cp-qa p { margin: 0; }
.wb-cp-qa + .wb-cp-qa { border-top: 1px solid var(--border); padding-top: var(--space-2); }
.wb-cp-feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.wb-cp-feed li { display: flex; flex-direction: column; gap: 2px; padding-left: var(--space-3); border-left: 2px solid var(--border); }
.wb-cp-feed li.is-note { border-left-color: var(--brand); white-space: pre-wrap; }
.wb-cp-note { display: flex; flex-direction: column; gap: var(--space-2); }
.wb-cp-rgpd { margin-top: auto; }
</style>
