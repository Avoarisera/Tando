<script setup lang="ts">
/**
 * TND-30 lot 4 — Settings › E-mails: generic SMTP (sent with Nodemailer).
 * Presets for common providers, write-only password (encrypted in Supabase
 * Vault), connection check, test e-mail, on/off switch, last error.
 */
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const toast = useToast()
const supabase = useSupabaseClient()

type Security = 'starttls' | 'tls' | 'none'
interface MailState {
  enabled: boolean, smtp_host: string, smtp_port: number, smtp_security: Security, smtp_user: string, has_password: boolean
  from_name: string, from_email: string, reply_to: string, last_test_at: string | null, last_error: string | null, env_fallback: boolean
}

// Common providers: host, port and security pre-filled (the login stays to type)
const PRESETS: Record<string, { host: string, port: number, security: Security, user?: string, hint?: boolean }> = {
  ovh: { host: 'ssl0.ovh.net', port: 465, security: 'tls' },
  google: { host: 'smtp.gmail.com', port: 587, security: 'starttls' },
  microsoft: { host: 'smtp.office365.com', port: 587, security: 'starttls' },
  brevo: { host: 'smtp-relay.brevo.com', port: 587, security: 'starttls' },
  mailgun: { host: 'smtp.eu.mailgun.org', port: 587, security: 'starttls' },
  resend: { host: 'smtp.resend.com', port: 465, security: 'tls', user: 'resend' },
  // Mailtrap Email Sending: login « api », password = API token; the sandbox catches test e-mails
  mailtrap: { host: 'live.smtp.mailtrap.io', port: 587, security: 'starttls', user: 'api', hint: true },
  mailtrap_bulk: { host: 'bulk.smtp.mailtrap.io', port: 587, security: 'starttls', user: 'api', hint: true },
  mailtrap_sandbox: { host: 'sandbox.smtp.mailtrap.io', port: 2525, security: 'starttls', hint: true },
}
const presetHint = computed(() => (PRESETS[preset.value]?.hint ? t(`tnd30.mailcfg.presetTip.${preset.value}`) : t('tnd30.mailcfg.presetHint')))
const preset = ref('')
const presetOptions = computed(() => [{ value: '', label: t('tnd30.mailcfg.presetPick') }, ...Object.keys(PRESETS).map(k => ({ value: k, label: t(`tnd30.mailcfg.preset.${k}`) }))])
const securityOptions = computed(() => (['starttls', 'tls', 'none'] as const).map(v => ({ value: v, label: t(`tnd30.mailcfg.sec.${v}`) })))

async function call<T>(url: string, opts: { method?: 'GET' | 'POST', body?: Record<string, unknown> } = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  return await $fetch<T>(url, { method: opts.method ?? 'GET', body: opts.body, headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } })
}
const msg = (e: unknown) => (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? errorMessage(e)

const state = ref<MailState | null>(null)
const form = reactive({ enabled: false, smtp_host: '', smtp_port: '587', smtp_security: 'starttls' as Security, smtp_user: '', smtp_password: '', from_name: '', from_email: '', reply_to: '' })
watch(preset, (k) => {
  const p = PRESETS[k]
  if (!p) return
  Object.assign(form, { smtp_host: p.host, smtp_port: String(p.port), smtp_security: p.security })
  if (p.user) form.smtp_user = p.user
})
const error = ref<string | null>(null)
async function load() {
  try {
    const s = await call<MailState>('/api/settings/mail')
    state.value = s
    Object.assign(form, { enabled: s.enabled, smtp_host: s.smtp_host, smtp_port: String(s.smtp_port), smtp_security: s.smtp_security, smtp_user: s.smtp_user, smtp_password: '', from_name: s.from_name, from_email: s.from_email, reply_to: s.reply_to })
  }
  catch (e) { error.value = msg(e) }
}
onMounted(load)

const saving = ref(false)
async function save() {
  error.value = null
  saving.value = true
  try {
    await call('/api/settings/mail', { method: 'POST', body: { ...form, smtp_port: Number(form.smtp_port), smtp_password: form.smtp_password || undefined } })
    toast.add(t('tnd30.mailcfg.saved'))
    await load()
  }
  catch (e) { error.value = msg(e) }
  finally { saving.value = false }
}

const testTo = ref('')
onMounted(async () => { const { data } = await supabase.auth.getUser(); testTo.value = data.user?.email ?? '' })
const busy = ref<'verify' | 'send' | null>(null)
const result = ref<{ kind: 'verify' | 'send', sent: boolean, reason?: string } | null>(null)
async function run(kind: 'verify' | 'send') {
  busy.value = kind
  result.value = null
  try {
    const r = await call<{ sent: boolean, reason?: string }>('/api/settings/mail/test', { method: 'POST', body: kind === 'verify' ? { verify: true } : { to: testTo.value } })
    result.value = { kind, ...r }
    await load()
  }
  catch (e) { result.value = { kind, sent: false, reason: msg(e) } }
  finally { busy.value = null }
}

const fmtTime = (iso: string) => new Intl.DateTimeFormat(tag.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const summary = computed(() => {
  const s = state.value
  if (!s) return null
  if (s.enabled && s.smtp_host && s.from_email) return { tone: 'success' as const, text: t('tnd30.mailcfg.on', { from: s.from_email }) }
  if (s.env_fallback) return { tone: 'info' as const, text: t('tnd30.mailcfg.env') }
  return { tone: 'warning' as const, text: t('tnd30.mailcfg.off') }
})
const resultText = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.kind === 'verify') return r.sent ? t('tnd30.mailcfg.verifyOk') : t('tnd30.mailcfg.testKo', { reason: r.reason ?? '' })
  return r.sent ? t('tnd30.mailcfg.testOk', { to: testTo.value }) : t('tnd30.mailcfg.testKo', { reason: r.reason ?? '' })
})
</script>

