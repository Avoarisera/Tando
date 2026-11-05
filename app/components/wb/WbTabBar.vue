<script setup lang="ts">
import type { NavItem } from '~/composables/useNavItems'

const props = defineProps<{ items: NavItem[], isActive: (item: NavItem) => boolean }>()
const { t } = useI18n()
const { open } = useLeavePanel()
// Home, Leave, [+], Calendar, Profile
const left = computed(() => props.items.slice(0, 2))
const right = computed(() => props.items.slice(2))
const label = (item: NavItem) => (item.key === 'leaves' ? t('nav.leavesShort') : t(`nav.${item.key}`))
</script>

<template>
  <nav class="wb-tabbar" :aria-label="t('nav.menu')">
    <NuxtLink v-for="item in left" :key="item.key" :to="item.to" :aria-current="isActive(item) ? 'page' : undefined">
      <span class="wb-tab-i"><WbIcon :name="item.icon" :size="22" /></span>
      <span class="caption2">{{ label(item) }}</span>
    </NuxtLink>
    <button type="button" class="wb-fab wb-fab-btn" :aria-label="t('nav.leave')" aria-haspopup="dialog" @click="open()">
      <WbIcon name="plus" :size="26" />
    </button>
    <NuxtLink v-for="item in right" :key="item.key" :to="item.to" :aria-current="isActive(item) ? 'page' : undefined">
      <span class="wb-tab-i"><WbIcon :name="item.icon" :size="22" /></span>
      <span class="caption2">{{ label(item) }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
/* Same look as the design's <a class="wb-fab">, on a button */
.wb-fab-btn { justify-self: center; display: grid; place-items: center; width: 52px; height: 52px; border: 0; border-radius: 50%; background: var(--brand); color: var(--on-brand); box-shadow: var(--shadow-2); margin-top: -18px; cursor: pointer; }
</style>
