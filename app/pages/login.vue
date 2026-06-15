<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isAdmin, loadProfile } = useCurrentUser()

const email = ref('')
const password = ref('')
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)

// Navigate once auth state propagates — avoids the race between signInWithPassword
// resolving and useSupabaseUser() updating via onAuthStateChange
watch(user, async (newUser) => {
  if (!newUser) return
  await loadProfile()
  navigateTo(isAdmin.value ? '/dashboard' : '/profile')
})

async function handleSubmit() {
  isLoading.value = true
  errorMessage.value = null
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    if (error) throw error
  } catch {
    errorMessage.value = 'Identifiants incorrects. Veuillez réessayer.'
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
    <div class="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-8">
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-bold text-gray-900">WakaBods</h1>
        <p class="mt-1 text-sm text-gray-500">Connectez-vous à votre espace</p>
      </div>

      <form @submit.prevent="handleSubmit" novalidate>
        <div class="space-y-5">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
              Adresse e-mail
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              :disabled="isLoading"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-60"
              placeholder="vous@exemple.com"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
              Mot de passe
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
              :disabled="isLoading"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-60"
              placeholder="••••••••"
            />
          </div>

          <div
            v-if="errorMessage"
            role="alert"
            class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {{ errorMessage }}
          </div>

          <button
            type="submit"
            :disabled="isLoading"
            class="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <AppSpinner v-if="isLoading" />
            {{ isLoading ? 'Connexion…' : 'Se connecter' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
