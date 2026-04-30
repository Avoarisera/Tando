<script setup lang="ts">
import type { ProblematicTicket, BlockedTicket } from '~/composables/useTeamInsights'

const props = defineProps<{
  problematic: ProblematicTicket[]
  blocked: BlockedTicket[]
  workspaceId: string
}>()

function ticketLink(id: string): string {
  return `/velocite/issues/${id}?workspaceId=${props.workspaceId}`
}

function stuckClass(days: number): string {
  if (days >= 14) return 'bg-rose-50 text-rose-600'
  if (days >= 7) return 'bg-amber-50 text-amber-700'
  return 'bg-gray-50 text-gray-600'
}

function overrunClass(stuck: number, expected: number): string {
  const ratio = stuck / Math.max(expected, 1)
  if (ratio >= 3) return 'bg-rose-50 text-rose-600'
  if (ratio >= 2) return 'bg-amber-50 text-amber-700'
  return 'bg-gray-50 text-gray-600'
}
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
    <!-- Tickets bloqués -->
    <div class="bg-white rounded-xl border border-gray-100 p-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-gray-700">Tickets bloqués</h3>
        <span class="text-xs text-gray-400">en Review/QA depuis &gt; 5j</span>
      </div>
      <p v-if="blocked.length === 0" class="text-sm text-gray-400 py-6 text-center">
        Aucun ticket bloqué — bravo l'équipe.
      </p>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="t in blocked.slice(0, 8)" :key="t.id" class="py-2.5 flex items-start gap-3">
          <span
            class="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums"
            :class="stuckClass(t.stuck_days)"
          >
            {{ t.stuck_days }}j
          </span>
          <div class="flex-1 min-w-0">
            <NuxtLink :to="ticketLink(t.id)" class="text-sm text-gray-800 hover:text-brand-primary hover:underline block truncate">
              <span class="text-gray-400 mr-1">{{ t.identifier ?? '?' }}</span>
              {{ t.title ?? 'Sans titre' }}
            </NuxtLink>
            <p class="text-xs text-gray-500 mt-0.5 truncate">
              {{ t.assignee_name ?? 'Non assigné' }} · {{ t.status }}
            </p>
          </div>
        </li>
      </ul>
      <p v-if="blocked.length > 8" class="text-xs text-gray-400 mt-2">
        + {{ blocked.length - 8 }} autres tickets bloqués
      </p>
    </div>

    <!-- Tickets à analyser : In Progress dépassant l'estimation -->
    <div class="bg-white rounded-xl border border-gray-100 p-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-gray-700">Tickets à analyser</h3>
        <span class="text-xs text-gray-400">durée &gt; estimation (1pt = 0.5j)</span>
      </div>
      <p v-if="problematic.length === 0" class="text-sm text-gray-400 py-6 text-center">
        Aucun ticket en cours dépassant son estimation.
      </p>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="t in problematic.slice(0, 8)" :key="t.id" class="py-2.5 flex items-start gap-3">
          <span
            class="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums"
            :class="overrunClass(t.stuck_days, t.expected_days)"
            :title="`${t.stuck_days}j actuels vs ${t.expected_days}j estimés (${t.estimate ?? '?'}pt)`"
          >
            {{ t.stuck_days }}j / {{ t.expected_days }}j
          </span>
          <div class="flex-1 min-w-0">
            <NuxtLink :to="ticketLink(t.id)" class="text-sm text-gray-800 hover:text-brand-primary hover:underline block truncate">
              <span class="text-gray-400 mr-1">{{ t.identifier ?? '?' }}</span>
              {{ t.title ?? 'Sans titre' }}
            </NuxtLink>
            <p class="text-xs text-gray-500 mt-0.5 truncate">
              {{ t.assignee_name ?? 'Non assigné' }} · {{ t.status }}
              <span v-if="t.estimate != null" class="text-gray-400">· {{ t.estimate }}pt</span>
              <span v-else class="text-gray-400">· sans estimation</span>
            </p>
          </div>
        </li>
      </ul>
      <p v-if="problematic.length > 8" class="text-xs text-gray-400 mt-2">
        + {{ problematic.length - 8 }} autres tickets en cours longs
      </p>
    </div>
  </div>
</template>
