<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()
const supabase = useSupabaseClient()
const route = useRoute()
const { isAdmin, loadProfile } = useCurrentUser()

useHead({ title: () => `${t('auth.reset.title')} · WakaBods` })

const password = ref('')
const confirm = ref('')
const submitted = ref(false)
const isLoading = ref(false)
const hasError = ref(false)
// null while the recovery session from the e-mail link is being checked
const hasSession = ref<boolean | null>(null)

onMounted(async () => {
  if (route.query.error || route.query.error_description) {
    hasSession.value = false
    return
  }
  // getSession() waits for supabase-js to exchange the ?code= of the link
  const { data } = await supabase.auth.getSession()
  hasSession.value = !!data.session
})

const score = computed(() => passwordStrength(password.value))
const level = computed(() => strengthLevel(score.value))
const gaugeState = computed(() => ({ weak: 'over', medium: 'busy', strong: 'ok' } as const)[level.value])

const passwordError = computed(() =>
  submitted.value && !isPasswordValid(password.value) ? t('auth.reset.tooWeak') : null)
const confirmError = computed(() =>
  submitted.value && confirm.value !== password.value ? t('auth.reset.mismatch') : null)

// Leave without changing the password: close the recovery session the e-mail link opened
const leaving = ref(false)
async function backToLogin() {
  leaving.value = true
  try { await supabase.auth.signOut() }
  finally { await navigateTo('/login') }
}

async function handleSubmit() {
  submitted.value = true
  hasError.value = false
  if (passwordError.value || confirmError.value) return
  isLoading.value = true
  const { error } = await supabase.auth.updateUser({ password: password.value })
  if (error) {
    hasError.value = true
    isLoading.value = false
    return
  }
  await loadProfile()
  await navigateTo(isAdmin.value ? '/dashboard' : '/')
}
</script>

<template>
  <WbAuthShell>
    <h1 class="h2">{{ t('auth.reset.title') }}</h1>

    <template v-if="hasSession === false">
      <WbBanner tone="warning">{{ t('auth.reset.expired') }}</WbBanner>
      <WbButton to="/forgot-password" block>{{ t('auth.reset.newLink') }}</WbButton>
      <WbButton variant="ghost" block icon="arrow-left" to="/login">{{ t('auth.forgot.back') }}</WbButton>
    </template>

    <form v-else method="post" class="wb-stack" novalidate @submit.prevent="handleSubmit">
      <WbBanner v-if="hasError" tone="danger">{{ t('auth.reset.error') }}</WbBanner>
      <WbPasswordInput
        id="password"
        v-model="password"
        :label="t('auth.reset.password')"
        autocomplete="new-password"
        :hint="t('auth.reset.hint')"
        :error="passwordError"
        :disabled="isLoading"
      />
      <WbCapacityGauge
        :label="t('auth.reset.strength')"
        :value="score"
        :max="4"
        unit=""
        :state="gaugeState"
        :state-label="password ? t(`auth.reset.${level}`) : undefined"
      />
      <WbPasswordInput
        id="password-confirm"
        v-model="confirm"
        :label="t('auth.reset.confirm')"
        autocomplete="new-password"
        :error="confirmError"
        :disabled="isLoading"
      />
      <WbButton type="submit" block :loading="isLoading" :disabled="hasSession !== true">
        {{ t('auth.reset.submit') }}
      </WbButton>
      <WbButton variant="ghost" block icon="arrow-left" :loading="leaving" data-action="back-to-login" @click="backToLogin">{{ t('auth.forgot.back') }}</WbButton>
    </form>
  </WbAuthShell>
</template>
