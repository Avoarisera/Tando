<script setup lang="ts">
import type { Crumb } from '~/composables/usePageHeader'

defineProps<{ title?: string, crumbs?: Crumb[], role: string, userName: string, menuOpen?: boolean }>()
defineEmits<{ openMenu: [], signOut: [] }>()
const { t } = useI18n()
const { open } = useLeavePanel()
</script>

<template>
  <header class="wb-head">
    <WbButton
      v-if="role === 'admin'"
      class="wb-only-m-admin"
      data-role="admin"
      variant="ghost"
      icon="menu"
      icon-only
      aria-haspopup="dialog"
      :aria-expanded="menuOpen"
      @click="$emit('openMenu')"
    >
      {{ t('nav.menu') }}
    </WbButton>
    <div class="wb-head-t">
      <WbBreadcrumbs v-if="crumbs?.length" :items="crumbs" />
      <h1 v-else class="h2 wb-head-title">{{ title }}</h1>
    </div>
    <div class="wb-head-a">
      <WbButton v-if="role !== 'admin'" class="wb-hide-m" icon="plus" aria-haspopup="dialog" @click="open()">{{ t('nav.leave') }}</WbButton>
      <WbUserMenu :name="userName" @sign-out="$emit('signOut')" />
    </div>
  </header>
</template>

<style scoped>
.wb-head-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
