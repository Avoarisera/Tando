<script setup lang="ts">
const props = withDefaults(defineProps<{ name: string, size?: number, src?: string | null }>(), { size: 36 })

const COLORS = ['blue', 'teal', 'violet', 'orange', 'pink', 'green', 'indigo', 'cyan']

const initials = computed(() => (props.name || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase())
// Stable colour per name, as in the design system
const color = computed(() => COLORS[[...(props.name || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length])
const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size * 0.38)}px`,
  '--lt': `var(--leave-${color.value}-tint)`,
  '--lx': `var(--leave-${color.value}-text)`,
}))
</script>

<template>
  <span class="wb-av" :title="name" :style="style">
    <img v-if="src" :src="src" alt="">
    <span v-else aria-hidden="true">{{ initials }}</span>
    <span class="wb-sr">{{ name }}</span>
  </span>
</template>
