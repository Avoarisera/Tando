<script setup lang="ts">
/**
 * TND-30 lot 4 — Settings › E-mails: sending service (Resend), sender, reply-to,
 * write-only API key (stored encrypted in Supabase Vault), domain check with the
 * DNS records to add, test e-mail, on/off switch.
 */
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const supabase = useSupabaseClient()
const { profile } = useCurrentUser()

interface MailState { provider: string, enabled: boolean, from_name: string, from_email: string, reply_to: string, has_key: boolean, key_hint: string, last_test_at: string | null, last_error: string | null, env_fallback: boolean }
interface DomainState { domain: string, status: string, records: { record: string, name: string, type: string, value: string, status: string, priority?: number }[] }

async function call<T>(url: string, opts: { method?: 'GET' | 'POST', body?: Record<string, unknown> } = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  return await $fetch<T>(url, { method: opts.method ?? 'GET', body: opts.body, headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } })
}
const msg = (e: unknown) => (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? errorMessage(e)

const state = ref<MailState | null>(null)
const form = reactive({ enabled: false, from_name: '', from_email: '', reply_to: '', api_key: '' })
const error = ref<string | null>(null)
async function load() {
  try {
    state.value = await call<MailState>('/api/settings/mail')
    Object.assign(form, { enabled: state.value.enabled, from_name: state.value.from_name, from_email: state.value.from_email, reply_to: state.value.reply_to, api_key: '' })
  }
  catch (e) { error.value = msg(e) }
}
onMounted(load)

const saving = ref(false)
async function save() {
  error.value = null
  saving.value = true
  try {
    await call('/api/settings/mail', { method: 'POST', body: { ...form, api_key: form.api_key || undefined } })
    toast.add(t('tnd30.mailcfg.saved'))
    await load()
  }
  catch (e) { error.value = msg(e) }
  finally { saving.value = false }
}

const testTo = ref('')
watch(() => profile.value, (p) => { if (p && !testTo.value) supabase.auth.getUser().then(({ data }) => { testTo.value = data.user?.email ?? '' }) }, { immediate: true })
const testing = ref(false)
const testResult = ref<{ sent: boolean, reason?: string } | null>(null)
async function test() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await call<{ sent: boolean, reason?: string }>('/api/settings/mail/test', { method: 'POST', body: { to: testTo.value } })
    await load()
  }
  catch (e) { testResult.value = { sent: false, reason: msg(e) } }
  finally { testing.value = false }
}

