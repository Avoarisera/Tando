<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()
const supabase = useSupabaseClient()

useHead({ title: () => `${t('auth.forgot.title')} · WakaBods` })

const email = ref('')
const isLoading = ref(false)
const sentTo = ref<string | null>(null)
const hasError = ref(false)

const isReady = ref(false)
onMounted(() => { isReady.value = true })

async function handleSubmit() {
  if (!email.value) return
  isLoading.value = true
  hasError.value = false
  const { error } = await supabase.auth.resetPasswordForEmail(email.value, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  isLoading.value = false
  // Supabase answers OK for an unknown e-mail too, so the confirmation never
  // reveals whether an account exists. Only rate limits or outages land here.
  if (error && error.status !== 400 && error.status !== 422) {
    hasError.value = true
    return
  }
  sentTo.value = email.value
}
</script>

<template>
  <WbAuthShell>
    <template v-if="sentTo">
      <h1 class="h2">{{ t('auth.forgot.sentTitle') }}</h1>
      <p class="wb-mut2">{{ t('auth.forgot.sentText', { email: sentTo }) }}</p>
      <NuxtLink class="small" to="/login">{{ t('auth.forgot.back') }}</NuxtLink>
    </template>

    <template v-else>
      <h1 class="h2">{{ t('auth.forgot.title') }}</h1>
      <p class="wb-mut2">{{ t('auth.forgot.intro') }}</p>
      <WbBanner v-if="hasError" tone="danger">{{ t('auth.forgot.error') }}</WbBanner>
      <form method="post" class="wb-stack" novalidate @submit.prevent="handleSubmit">
        <WbInput
          id="email"
          v-model="email"
          :label="t('auth.login.email')"
          type="email"
          autocomplete="email"
          :placeholder="t('auth.login.emailPlaceholder')"
          :disabled="isLoading"
        />
        <WbButton type="submit" block :loading="isLoading" :disabled="!isReady || !email">
          {{ t('auth.forgot.submit') }}
        </WbButton>
      </form>
      <NuxtLink class="small" to="/login">{{ t('auth.forgot.back') }}</NuxtLink>
    </template>
  </WbAuthShell>
</template>
