<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isAdmin, loadProfile } = useCurrentUser()

useHead({ title: () => `${t('auth.login.submit')} · WakaBods` })

const email = ref('')
const password = ref('')
const isLoading = ref(false)
const hasError = ref(false)

// Until Vue has hydrated, @submit.prevent is not bound: a click would trigger a
// native submit that reloads /login and silently empties the form (TND-04).
const isReady = ref(false)
onMounted(() => { isReady.value = true })

// Navigate once auth state propagates — avoids the race between signInWithPassword
// resolving and useSupabaseUser() updating via onAuthStateChange
watch(user, async (newUser) => {
  if (!newUser) return
  await loadProfile()
  navigateTo(isAdmin.value ? '/dashboard' : '/')
})

async function handleSubmit() {
  isLoading.value = true
  hasError.value = false
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })
  if (error) {
    // Same message for an unknown e-mail and a wrong password (no account enumeration)
    hasError.value = true
    isLoading.value = false
  }
}
</script>

<template>
  <WbAuthShell>
    <h1 class="h2">{{ t('auth.login.title') }}</h1>

    <WbBanner v-if="hasError" tone="danger">{{ t('auth.login.error') }}</WbBanner>

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
      <div class="wb-stack-s" style="gap: 4px">
        <WbPasswordInput
          id="password"
          v-model="password"
          :label="t('auth.login.password')"
          autocomplete="current-password"
          :disabled="isLoading"
        />
        <NuxtLink class="small" to="/forgot-password">{{ t('auth.login.forgot') }}</NuxtLink>
      </div>
      <WbButton type="submit" size="lg" block :loading="isLoading" :disabled="!isReady">
        {{ isLoading ? t('auth.login.submitting') : t('auth.login.submit') }}
      </WbButton>
    </form>

    <div class="wb-row-b">
      <span class="small wb-mut">{{ t('auth.login.invite') }}</span>
      <WbLangSelect />
    </div>
  </WbAuthShell>
</template>