const domain = ref<DomainState | null>(null)
const checking = ref(false)
const domainError = ref<string | null>(null)
async function checkDomain() {
  checking.value = true
  domainError.value = null
  try { domain.value = await call<DomainState>('/api/settings/mail/domain') }
  catch (e) { domainError.value = msg(e) }
  finally { checking.value = false }
}
const statusTone = (s: string) => (s === 'verified' ? 'success' : s === 'missing' || s === 'failed' ? 'danger' : 'warning') as 'success' | 'danger' | 'warning'
const copy = async (v: string) => { try { await navigator.clipboard.writeText(v); toast.add(t('tnd30.share.copied')) } catch { /* the value stays selectable */ } }
const fmtTime = (iso: string) => new Intl.DateTimeFormat(tag.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const summary = computed(() => {
  const s = state.value
  if (!s) return null
  if (s.enabled && s.has_key && s.from_email) return { tone: 'success' as const, text: t('tnd30.mailcfg.on', { from: s.from_email }) }
  if (s.env_fallback) return { tone: 'info' as const, text: t('tnd30.mailcfg.env') }
  return { tone: 'warning' as const, text: t('tnd30.mailcfg.off') }
})
</script>

<template>
  <section class="wb-card wb-set-s wb-mail">
    <header>
      <h2 class="h3">{{ t('tnd30.mailcfg.title') }}</h2>
      <p class="small wb-mut">{{ t('tnd30.mailcfg.hint') }}</p>
      <WbBadge v-if="summary" :tone="summary.tone" size="sm" class="wb-mail-st">{{ summary.text }}</WbBadge>
    </header>
    <div class="wb-stack">
      <WbBanner v-if="error" tone="danger">{{ error }}</WbBanner>
      <details class="wb-mail-how small">
        <summary>{{ t('tnd30.mailcfg.how') }}</summary>
        <ol>
          <li>{{ t('tnd30.mailcfg.how1') }} <a href="https://resend.com/signup" target="_blank" rel="noopener noreferrer">resend.com</a></li>
          <li>{{ t('tnd30.mailcfg.how2') }}</li>
          <li>{{ t('tnd30.mailcfg.how3') }}</li>
          <li>{{ t('tnd30.mailcfg.how4') }}</li>
        </ol>
      </details>
      <div class="wb-set-f">
        <WbInput id="mail-from-name" v-model="form.from_name" :label="t('tnd30.mailcfg.fromName')" maxlength="80" :placeholder="t('tnd30.mailcfg.fromNamePh')" />
        <WbInput id="mail-from" v-model="form.from_email" type="email" :label="t('tnd30.mailcfg.from')" maxlength="254" placeholder="recrutement@votre-domaine.com" :hint="t('tnd30.mailcfg.fromHint')" />
        <WbInput id="mail-reply" v-model="form.reply_to" type="email" :label="t('tnd30.mailcfg.replyTo')" maxlength="254" :hint="t('tnd30.mailcfg.replyHint')" />
        <WbInput id="mail-key" v-model="form.api_key" type="password" autocomplete="off" :label="t('tnd30.mailcfg.key')" :placeholder="state?.has_key ? t('tnd30.mailcfg.keyKept', { hint: state.key_hint }) : 're_…'" :hint="t('tnd30.mailcfg.keyHint')" />
        <div class="wb-set-wide"><WbCheckbox v-model="form.enabled" :label="t('tnd30.mailcfg.enable')" /></div>
      </div>
      <div class="wb-row wb-wrap wb-mail-act">
        <WbButton :loading="saving" data-action="save-mail" @click="save">{{ t('rules.save') }}</WbButton>
        <WbButton variant="secondary" :loading="checking" :disabled="!state?.has_key" icon="globe" @click="checkDomain">{{ t('tnd30.mailcfg.check') }}</WbButton>
      </div>

      <div v-if="domainError || domain" class="wb-mail-dom">
        <WbBanner v-if="domainError" tone="danger">{{ domainError }}</WbBanner>
        <template v-else-if="domain">
          <p class="small"><b>{{ domain.domain }}</b> <WbBadge :tone="statusTone(domain.status)" size="sm">{{ t(`tnd30.mailcfg.dom.${['verified', 'missing', 'failed'].includes(domain.status) ? domain.status : 'pending'}`) }}</WbBadge></p>
          <p v-if="domain.status === 'missing'" class="small wb-mut2">{{ t('tnd30.mailcfg.domMissing') }}</p>
          <div v-if="domain.records.length" class="wb-scroll wb-dt">
            <table>
              <caption class="wb-sr">{{ t('tnd30.mailcfg.dns') }}</caption>
              <thead><tr><th>{{ t('tnd30.mailcfg.type') }}</th><th>{{ t('tnd30.mailcfg.name') }}</th><th>{{ t('tnd30.mailcfg.value') }}</th><th>{{ t('rules.status') }}</th></tr></thead>
              <tbody>
                <tr v-for="(r, i) in domain.records" :key="i">
                  <td class="small"><b>{{ r.type }}</b><span v-if="r.priority" class="caption wb-mut2"> · {{ r.priority }}</span></td>
                  <td class="small"><code>{{ r.name }}</code></td>
                  <td class="small wb-mail-val"><button type="button" class="wb-mail-copy" :title="t('tnd30.share.copy')" @click="copy(r.value)"><code>{{ r.value }}</code></button></td>
                  <td><WbBadge :tone="statusTone(r.status)" size="sm">{{ t(`tnd30.mailcfg.dom.${r.status === 'verified' ? 'verified' : r.status === 'failed' ? 'failed' : 'pending'}`) }}</WbBadge></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="caption wb-mut">{{ t('tnd30.mailcfg.dnsHint') }}</p>
        </template>
      </div>

      <div class="wb-mail-test">
        <WbInput id="mail-test" v-model="testTo" type="email" :label="t('tnd30.mailcfg.testTo')" />
        <WbButton variant="secondary" icon="send" :loading="testing" :disabled="!state?.has_key || !testTo" data-action="test-mail" @click="test">{{ t('tnd30.mailcfg.test') }}</WbButton>
      </div>
      <p v-if="testResult" :class="['small', testResult.sent ? 'wb-c-success' : 'wb-c-danger']">{{ testResult.sent ? t('tnd30.mailcfg.testOk', { to: testTo }) : t('tnd30.mailcfg.testKo', { reason: testResult.reason ?? '' }) }}</p>
      <p v-else-if="state?.last_error" class="small wb-c-danger">{{ t('tnd30.mailcfg.lastError', { reason: state.last_error }) }}</p>
      <p v-else-if="state?.last_test_at" class="caption wb-mut">{{ t('tnd30.mailcfg.lastTest', { date: fmtTime(state.last_test_at) }) }}</p>
    </div>
  </section>
</template>

<style scoped>
/* same layout as the other Settings sections (their styles are scoped to the page) */
.wb-mail { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: var(--space-5); padding: var(--space-5); }
.wb-mail > header { display: flex; flex-direction: column; gap: 4px; }
.wb-mail > header h2, .wb-mail > header p { margin: 0; }
.wb-set-f { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3) var(--space-4); }
.wb-set-f > .wb-set-wide { grid-column: 1 / -1; }
@container wbapp (max-width: 1023px) {
  .wb-mail { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
}
@container wbapp (max-width: 767px) {
  .wb-set-f { grid-template-columns: minmax(0, 1fr); }
}
.wb-mail-st { margin-top: var(--space-2); }
.wb-mail-how summary { cursor: pointer; color: var(--brand-text); }
.wb-mail-how ol { margin: var(--space-2) 0 0; padding-left: 1.3em; display: flex; flex-direction: column; gap: 4px; }
.wb-mail-how a { color: var(--brand-text); }
.wb-mail-act { gap: var(--space-2); }
.wb-mail-act :deep(.wb-btn) { margin: 0; }
.wb-mail-dom { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border-radius: var(--radius-md); background: var(--surface-2); }
.wb-mail-dom p { margin: 0; }
.wb-mail-val { max-width: 360px; }
.wb-mail-copy { border: 0; background: none; padding: 0; text-align: left; cursor: copy; color: inherit; font: inherit; word-break: break-all; }
.wb-mail-test { display: flex; gap: var(--space-2); align-items: flex-end; flex-wrap: wrap; }
.wb-mail-test :deep(.wb-field) { flex: 1 1 260px; }
.wb-mail-test :deep(.wb-btn) { margin: 0; }
</style>
