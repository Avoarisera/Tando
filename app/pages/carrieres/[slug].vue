<script setup lang="ts">
import type { PublicOpening } from '~/utils/recruitment'

// Public job page + application form (TND-30). Mobile first, < 2 minutes to apply.
definePageMeta({ layout: false })
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const route = useRoute()
const slug = String(route.params.slug)

const { data, error } = await useFetch<{ company: { name: string }, opening: PublicOpening }>(`/api/careers/${slug}`)
const o = computed(() => data.value?.opening)
useHead(() => ({
  title: o.value ? `${o.value.title} · ${data.value?.company.name}` : t('tnd30.public.careers'),
  meta: o.value ? [{ name: 'description', content: o.value.summary || o.value.title }, { property: 'og:title', content: o.value.title }] : [],
}))
const salary = computed(() => (o.value ? salaryLabel(o.value, tag.value, t('tnd30.perYear'), t('tnd30.perMonth')) : null))

// ── Form ─────────────────────────────────────────────────────────────────────
const form = reactive({ first_name: '', last_name: '', email: '', phone: '', linkedin_url: '', cover_letter_text: '', consent: false, consent_pool: false, website: '' })
const answers = reactive<Record<string, string>>({})
const cv = ref<File | null>(null)
const letter = ref<File | null>(null)
const letterMode = ref<'file' | 'text'>('file')
const errors = ref<string[]>([])
const formError = ref<string | null>(null)
const sending = ref(false)
const done = ref(false)
const track = ref<string | null>(null)
const MAX = 10 * 1024 * 1024
const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const has = (k: string) => errors.value.includes(k)

