<script setup lang="ts">
export interface TicketRow {
  id: string
  identifier: string | null
  title: string | null
  estimate: number | null
  status: string | null
  started_at: string | null
  qa_started_at: string | null
  completed_at: string | null
  updated_at: string
  hasRework?: boolean
  cycle_dev_hours?: number | null
}

const props = defineProps<{
  tickets: TicketRow[]
  isLoading: boolean
}>()

const emit = defineEmits<{ 'ticket-click': [id: string] }>()

const PAGE_SIZE = 10
const page = ref(1)

// Reset to page 1 whenever tickets change
watch(() => props.tickets, () => { page.value = 1 })

const totalPages = computed(() => Math.max(1, Math.ceil(props.tickets.length / PAGE_SIZE)))
const paginated = computed(() =>
  props.tickets.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)

function cycleHours(t: TicketRow): string {
  if (t.cycle_dev_hours == null) return '—'
  return `${t.cycle_dev_hours.toFixed(0)}h`
}

function linearUrl(identifier: string | null): string {
  if (!identifier) return '#'
  return `https://linear.app/issue/${identifier}`
}
</script>

<template>
  <div>
    <template v-if="isLoading">
      <AppSkeleton v-for="i in 5" :key="i" class="mb-2 h-10" />
    </template>

    <AppEmptyState
      v-else-if="tickets.length === 0"
      title="Aucun ticket livré sur cette période"
    />

    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 text-left text-xs text-gray-500">
            <th class="pb-2 pr-4 font-medium">Ticket</th>
            <th class="pb-2 pr-4 font-medium">Titre</th>
            <th class="pb-2 pr-4 font-medium text-right">Pts</th>
            <th class="pb-2 pr-4 font-medium">Statut</th>
            <th class="pb-2 pr-4 font-medium text-right">Cycle dev</th>
            <th class="pb-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="t in paginated"
            :key="t.id"
            class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
            @click="emit('ticket-click', t.id)"
          >
            <td class="py-2 pr-4">
              <a
                :href="linearUrl(t.identifier)"
                target="_blank"
                rel="noopener noreferrer"
                class="font-mono text-xs text-brand-primary hover:underline"
                @click.stop
              >
                {{ t.identifier ?? '—' }}
              </a>
            </td>
            <td class="py-2 pr-4 max-w-[280px]">
              <span class="truncate block text-gray-800">{{ t.title ?? '—' }}</span>
            </td>
            <td class="py-2 pr-4 text-right text-gray-600 font-medium">
              {{ t.estimate ?? '—' }}
            </td>
            <td class="py-2 pr-4">
              <span class="inline-block rounded-full px-2 py-0.5 text-xs bg-green-100 text-green-700">
                {{ t.status }}
              </span>
            </td>
            <td class="py-2 pr-4 text-right text-gray-600 font-mono text-xs">
              {{ cycleHours(t) }}
            </td>
            <td class="py-2 text-right">
              <span
                v-if="t.hasRework"
                class="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-red-600"
                title="Ce ticket a eu au moins un retour arrière depuis Review ou Q/A"
              >
                ↩ rework
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>{{ tickets.length }} tickets · page {{ page }} / {{ totalPages }}</span>
        <div class="flex items-center gap-1">
          <button
            class="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            :disabled="page === 1"
            @click="page--"
          >
            ← Précédent
          </button>
          <button
            class="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            :disabled="page === totalPages"
            @click="page++"
          >
            Suivant →
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
