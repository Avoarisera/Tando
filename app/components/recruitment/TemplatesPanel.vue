<script setup lang="ts">
import type { EmailTemplate } from '~/composables/useRecruitment'

/** TND-30 lot 2 — the 4 candidate e-mails, edited by HR, with their variables */
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const toast = useToast()
const { listTemplates, saveTemplate } = useRecruitment()

const items = ref<EmailTemplate[]>([])
const key = ref<EmailTemplate['key']>('acknowledgement')
const error = ref<string | null>(null)
const saving = ref(false)
onMounted(async () => {
  try { items.value = await listTemplates() }
  catch (e) { error.value = errorMessage(e) }
})
const current = computed(() => items.value.find(i => i.key === key.value) ?? null)
const tabs = computed(() => (['acknowledgement', 'invitation', 'offer', 'rejection'] as const).map(id => ({ id, label: t(`tnd30.tpl.${id}`) })))
const VARS = ['prenom', 'nom', 'poste', 'entreprise', 'date', 'lieu', 'lien_suivi'] as const
const brace = (v: string) => `{${v}}`
const preview = computed(() => (current.value
  ? fillTemplate(current.value.body, { prenom: 'Awa', nom: 'Diallo', poste: 'Développeur·se Vue', entreprise: 'WakaBods', date: 'jeudi 12 novembre à 10:00 (45 min)', lieu: 'Visio · https://meet…', lien_suivi: 'https://…/carrieres/suivi/…' })
  : ''))
async function save() {
  if (!current.value) return
  error.value = null
  if (!current.value.subject.trim() || !current.value.body.trim()) { error.value = t('tnd30.mail.required'); return }
  saving.value = true
  try { await saveTemplate(current.value); toast.add(t('tnd30.tpl.saved')) }
  catch (e) { error.value = errorMessage(e) }
  finally { saving.value = false }
}
</script>

<template>
  <WbSidePanel :title="t('tnd30.tpl.title')" :subtitle="t('tnd30.tpl.hint')" :width="680" @close="emit('close')">
    <WbBanner v-if="error" tone="danger">{{ error }}</WbBanner>
    <WbTabs v-model="key" class="wb-tp-tabs" :tabs="tabs" :label="t('tnd30.tpl.title')" />
    <template v-if="current">
      <WbInput id="tpl-subject" v-model="current.subject" :label="t('tnd30.mail.subject')" maxlength="200" />
      <WbTextarea id="tpl-body" v-model="current.body" :label="t('tnd30.mail.message')" :max="6000" :rows="12" />
      <p class="caption wb-mut">{{ t('tnd30.tpl.vars') }} <code v-for="v in VARS" :key="v" class="wb-tp-var">{{ brace(v) }}</code></p>
      <details class="wb-tp-prev">
        <summary class="small">{{ t('tnd30.tpl.preview') }}</summary>
        <p class="small">{{ preview }}</p>
      </details>
      <div class="wb-panel-f"><WbButton block :loading="saving" @click="save">{{ t('rules.save') }}</WbButton></div>
    </template>
  </WbSidePanel>
</template>

<style scoped>
.wb-tp-tabs { flex: none; }
.wb-tp-var { margin-left: 4px; padding: 1px 5px; border-radius: 4px; background: var(--surface-2); font-size: 12px; }
.wb-tp-prev summary { cursor: pointer; color: var(--brand-text); }
.wb-tp-prev p { white-space: pre-wrap; padding: var(--space-3); border-radius: var(--radius-md); background: var(--surface-2); }
</style>
