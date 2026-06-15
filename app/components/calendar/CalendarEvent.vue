<script setup lang="ts">
import type { CalendarEvent } from '~/types/index'

const props = defineProps<{
  event: CalendarEvent
  isStart: boolean
  isEnd: boolean
}>()
</script>

<template>
  <div
    :class="[
      'text-xs py-0.5 min-h-[1.25rem] truncate',
      // Bleed horizontally into the parent cell's p-1 padding to close the gap
      // between adjacent day cells, creating a continuous block appearance.
      props.isStart ? 'pl-1'   : '-ml-1 pl-0',
      props.isEnd   ? 'pr-1'   : '-mr-1 pr-0',
      // Round only at the true start and end of the event
      props.isStart ? 'rounded-l-sm' : '',
      props.isEnd   ? 'rounded-r-sm' : '',
      props.event.isOwn ? 'font-medium' : 'font-normal',
      props.event.status === 'pending'  ? 'opacity-60' : '',
      props.event.status === 'rejected' ? 'opacity-40 line-through' : '',
    ]"
    :style="{
      backgroundColor: props.event.leaveTypeColor + '33',
      borderLeft: props.isStart ? `3px solid ${props.event.leaveTypeColor}` : undefined,
      color: '#1f2937',
    }"
    :title="`${props.event.employeeName}${props.event.teamName ? ' (' + props.event.teamName + ')' : ''} — ${props.event.leaveTypeName}`"
    :aria-label="`${props.event.employeeName} — ${props.event.leaveTypeName}`"
  >
    <template v-if="props.isStart">{{ props.event.employeeName.split(' ')[0] }}</template>
  </div>
</template>