<template>
  <section class="wb-card wb-mail">
    <header>
      <h2 class="h3">{{ t('tnd30.mailcfg.title') }}</h2>
      <p class="small wb-mut">{{ t('tnd30.mailcfg.hint') }}</p>
      <WbBadge v-if="summary" :tone="summary.tone" size="sm" class="wb-mail-st">{{ summary.text }}</WbBadge>
    </header>
    <div class="wb-stack">
      <WbBanner v-if="error" tone="danger">{{ error }}</WbBanner>
      <!-- the form shows once the saved settings are loaded (no overwrite of what is being typed) -->
      <WbSkeleton v-if="!state && !error" :count="2" />
      <template v-if="state">
      <div class="wb-set-f">
        <div class="wb-set-wide"><WbSelect id="mail-preset" v-model="preset" :label="t('tnd30.mailcfg.presetLabel')" :options="presetOptions" :hint="presetHint" /></div>
        <WbInput id="mail-host" v-model="form.smtp_host" :label="t('tnd30.mailcfg.host')" placeholder="smtp.votre-fournisseur.com" autocomplete="off" />
        <div class="wb-mail-2">
          <WbInput id="mail-port" v-model="form.smtp_port" inputmode="numeric" :label="t('tnd30.mailcfg.port')" />
          <WbSelect id="mail-sec" v-model="form.smtp_security" :label="t('tnd30.mailcfg.security')" :options="securityOptions" />
        </div>
        <WbInput id="mail-user" v-model="form.smtp_user" :label="t('tnd30.mailcfg.user')" autocomplete="off" />
        <WbInput id="mail-pass" v-model="form.smtp_password" type="password" autocomplete="new-password" :label="t('tnd30.mailcfg.password')" :placeholder="state?.has_password ? t('tnd30.mailcfg.passKept') : ''" :hint="t('tnd30.mailcfg.passHint')" />
        <WbInput id="mail-from-name" v-model="form.from_name" :label="t('tnd30.mailcfg.fromName')" maxlength="80" :placeholder="t('tnd30.mailcfg.fromNamePh')" />
        <WbInput id="mail-from" v-model="form.from_email" type="email" :label="t('tnd30.mailcfg.from')" maxlength="254" placeholder="recrutement@votre-domaine.com" :hint="t('tnd30.mailcfg.fromHint')" />
        <WbInput id="mail-reply" v-model="form.reply_to" type="email" :label="t('tnd30.mailcfg.replyTo')" maxlength="254" :hint="t('tnd30.mailcfg.replyHint')" />
        <div class="wb-set-wide"><WbCheckbox v-model="form.enabled" :label="t('tnd30.mailcfg.enable')" /></div>
      </div>
      <div class="wb-row wb-wrap wb-mail-act">
        <WbButton :loading="saving" data-action="save-mail" @click="save">{{ t('rules.save') }}</WbButton>
        <WbButton variant="secondary" icon="link" :loading="busy === 'verify'" :disabled="!state?.smtp_host" data-action="verify-mail" @click="run('verify')">{{ t('tnd30.mailcfg.verify') }}</WbButton>
      </div>

      <div class="wb-mail-test">
        <WbInput id="mail-test" v-model="testTo" type="email" :label="t('tnd30.mailcfg.testTo')" />
        <WbButton variant="secondary" icon="send" :loading="busy === 'send'" :disabled="!state?.smtp_host || !testTo" data-action="test-mail" @click="run('send')">{{ t('tnd30.mailcfg.test') }}</WbButton>
      </div>
      <p v-if="result" :class="['small', result.sent ? 'wb-c-success' : 'wb-c-danger']" role="status">{{ resultText }}</p>
      <p v-else-if="state?.last_error" class="small wb-c-danger">{{ t('tnd30.mailcfg.lastError', { reason: state.last_error }) }}</p>
      <p v-else-if="state?.last_test_at" class="caption wb-mut">{{ t('tnd30.mailcfg.lastTest', { date: fmtTime(state.last_test_at) }) }}</p>
      <p class="caption wb-mut">{{ t('tnd30.mailcfg.deliverability') }}</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* same layout as the other Settings sections (their styles are scoped to the page) */
.wb-mail { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: var(--space-5); padding: var(--space-5); }
.wb-mail > header { display: flex; flex-direction: column; gap: 4px; }
.wb-mail > header h2, .wb-mail > header p { margin: 0; }
.wb-mail-st { margin-top: var(--space-2); width: fit-content; }
.wb-set-f { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3) var(--space-4); align-items: start; }
.wb-set-f > .wb-set-wide { grid-column: 1 / -1; }
.wb-mail-2 { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: var(--space-3); }
.wb-mail-act { gap: var(--space-2); }
.wb-mail-act :deep(.wb-btn) { margin: 0; }
.wb-mail-test { display: flex; gap: var(--space-2); align-items: flex-end; flex-wrap: wrap; }
.wb-mail-test :deep(.wb-field) { flex: 1 1 260px; }
.wb-mail-test :deep(.wb-btn) { margin: 0; }
.wb-stack > p { margin: 0; }
@container wbapp (max-width: 1023px) {
  .wb-mail { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
}
@container wbapp (max-width: 767px) {
  .wb-set-f { grid-template-columns: minmax(0, 1fr); }
}
</style>
