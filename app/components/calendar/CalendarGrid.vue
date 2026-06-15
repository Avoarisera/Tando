<script setup lang="ts">
import type { CalendarEvent } from '~/types/index'

const props = defineProps<{
  events: readonly CalendarEvent[]
  currentMonth: Date
}>()

const emit = defineEmits<{
  'prev-month': []
  'next-month': []
}>()

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const _now = new Date()
const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`

const monthLabel = computed(() =>
  props.currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
)

const weeks = computed(() => {
  const year = props.currentMonth.getFullYear()
  const month = props.currentMonth.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // ISO week: Monday = 0, Sunday = 6
  const startDow = (firstDay.getDay() + 6) % 7
  const days: (Date | null)[] = []

  for (let i = 0; i < startDow; i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d))
  }
  // Pad to full last week
  while (days.length % 7 !== 0) days.push(null)

  const result: (Date | null)[][] = []
  for (let i = 0; i < days.length; i += 7) {
    result.push(days.slice(i, i + 7))
  }
  return result
})

function toIso(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

function eventsForDay(day: Date): CalendarEvent[] {
  const iso = toIso(day)
  return props.events.filter(e => e.startDate <= iso && e.endDate >= iso)
}

function isEventStart(event: CalendarEvent, day: Date): boolean {
  return event.startDate === toIso(day)
}

function isEventEnd(event: CalendarEvent, day: Date): boolean {
  return event.endDate === toIso(day)
}

// Events in the current month for mobile list view
const eventsThisMonth = computed(() => {
  const year = props.currentMonth.getFullYear()
  const month = String(props.currentMonth.getMonth() + 1).padStart(2, '0')
  const firstOfMonth = `${year}-${month}-01`
  const lastOfMonth = `${year}-${month}-${new Date(year, props.currentMonth.getMonth() + 1, 0).getDate().toString().padStart(2, '0')}`

  return props.events.filter(e => e.startDate <= lastOfMonth && e.endDate >= firstOfMonth)
})

const uniqueLeaveTypes = computed(() => {
  const seen = new Map<string, { name: string; color: string }>()
  props.events.forEach(e => {
    if (!seen.has(e.leaveTypeName)) {
      seen.set(e.leaveTypeName, { name: e.leaveTypeName, color: e.leaveTypeColor })
    }
  })
  return [...seen.values()]
})
</script>

<template>
  <div>
    <!-- Navigation -->
    <div class="flex items-center justify-between mb-4">
      <button
        type="button"
        class="p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Mois précédent"
        @click="emit('prev-month')"
      >
        &#8249;
      </button>
      <h2 class="text-base font-semibold text-gray-900 capitalize">{{ monthLabel }}</h2>
      <button
        type="button"
        class="p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Mois suivant"
        @click="emit('next-month')"
      >
        &#8250;
      </button>
    </div>

    <!-- Mobile: list view -->
    <div class="md:hidden space-y-2">
      <p v-if="eventsThisMonth.length === 0" class="text-sm text-gray-500 text-center py-6">
        Aucun congé ce mois-ci.
      </p>
      <div
        v-for="event in eventsThisMonth"
        :key="event.id"
        class="flex items-start gap-2 p-3 rounded-lg border border-gray-100 bg-white"
        :style="{ borderLeftColor: event.leaveTypeColor, borderLeftWidth: '4px' }"
      >
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-900 truncate">{{ event.employeeName }}</p>
          <p class="text-xs text-gray-500 mt-0.5">{{ event.leaveTypeName }}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-xs text-gray-600">{{ formatDate(event.startDate) }}</p>
          <p class="text-xs text-gray-400">→ {{ formatDate(event.endDate) }}</p>
        </div>
      </div>
    </div>

    <!-- Desktop: grid view -->
    <div class="hidden md:block overflow-x-auto">
      <!-- Day headers -->
      <div class="grid grid-cols-7 gap-px bg-gray-200 rounded-t-lg overflow-hidden">
        <div
          v-for="label in DAY_LABELS"
          :key="label"
          class="bg-gray-50 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide"
        >
          {{ label }}
        </div>
      </div>

      <!-- Weeks -->
      <div class="border border-gray-200 border-t-0 rounded-b-lg overflow-hidden">
        <div
          v-for="(week, wi) in weeks"
          :key="wi"
          class="grid grid-cols-7 divide-x divide-gray-100"
          :class="wi > 0 ? 'border-t border-gray-100' : ''"
        >
          <div
            v-for="(day, di) in week"
            :key="di"
            class="min-h-[6rem] p-1 bg-white"
            :class="day === null ? 'bg-gray-50' : ''"
          >
            <template v-if="day !== null">
              <!-- Day number -->
              <div class="flex justify-end mb-1">
                <span
                  class="text-xs w-6 h-6 flex items-center justify-center rounded-full"
                  :class="toIso(day) === today
                    ? 'bg-brand-primary text-white font-semibold'
                    : 'text-gray-500'"
                >
                  {{ day.getDate() }}
                </span>
              </div>
              <!-- Events -->
              <div class="space-y-0.5">
                <CalendarEvent
                  v-for="event in eventsForDay(day)"
                  :key="event.id"
                  :event="event"
                  :is-start="isEventStart(event, day)"
                  :is-end="isEventEnd(event, day)"
                />
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div v-if="uniqueLeaveTypes.length > 0" class="flex flex-wrap gap-4 mt-4">
      <div
        v-for="type in uniqueLeaveTypes"
        :key="type.name"
        class="flex items-center gap-1.5 text-sm"
      >
        <span
          class="w-3 h-3 rounded-sm shrink-0"
          :style="{ backgroundColor: type.color }"
          aria-hidden="true"
        />
        <span class="text-gray-700">{{ type.name }}</span>
      </div>
    </div>
  </div>
</template>
