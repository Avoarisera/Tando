<script setup lang="ts">
export type WbArt = 'calendar' | 'sun' | 'inbox' | 'search' | 'invoice' | 'link'
withDefaults(defineProps<{ art?: WbArt, title: string }>(), { art: 'calendar' })
</script>

<template>
  <div class="wb-empty">
    <svg width="160" height="140" viewBox="0 0 160 140" aria-hidden="true" class="wb-art">
      <template v-if="art === 'calendar'"><rect x="24" y="30" width="112" height="86" rx="14" class="a1" /><rect x="24" y="30" width="112" height="22" rx="11" class="a2" /><rect x="40" y="66" width="56" height="12" rx="6" class="a3" /><rect x="72" y="90" width="48" height="12" rx="6" class="a4" /></template>
      <template v-else-if="art === 'sun'"><circle cx="80" cy="66" r="30" class="a4" /><rect x="22" y="98" width="116" height="12" rx="6" class="a2" /><rect x="44" y="116" width="72" height="8" rx="4" class="a1" /></template>
      <template v-else-if="art === 'inbox'"><rect x="28" y="40" width="104" height="76" rx="14" class="a1" /><path d="M28 84h30l8 14h28l8-14h30" class="ln" /><circle cx="118" cy="40" r="14" class="a4" /></template>
      <template v-else-if="art === 'search'"><circle cx="72" cy="66" r="34" class="a1" /><circle cx="72" cy="66" r="20" class="a3b" /><rect x="96" y="92" width="44" height="12" rx="6" transform="rotate(42 96 92)" class="a2" /></template>
      <template v-else-if="art === 'invoice'"><rect x="46" y="22" width="68" height="100" rx="10" class="a1" /><rect x="58" y="42" width="44" height="8" rx="4" class="a2" /><rect x="58" y="60" width="30" height="8" rx="4" class="a3" /><circle cx="100" cy="100" r="11" class="a4" /></template>
      <template v-else><rect x="20" y="52" width="60" height="40" rx="20" class="a2" /><rect x="80" y="52" width="60" height="40" rx="20" class="a1" /><circle cx="80" cy="72" r="11" class="a4" /></template>
    </svg>
    <h2 class="h2">{{ title }}</h2>
    <p v-if="$slots.default" class="wb-mut"><slot /></p>
    <slot name="action" />
  </div>
</template>
