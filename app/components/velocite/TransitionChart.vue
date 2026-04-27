<script setup lang="ts">
interface TicketRef { id: string; identifier: string | null; title: string | null }

const props = defineProps<{
  transitions: { from_status: string; to_status: string; count: number; tickets: TicketRef[] }[]
  workspaceId: string
}>()

const emit = defineEmits<{ 'ticket-click': [ticketId: string] }>()

const expanded = ref<string | null>(null)

const maxCount = computed(() => Math.max(...props.transitions.map(t => t.count), 1))

function barWidth(count: number): string {
  return `${Math.round((count / maxCount.value) * 100)}%`
}

function key(t: { from_status: string; to_status: string }): string {
  return `${t.from_status}|||${t.to_status}`
}

function toggle(t: { from_status: string; to_status: string }) {
  const k = key(t)
  expanded.value = expanded.value === k ? null : k
}
</script>

<template>
  <div class="space-y-1">
    <div v-for="(t, i) in transitions" :key="i">
      <div
        class="flex items-center gap-3 cursor-pointer rounded-md px-2 py-1 hover:bg-red-50 transition-colors"
        @click="toggle(t)"
      >
        <div class="w-52 shrink-0 text-right">
          <span class="text-xs text-gray-700 truncate block font-medium">
            {{ t.from_status }}
          </span>
          <span class="text-xs text-red-400">↩ retour vers {{ t.to_status }}</span>
        </div>
        <div class="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
          <div
            class="h-full rounded-full bg-red-400 transition-all"
            :style="{ width: barWidth(t.count) }"
          />
        </div>
        <span class="w-10 text-right text-xs font-semibold text-red-600 shrink-0">
          {{ t.count }}x
        </span>
        <span class="text-gray-300 text-xs w-4 shrink-0">{{ expanded === key(t) ? '▲' : '▼' }}</span>
      </div>

      <div
        v-if="expanded === key(t)"
        class="ml-4 mb-2 pl-4 border-l-2 border-red-100 space-y-1"
      >
        <div
          v-for="ticket in t.tickets"
          :key="ticket.id"
          class="flex items-center gap-2 py-1 cursor-pointer group"
          @click.stop="emit('ticket-click', ticket.id)"
        >
          <span class="font-mono text-xs text-brand-primary group-hover:underline shrink-0">
            {{ ticket.identifier ?? ticket.id.slice(0, 8) }}
          </span>
          <span class="text-xs text-gray-600 truncate">{{ ticket.title ?? '—' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
