<script setup lang="ts">
import type { WbBadgeTone } from './WbBadge.vue'

export interface WbTimelineItem { title: string, time: string, tone?: WbBadgeTone, body?: string }
defineProps<{ items: WbTimelineItem[] }>()
</script>

<template>
  <ol class="wb-tl">
    <li v-for="(it, i) in items" :key="i">
      <span :class="['wb-tl-m', `wb-t-${it.tone ?? 'neutral'}`]" />
      <div>
        <div class="wb-row wb-wrap"><b class="small">{{ it.title }}</b></div>
        <span class="caption wb-mut wb-num">{{ it.time }}</span>
        <p v-if="it.body" class="small">{{ it.body }}</p>
      </div>
    </li>
  </ol>
</template>
