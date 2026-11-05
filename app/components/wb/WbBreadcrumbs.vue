<script setup lang="ts">
import type { Crumb } from '~/composables/usePageHeader'

defineProps<{ items: Crumb[] }>()
</script>

<template>
  <nav class="wb-crumbs" aria-label="Fil d’Ariane">
    <ol>
      <li v-for="(c, i) in items" :key="i">
        <WbIcon v-if="i > 0" name="chevron-right" :size="14" />
        <NuxtLink v-if="c.to && i < items.length - 1" :to="c.to">{{ c.label }}</NuxtLink>
        <span v-else :aria-current="i === items.length - 1 ? 'page' : undefined">{{ c.label }}</span>
      </li>
    </ol>
  </nav>
</template>
