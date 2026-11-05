<script setup lang="ts">
// <html lang> follows the active locale (fr-FR / en-GB) for screen readers and native inputs.
const localeHead = useLocaleHead()
const { resolved, watchSystem } = useTheme()
useHead(() => ({ htmlAttrs: { 'lang': localeHead.value.htmlAttrs?.lang ?? 'fr-FR', 'data-theme': resolved.value } }))
onMounted(watchSystem)
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
