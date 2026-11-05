<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()
const supabase = useSupabaseClient()
const route = useRoute()
const { isAdmin, loadProfile } = useCurrentUser()

useHead({ title: () => `${t('r8a.invite.title')} · WakaBods` })
const firstName = ref('')

const password = ref('')
const confirm = ref('')
const submitted = ref(false)
const isLoading = ref(false)
const hasError = ref(false)
// null while the recovery session from the e-mail link is being checked
const hasSession = ref<boolean | null>(null)

onMounted(async () => {
  // Invitations are sent by the server (no PKCE verifier in this browser), so the
  // link carries the tokens in the hash (#access_token=…). The app's client runs in
  // PKCE mode and ignores them: open the session from the hash ourselves.
  const hash = new URLSearchParams(window.location.hash.slice(1))
  if (route.query.error || route.query.error_description || hash.get('error')) {
    hasSession.value = false
    return
  }
  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    history.replaceState(null, '', window.location.pathname)
  }
  const { data } = await supabase.auth.getSession()
  hasSession.value = !!data.session
  const meta = data.session?.user.user_metadata as { first_name?: string } | undefined
  firstName.value = meta?.first_name ?? ''
})

const score = computed(() => passwordStrength(password.value))
const level = computed(() => strengthLevel(score.value))
const gaugeState = computed(() => ({ weak: 'over', medium: 'busy', strong: 'ok' } as const)[level.value])

const passwordError = computed(() =>
  submitted.value && !isPasswordValid(password.value) ? t('auth.reset.tooWeak') : null)
const confirmError = computed(() =>
  submitted.value && confirm.value !== password.value ? t('auth.reset.mismatch') : null)

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
    <h1 class="h2">{{ firstName ? t('r8a.invite.titleName', { name: firstName }) : t('r8a.invite.title') }}</h1>
    <p v-if="hasSession" class="wb-mut2">{{ t('r8a.invite.intro') }}</p>

    <template v-if="hasSession === false">
      <WbBanner tone="warning">{{ t('r8a.invite.expired') }}</WbBanner>
      <WbButton to="/login" block>{{ t('auth.forgot.back') }}</WbButton>
    </template>

    <form v-else method="post" class="wb-stack" novalidate @submit.prevent="handleSubmit">
      <WbBanner v-if="hasError" tone="danger">{{ t('auth.reset.error') }}</WbBanner>
      <WbPasswordInput
        id="password"
        v-model="password"
        :label="t('r8a.invite.password')"
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
      <WbLangSelect with-label />
      <WbButton type="submit" size="lg" block :loading="isLoading" :disabled="hasSession !== true">
        {{ t('r8a.invite.submit') }}
      </WbButton>
    </form>
  </WbAuthShell>
</template>
