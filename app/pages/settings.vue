<script setup lang="ts">
definePageMeta({ titleKey: 'nav.settings', middleware: 'admin-only', layout: 'private' })

const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const supabase = useSupabaseClient()
const toast = useToast()

interface Settings {
  legal_name: string
  vat_number: string
  address: string
  iban: string
  bic: string
  default_country: string
  invoice_prefix: string
  next_invoice_number: number
  invoice_footer: string
  careers_intro: string
}
const form = reactive<Settings>({ legal_name: '', vat_number: '', address: '', iban: '', bic: '', default_country: 'FR', invoice_prefix: 'FAC', next_invoice_number: 1, invoice_footer: '', careers_intro: '' })
const nextNumber = ref('1')
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saving = ref(false)
const countries = computed(() => countryOptions(tag.value))

async function load() {
  isLoading.value = true
  loadError.value = null
  const { data, error } = await supabase
    .from('company_settings')
    .select('legal_name, vat_number, address, iban, bic, default_country, invoice_prefix, next_invoice_number, invoice_footer, careers_intro')
    .maybeSingle()
  isLoading.value = false
  if (error) {
    loadError.value = error.message
    return
  }
  if (data) {
    Object.assign(form, data)
    nextNumber.value = String(data.next_invoice_number)
  }
}
onMounted(load)

const preview = computed(() => `${form.invoice_prefix || 'FAC'}-${new Date().getFullYear()}-${String(Number(nextNumber.value) || 1).padStart(3, '0')}`)

