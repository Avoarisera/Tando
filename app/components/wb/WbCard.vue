<script setup lang="ts">
withDefaults(defineProps<{ title?: string, subtitle?: string, linkLabel?: string, linkTo?: string, pad?: boolean }>(), { pad: true })
</script>

<template>
  <section class="wb-card">
    <header v-if="title || linkLabel || $slots.action" class="wb-card-h">
      <div>
        <h2 class="h2">{{ title }}</h2>
        <p v-if="subtitle" class="small wb-mut">{{ subtitle }}</p>
      </div>
      <slot name="action" />
      <NuxtLink v-if="linkLabel && linkTo" class="small wb-card-l" :to="linkTo">{{ linkLabel }}</NuxtLink>
    </header>
    <div :class="pad ? 'wb-card-b' : undefined"><slot /></div>
  </section>
</template>
