<script setup lang="ts">
import type { NavSection, NavItem } from '~/composables/useNavItems'

defineProps<{
  sections: NavSection[]
  isActive: (item: NavItem) => boolean
  collapsed?: boolean
  drawer?: boolean
  counts?: Partial<Record<string, number>>
}>()
defineEmits<{ toggle: [] }>()
const { t } = useI18n()
</script>

<template>
  <nav class="wb-side" :class="{ 'is-col': collapsed && !drawer, 'is-drawer': drawer }" :aria-label="t('nav.menu')">
    <div class="wb-side-l">
      <NuxtLink to="/" class="wb-side-home"><WbWordmark :size="21" :compact="collapsed && !drawer" /></NuxtLink>
    </div>
    <div v-for="section in sections" :key="section.key" class="wb-side-g">
      <h2 v-if="!collapsed || drawer" class="caption">{{ t(`nav.${section.key}`) }}</h2>
      <ul>
        <li v-for="item in section.items" :key="item.key">
          <NuxtLink
            :to="item.to"
            :title="collapsed && !drawer ? t(`nav.${item.key}`) : undefined"
            :aria-current="isActive(item) ? 'page' : undefined"
          >
            <WbIcon :name="item.icon" :size="18" />
            <span v-if="!collapsed || drawer">{{ t(`nav.${item.key}`) }}</span>
            <span v-if="counts?.[item.key]" class="wb-num wb-nav-n">{{ counts[item.key] }}</span>
          </NuxtLink>
        </li>
      </ul>
    </div>
    <button v-if="!drawer" type="button" class="wb-side-c" :aria-label="collapsed ? t('nav.expand') : t('nav.collapse')" @click="$emit('toggle')">
      <WbIcon :name="collapsed ? 'panel-left-open' : 'panel-left-close'" :size="18" />
      <span v-if="!collapsed" class="small">{{ t('nav.collapse') }}</span>
    </button>
  </nav>
</template>

<style scoped>
.wb-side .wb-side-home { all: unset; cursor: pointer; display: flex; border-radius: var(--radius-sm); }
.wb-side .wb-side-home:hover { background: none; }
/* Drawer (admin under 768 px): full labels, whatever the container width. */
.wb-side.is-drawer { display: flex; width: min(300px, 85vw); height: 100%; overflow-y: auto; box-shadow: var(--shadow-3); }
.wb-side.is-drawer h2, .wb-side.is-drawer a span:not(.wb-nav-n) { display: initial; }
.wb-side.is-drawer a { justify-content: flex-start; padding: 0 var(--space-3); }
.wb-side.is-drawer .wb-nav-n { display: grid; }
.wb-side.is-drawer .wb-side-l .wb-word { font-size: 21px !important; }
.wb-side.is-drawer .wb-side-l .wb-word::before { content: none; }
</style>