async function save() {
  saveError.value = null
  const n = Number(nextNumber.value)
  if (!Number.isInteger(n) || n < 1) {
    saveError.value = t('r8a.settings.numberInvalid')
    return
  }
  if (!form.invoice_prefix.trim()) {
    saveError.value = t('r8a.settings.prefixRequired')
    return
  }
  saving.value = true
  const { error } = await supabase
    .from('company_settings')
    .update({
      legal_name: form.legal_name.trim(),
      vat_number: form.vat_number.trim(),
      address: form.address.trim(),
      iban: form.iban.replace(/\s+/g, ' ').trim(),
      bic: form.bic.trim(),
      default_country: form.default_country,
      invoice_prefix: form.invoice_prefix.trim(),
      next_invoice_number: n,
      invoice_footer: form.invoice_footer.trim(),
      careers_intro: form.careers_intro.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', true)
  saving.value = false
  if (error) {
    saveError.value = error.message
    return
  }
  toast.add(t('r8a.settings.saved'))
}
</script>

<template>
  <div class="wb-page wb-stack">
    <WbErrorState v-if="loadError" :message="loadError" @retry="load" />
    <WbSkeleton v-else-if="isLoading" :count="2" />
    <form v-else class="wb-set" novalidate @submit.prevent="save">
      <!-- Settings layout: section label on the left, fields on the right -->
      <section class="wb-card wb-set-s">
        <header><h2 class="h3">{{ t('r8a.settings.company') }}</h2><p class="small wb-mut">{{ t('r8a.settings.companyHint') }}</p></header>
        <div class="wb-set-f">
          <WbInput id="set-name" v-model="form.legal_name" :label="t('r8a.settings.legalName')" maxlength="120" />
          <WbInput id="set-vat" v-model="form.vat_number" :label="t('r8a.settings.vat')" maxlength="40" />
          <div class="wb-set-wide"><WbTextarea id="set-address" v-model="form.address" :label="t('r8a.settings.address')" :max="300" :rows="2" /></div>
          <WbInput id="set-iban" v-model="form.iban" :label="t('r8a.settings.iban')" maxlength="40" autocomplete="off" />
          <WbInput id="set-bic" v-model="form.bic" :label="t('r8a.settings.bic')" maxlength="15" autocomplete="off" />
          <WbSelect id="set-country" v-model="form.default_country" :label="t('r8a.settings.defaultCountry')" :options="countries" :hint="t('r8a.settings.defaultCountryHint')" />
        </div>
      </section>

      <section class="wb-card wb-set-s">
        <header><h2 class="h3">{{ t('r8a.settings.billing') }}</h2><p class="small wb-mut">{{ t('r8a.settings.billingHint', { ref: preview }) }}</p></header>
        <div class="wb-set-f">
          <WbInput id="set-prefix" v-model="form.invoice_prefix" :label="t('r8a.settings.prefix')" maxlength="12" />
          <WbInput id="set-next" v-model="nextNumber" type="number" min="1" inputmode="numeric" :label="t('r8a.settings.nextNumber')" />
          <div class="wb-set-wide"><WbTextarea id="set-footer" v-model="form.invoice_footer" :label="t('r8a.settings.footer')" :max="500" :hint="t('r8a.settings.footerHint')" /></div>
        </div>
      </section>

      <section class="wb-card wb-set-s">
        <header><h2 class="h3">{{ t('tnd30.settings.title') }}</h2><p class="small wb-mut">{{ t('tnd30.settings.hint') }}</p></header>
        <div class="wb-set-f">
          <div class="wb-set-wide"><WbTextarea id="set-careers" v-model="form.careers_intro" :label="t('tnd30.settings.intro')" :max="2000" :rows="4" :hint="t('tnd30.settings.introHint')" /></div>
          <div class="wb-set-wide"><WbButton variant="secondary" size="sm" icon="external-link" to="/carrieres" target="_blank">{{ t('tnd30.settings.open') }}</WbButton></div>
        </div>
      </section>

      <section class="wb-card wb-set-s">
        <header><h2 class="h3">{{ t('r8a.settings.integrations') }}</h2></header>
        <ul class="wb-list wb-set-f1">
          <li>
            <WbIcon name="link" />
            <div class="wb-grow"><p class="h3">Linear</p><p class="small wb-mut">{{ t('r8a.settings.linearHint') }}</p></div>
            <WbButton variant="secondary" size="sm" to="/velocite">{{ t('r8a.settings.manage') }}</WbButton>
          </li>
        </ul>
      </section>

      <div class="wb-set-bar">
        <WbBanner v-if="saveError" tone="danger">{{ saveError }}</WbBanner>
        <span v-else class="small wb-mut">{{ t('v2.settingsSaveHint') }}</span>
        <WbButton type="submit" :loading="saving">{{ t('rules.save') }}</WbButton>
      </div>
    </form>
    <!-- outside the company form: its own buttons and saving (TND-30 lot 4) -->
    <MailSettings v-if="!loadError && !isLoading" />
  </div>
</template>

<style scoped>
.wb-set { display: flex; flex-direction: column; gap: var(--space-3); }
.wb-set-s { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: var(--space-5); padding: var(--space-5); }
.wb-set-s > header { display: flex; flex-direction: column; gap: 4px; }
.wb-set-f { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3) var(--space-4); }
.wb-set-f > .wb-set-wide { grid-column: 1 / -1; }
.wb-set-f1 { margin: 0; }
/* Save bar stays visible at the bottom of long forms */
.wb-set-bar { position: sticky; bottom: 0; z-index: 4; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-2); }
.wb-set-bar :deep(.wb-btn) { margin: 0; flex: none; }
/* Wide screens: two columns of cards instead of one long form */
@container wbapp (min-width: 1280px) {
  .wb-set { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: stretch; }
  .wb-set-s { grid-template-columns: minmax(0, 1fr); gap: var(--space-4); align-content: start; }
  .wb-set-s:first-child { grid-row: span 2; }
  .wb-set-bar { grid-column: 1 / -1; }
}
@container wbapp (max-width: 1023px) {
  .wb-set-s { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
}
@container wbapp (max-width: 767px) {
  .wb-set-f { grid-template-columns: minmax(0, 1fr); }
  .wb-set-s { padding: var(--space-4); }
}
</style>
