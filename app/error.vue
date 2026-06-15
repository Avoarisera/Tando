<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const user = useSupabaseUser()

const is404 = computed(() => props.error.statusCode === 404)
const is403 = computed(() => props.error.statusCode === 403)

const title = computed(() => {
  if (is404.value) return 'Page introuvable'
  if (is403.value) return 'Accès refusé'
  return 'Une erreur est survenue'
})

const description = computed(() => {
  if (is404.value) return "La page que vous cherchez n'existe pas ou a été déplacée."
  if (is403.value) return "Vous n'avez pas les droits nécessaires pour accéder à cette page."
  return props.error.message || 'Veuillez réessayer ou contacter votre administrateur.'
})

const homeLink = computed(() => (user.value ? '/profile' : '/login'))

function handleError() {
  clearError({ redirect: homeLink.value })
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div class="max-w-md w-full text-center">
      <p class="text-6xl font-bold text-brand-primary mb-4">
        {{ error.statusCode ?? '?' }}
      </p>
      <h1 class="text-2xl font-semibold text-gray-900 mb-2">{{ title }}</h1>
      <p class="text-gray-500 mb-8">{{ description }}</p>
      <AppButton @click="handleError">
        Retour à l'accueil
      </AppButton>
    </div>
  </div>
</template>
