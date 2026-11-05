<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()
const user = useSupabaseUser()
// error.vue replaces app.vue: apply the language and theme here too
const localeHead = useLocaleHead()
const { resolved, watchSystem } = useTheme()
useHead(() => ({ htmlAttrs: { 'lang': localeHead.value.htmlAttrs?.lang ?? 'fr-FR', 'data-theme': resolved.value } }))
onMounted(watchSystem)

const kind = computed(() => (props.error.statusCode === 404 ? 'notFound' : props.error.statusCode === 403 ? 'forbidden' : 'other'))
const description = computed(() => (kind.value === 'other' && props.error.message ? props.error.message : t(`errorPage.${kind.value}Text`)))

function goHome() {
  clearError({ redirect: user.value ? '/' : '/login' })
}
</script>

<template>
  <WbAuthShell>
    <p class="display wb-num wb-err-code">{{ error.statusCode ?? '?' }}</p>
    <h1 class="h2">{{ t(`errorPage.${kind}Title`) }}</h1>
    <p class="wb-mut2">{{ description }}</p>
    <WbButton block icon="house" @click="goHome">{{ t('errorPage.home') }}</WbButton>
  </WbAuthShell>
</template>

<style scoped>
.wb-err-code { color: var(--brand-text); }
</style>