function pick(e: Event, target: 'cv' | 'letter') {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null
  errors.value = errors.value.filter(x => !x.startsWith(target === 'cv' ? 'cv' : 'cover_letter'))
  if (f && f.size > MAX) errors.value.push(target === 'cv' ? 'cv_size' : 'cover_letter_size')
  if (target === 'cv') cv.value = f
  else letter.value = f
}
const sizeLabel = (f: File) => (f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))} Ko` : `${(f.size / 1024 / 1024).toLocaleString(tag.value, { maximumFractionDigits: 1 })} Mo`)

function clientCheck(): string[] {
  const e: string[] = []
  if (!form.first_name.trim()) e.push('first_name')
  if (!form.last_name.trim()) e.push('last_name')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) e.push('email')
  if (!cv.value) e.push('cv')
  if (o.value?.cover_letter === 'required' && !letter.value && !form.cover_letter_text.trim()) e.push('cover_letter')
  for (const q of o.value?.questions ?? []) if (q.required && !(answers[q.id] ?? '').trim()) e.push(`q:${q.id}`)
  if (!form.consent) e.push('consent')
  return e
}

async function submit() {
  formError.value = null
  errors.value = clientCheck()
  if (errors.value.length) {
    await nextTick()
    document.querySelector<HTMLElement>('.wb-apply [aria-invalid="true"], .wb-apply .is-err input')?.focus()
    return
  }
  const fd = new FormData()
  for (const [k, v] of Object.entries(form)) fd.append(k, typeof v === 'boolean' ? String(v) : v.trim())
  fd.append('answers', JSON.stringify(answers))
  fd.append('source', typeof route.query.source === 'string' ? route.query.source : 'careers')
  fd.append('cv', cv.value!)
  if (letter.value && letterMode.value === 'file') fd.append('cover_letter_file', letter.value)
  if (letterMode.value === 'file') fd.set('cover_letter_text', '')
  sending.value = true
  try {
    const r = await $fetch<{ ok: true, track?: string }>(`/api/careers/${slug}/apply`, { method: 'POST', body: fd })
    track.value = r.track ?? null
    done.value = true
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  catch (e) {
    const err = e as { statusCode?: number, data?: { data?: { errors?: string[] }, statusMessage?: string } }
    errors.value = err.data?.data?.errors ?? []
    formError.value = err.data?.statusMessage ?? t('tnd30.apply.error')
  }
  finally { sending.value = false }
}
const fieldErr = (k: string) => (has(k) ? t(`tnd30.apply.err.${k.startsWith('q:') ? 'question' : k}`) : undefined)
</script>

<template>
  <NuxtLayout name="public" :company="data?.company.name">
    <div v-if="error || !o" class="wb-card">
      <WbEmptyState art="search" :title="t('tnd30.public.goneTitle')">
        {{ t('tnd30.public.goneText') }}
        <template #action><WbButton to="/carrieres">{{ t('tnd30.public.allOpenings') }}</WbButton></template>
      </WbEmptyState>
    </div>

    <div v-else-if="done" class="wb-card wb-apply-ok" role="status">
      <WbIcon name="circle-check" :size="40" />
      <h1 class="h2">{{ t('tnd30.apply.thanksTitle', { name: form.first_name }) }}</h1>
      <p>{{ t('tnd30.apply.thanksText', { job: o.title }) }}</p>
      <p class="small wb-mut2">{{ t('tnd30.apply.thanksMail', { email: form.email }) }}</p>
      <div class="wb-row wb-wrap" style="gap: 8px; justify-content: center">
        <WbButton v-if="track" :to="`/carrieres/suivi/${track}`" icon="eye">{{ t('tnd30.track.follow') }}</WbButton>
        <WbButton variant="secondary" to="/carrieres">{{ t('tnd30.public.allOpenings') }}</WbButton>
      </div>
      <p v-if="track" class="caption wb-mut">{{ t('tnd30.track.keepLink') }}</p>
    </div>

    <div v-else class="wb-job">
      <article class="wb-stack wb-job-main">
        <NuxtLink to="/carrieres" class="small wb-job-back"><WbIcon name="chevron-left" :size="16" />{{ t('tnd30.public.allOpenings') }}</NuxtLink>
        <header class="wb-stack-s">
          <h1 class="display">{{ o.title }}</h1>
          <p class="wb-job-meta small">
            <span v-if="o.teams?.name"><WbIcon name="users" :size="14" />{{ o.teams.name }}</span>
            <span v-if="o.location"><WbIcon name="globe" :size="14" />{{ o.location }}</span>
            <span><WbIcon name="file-text" :size="14" />{{ t(`tnd30.contract.${o.contract_type}`) }}</span>
            <span><WbIcon name="house" :size="14" />{{ t(`tnd30.remote.${o.remote}`) }}</span>
          </p>
          <p v-if="salary" class="wb-job-sal h3 wb-num">{{ salary }}</p>
          <p v-if="o.summary" class="wb-mut2">{{ o.summary }}</p>
        </header>
        <section v-if="o.missions" class="wb-stack-s"><h2 class="h2">{{ t('tnd30.fields.missions') }}</h2><RichText :text="o.missions" /></section>
        <section v-if="o.profile" class="wb-stack-s"><h2 class="h2">{{ t('tnd30.fields.profile') }}</h2><RichText :text="o.profile" /></section>
        <section v-if="o.benefits" class="wb-stack-s"><h2 class="h2">{{ t('tnd30.fields.benefits') }}</h2><RichText :text="o.benefits" /></section>
        <section v-if="o.process_steps.length" class="wb-stack-s">
          <h2 class="h2">{{ t('tnd30.fields.process') }}</h2>
          <ol class="wb-job-steps">
            <li v-for="(s, i) in o.process_steps" :key="i"><b class="wb-num">{{ i + 1 }}</b><span>{{ s }}</span></li>
          </ol>
        </section>
      </article>

      <aside class="wb-job-side">
        <form class="wb-card wb-stack wb-apply" novalidate @submit.prevent="submit">
          <h2 class="h2">{{ t('tnd30.apply.title') }}</h2>
          <p class="caption wb-mut2">{{ t('tnd30.apply.time') }}</p>
          <WbBanner v-if="formError" tone="danger">{{ formError }}</WbBanner>
          <div class="wb-apply-2">
            <WbInput id="ap-first" v-model="form.first_name" :label="t('r8a.people.firstName')" autocomplete="given-name" required :error="fieldErr('first_name')" />
            <WbInput id="ap-last" v-model="form.last_name" :label="t('r8a.people.lastName')" autocomplete="family-name" required :error="fieldErr('last_name')" />
          </div>
          <WbInput id="ap-email" v-model="form.email" type="email" :label="t('auth.login.email')" autocomplete="email" inputmode="email" required :error="fieldErr('email')" />
          <WbInput id="ap-phone" v-model="form.phone" type="tel" :label="t('tnd30.apply.phone')" autocomplete="tel" inputmode="tel" :error="fieldErr('phone')" />

          <div :class="['wb-file', { 'is-err': has('cv') || has('cv_type') || has('cv_size') }]">
            <label for="ap-cv" class="wb-label">{{ t('tnd30.apply.cv') }} <span aria-hidden="true">*</span></label>
            <label class="wb-file-drop" for="ap-cv">
              <WbIcon name="upload" :size="18" />
              <span v-if="cv" class="small"><b>{{ cv.name }}</b> · {{ sizeLabel(cv) }}</span>
              <span v-else class="small">{{ t('tnd30.apply.choose') }} <span class="wb-mut2">· PDF, DOC, DOCX · 10 Mo</span></span>
            </label>
            <input id="ap-cv" class="wb-sr" type="file" :accept="ACCEPT" :aria-invalid="has('cv') || has('cv_type') || has('cv_size')" @change="pick($event, 'cv')">
            <p v-if="has('cv') || has('cv_type') || has('cv_size')" class="caption wb-c-danger">{{ t(`tnd30.apply.err.${has('cv_type') ? 'cv_type' : has('cv_size') ? 'cv_size' : 'cv'}`) }}</p>
          </div>

          <div v-if="o.cover_letter !== 'none'" :class="['wb-stack-s', { 'is-err': has('cover_letter') }]">
            <div class="wb-row-b">
              <span class="wb-label">{{ t('tnd30.apply.letter') }} <span v-if="o.cover_letter === 'required'" aria-hidden="true">*</span><span v-else class="caption wb-mut2">{{ t('tnd30.apply.optional') }}</span></span>
              <WbSegmented v-model="letterMode" :options="[{ value: 'file', label: t('tnd30.apply.letterFile') }, { value: 'text', label: t('tnd30.apply.letterText') }]" :label="t('tnd30.apply.letter')" />
            </div>
            <template v-if="letterMode === 'file'">
              <label class="wb-file-drop" for="ap-letter">
                <WbIcon name="upload" :size="18" />
                <span v-if="letter" class="small"><b>{{ letter.name }}</b> · {{ sizeLabel(letter) }}</span>
                <span v-else class="small">{{ t('tnd30.apply.choose') }}</span>
              </label>
              <input id="ap-letter" class="wb-sr" type="file" :accept="ACCEPT" @change="pick($event, 'letter')">
            </template>
            <WbTextarea v-else id="ap-letter-text" v-model="form.cover_letter_text" :label="t('tnd30.apply.letterText')" :max="6000" :rows="6" />
            <p v-if="has('cover_letter') || has('cover_letter_type') || has('cover_letter_size')" class="caption wb-c-danger">{{ t(`tnd30.apply.err.${has('cover_letter_type') ? 'cv_type' : has('cover_letter_size') ? 'cv_size' : 'cover_letter'}`) }}</p>
          </div>

          <WbInput id="ap-link" v-model="form.linkedin_url" type="url" :label="t('tnd30.apply.link')" placeholder="https://" inputmode="url" :error="fieldErr('linkedin_url')" />

          <template v-for="q in o.questions" :key="q.id">
            <WbTextarea :id="`ap-q-${q.id}`" v-model="answers[q.id]" :label="q.label" :required="q.required" :max="1000" :rows="2" :error="fieldErr(`q:${q.id}`)" />
          </template>

          <!-- honeypot: invisible to people, filled by bots -->
          <div class="wb-hp" aria-hidden="true"><label>Website<input v-model="form.website" tabindex="-1" autocomplete="off"></label></div>

          <div class="wb-stack-s wb-apply-consent">
            <WbCheckbox v-model="form.consent" :label="t('tnd30.apply.consent', { company: data?.company.name })" />
            <p v-if="has('consent')" class="caption wb-c-danger">{{ t('tnd30.apply.err.consent') }}</p>
            <WbCheckbox v-model="form.consent_pool" :label="t('tnd30.apply.pool')" />
            <p class="caption wb-mut">{{ t('tnd30.apply.privacy') }}</p>
          </div>
          <WbButton type="submit" size="lg" block :loading="sending" icon="send">{{ t('tnd30.apply.send') }}</WbButton>
        </form>
      </aside>
    </div>
  </NuxtLayout>
</template>

<style scoped>
.wb-job { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 400px); gap: var(--space-6); align-items: start; }
.wb-job-main { gap: var(--space-5); }
.wb-job-main h1 { margin: 0; }
.wb-job-back { display: inline-flex; align-items: center; gap: 2px; color: var(--brand-text); text-decoration: none; width: fit-content; }
.wb-job-meta { display: flex; flex-wrap: wrap; gap: 6px var(--space-4); margin: 0; color: var(--ink-2); }
.wb-job-meta span { display: inline-flex; align-items: center; gap: 6px; }
.wb-job-sal { margin: 0; color: var(--brand-text); }
.wb-job-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.wb-job-steps li { display: flex; align-items: center; gap: var(--space-3); }
.wb-job-steps b { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--brand-tint); color: var(--brand-text); font-size: 13px; flex: none; }
.wb-job-side { position: sticky; top: var(--space-4); }
.wb-apply { padding: var(--space-5); gap: var(--space-3); }
.wb-apply h2 { margin: 0; }
.wb-apply-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.wb-file { display: flex; flex-direction: column; gap: 6px; }
.wb-file-drop { display: flex; align-items: center; gap: var(--space-2); min-height: 48px; padding: var(--space-2) var(--space-3); border: 1.5px dashed var(--border-strong, var(--border)); border-radius: var(--radius-md); background: var(--surface-2); cursor: pointer; }
.wb-file-drop:hover { border-color: var(--brand); }
.wb-file input:focus-visible + *, .wb-file-drop:focus-within { outline: 2px solid var(--focus); }
.is-err .wb-file-drop { border-color: var(--danger-solid); }
.wb-hp { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
.wb-apply-ok { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--space-3); padding: var(--space-8) var(--space-5); color: var(--ink); }
.wb-apply-ok :deep(.wb-ic) { color: var(--success-solid, var(--brand)); }
.wb-apply-ok h1, .wb-apply-ok p { margin: 0; max-width: 520px; }
@container wbapp (max-width: 900px) {
  .wb-job { grid-template-columns: minmax(0, 1fr); }
  .wb-job-side { position: static; }
}
@container wbapp (max-width: 480px) {
  .wb-apply-2 { grid-template-columns: minmax(0, 1fr); }
  .wb-apply { padding: var(--space-4); }
}
</style>
