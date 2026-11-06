<script setup lang="ts">
// Plain text typed by HR, shown as paragraphs and bullet lists (never v-html)
const props = defineProps<{ text: string }>()
const blocks = computed(() => textBlocks(props.text))
</script>

<template>
  <div class="wb-rt">
    <template v-for="(b, i) in blocks" :key="i">
      <ul v-if="b.kind === 'ul'"><li v-for="(it, j) in b.items" :key="j">{{ it }}</li></ul>
      <p v-else>{{ b.text }}</p>
    </template>
  </div>
</template>

<style scoped>
.wb-rt { display: flex; flex-direction: column; gap: var(--space-2); line-height: 1.6; }
.wb-rt p, .wb-rt ul { margin: 0; }
.wb-rt ul { padding-left: 1.2em; list-style: disc; display: flex; flex-direction: column; gap: 4px; }
.wb-rt li { display: list-item; }
</style>
