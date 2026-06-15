# RFC-010 — Calendar

**ID:** RFC-010  
**Title:** Calendar — Employee, Manager, and Admin Views  
**Sprint:** 3  
**Complexity:** Medium  
**Predecessor:** RFC-009  
**Successor:** RFC-011

---

## Summary

This RFC implements the `/calendar` page for all three roles. The core is a reusable monthly grid component (`CalendarGrid`) that displays leave events. Each role sees a differently scoped dataset. The manager view adds an "Absents aujourd'hui" panel. The admin view adds a team filter. It covers features **F18**, **F19**, and **F20**.

---

## Features Addressed

| Feature | Description | Complexity |
|---------|-------------|------------|
| F18 | Calendrier vue employé | Medium |
| F19 | Calendrier vue manager + "Absents aujourd'hui" | Medium |
| F20 | Calendrier vue admin (global, filtre par équipe) | Medium |

---

## Dependencies

- **Predecessors:** RFC-009 (approved requests exist in DB, all composables ready)
- **Successors:** RFC-011 (no dependency)

---

## Technical Approach

### Files created in this RFC

```
app/
├── pages/
│   └── calendar.vue                  ← Replaces stub from RFC-004
├── components/
│   └── calendar/
│       ├── CalendarGrid.vue          ← Monthly grid with event rendering
│       └── CalendarEvent.vue         ← Single event badge in the grid
└── composables/
    └── useCalendar.ts                ← Data fetching for calendar events
```

---

### useCalendar composable

```ts
// app/composables/useCalendar.ts
interface CalendarEvent {
  id: string
  userId: string
  employeeName: string
  leaveTypeName: string
  leaveTypeColor: string
  startDate: string    // ISO date
  endDate: string
  status: LeaveStatus
  isOwn: boolean       // true if this is the current user's event
  teamName?: string    // admin view only
}

export function useCalendar() {
  const supabase = useSupabaseClient()
  const events = useState<CalendarEvent[]>('calendar-events', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchEvents() {
    isLoading.value = true
    error.value = null
    try {
      const user = useSupabaseUser()
      const { data, error: sbError } = await supabase
        .from('leave_requests')
        .select(`
          id, user_id, start_date, end_date, status,
          leave_types (name, color),
          profiles!user_id (id, first_name, last_name,
            teams (name)
          )
        `)
        // RLS handles role-based scoping automatically
        .order('start_date', { ascending: true })
      if (sbError) throw sbError

      events.value = (data ?? []).map((r) => ({
        id: r.id,
        userId: r.user_id,
        employeeName: `${r.profiles.first_name} ${r.profiles.last_name}`,
        leaveTypeName: r.leave_types.name,
        leaveTypeColor: r.leave_types.color,
        startDate: r.start_date,
        endDate: r.end_date,
        status: r.status as LeaveStatus,
        isOwn: r.user_id === user.value?.id,
        teamName: r.profiles.teams?.name,
      }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement du calendrier'
    } finally {
      isLoading.value = false
    }
  }

  return {
    events: readonly(events),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchEvents,
  }
}
```

**RLS-based data scoping:**
- Employee: sees own events (all statuses) + team's `approved` events
- Manager: sees own events (all statuses) + team's `approved` events
- Admin: sees all `approved` events from all teams

The `WHERE` clause for employee/manager filtering (own all-status + others approved-only) must be implemented in the query. Since RLS returns the union, apply a client-side filter:

```ts
// After fetch, filter by role:
// Employee/Manager: show own (all statuses) + others' approved only
const user = useSupabaseUser()
events.value = rawData.filter(e =>
  e.user_id === user.value?.id   // own: all statuses
  || e.status === 'approved'      // others: approved only
)
```

---

### CalendarGrid.vue

The main calendar rendering component.

**Props:**
```ts
defineProps<{
  events: CalendarEvent[]
  currentMonth: Date
}>()
defineEmits<{
  'prev-month': []
  'next-month': []
}>()
```

**Calendar generation algorithm:**

```ts
const weeks = computed(() => {
  const year = props.currentMonth.getFullYear()
  const month = props.currentMonth.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Start from Monday (ISO week)
  const startDow = (firstDay.getDay() + 6) % 7  // 0=Mon, 6=Sun
  const days: (Date | null)[] = []

  // Padding before first day
  for (let i = 0; i < startDow; i++) days.push(null)
  // Actual days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d))
  }
  // Group into weeks of 7
  const result: (Date | null)[][] = []
  for (let i = 0; i < days.length; i += 7) {
    result.push(days.slice(i, i + 7))
  }
  return result
})
```

**Event rendering per day:**

For each day cell, find events that span that day:

```ts
function eventsForDay(day: Date): CalendarEvent[] {
  const iso = day.toISOString().split('T')[0]
  return props.events.filter(e =>
    e.startDate <= iso && e.endDate >= iso
  )
}
```

**Multi-day events:** render as a colored band spanning the full cell width. Show employee name on the first day of the span only (hide on continuation days):

```ts
function isEventStart(event: CalendarEvent, day: Date): boolean {
  return event.startDate === day.toISOString().split('T')[0]
}
```

**Grid layout:** 7-column CSS grid, `grid-cols-7`. Day headers: Lun, Mar, Mer, Jeu, Ven, Sam, Dim. Today highlighted with a distinct background.

---

### CalendarEvent.vue

```vue
<script setup lang="ts">
defineProps<{
  event: CalendarEvent
  isStart: boolean
}>()
</script>

<template>
  <div
    :class="[
      'text-xs px-1 py-0.5 rounded truncate',
      event.isOwn ? 'font-medium' : 'opacity-80',
    ]"
    :style="{
      backgroundColor: event.leaveTypeColor + '33',  // 20% opacity
      borderLeft: `3px solid ${event.leaveTypeColor}`,
      color: '#1f2937',
    }"
    :title="`${event.employeeName} — ${event.leaveTypeName}`"
  >
    <template v-if="isStart">{{ event.employeeName.split(' ')[0] }}</template>
  </div>
</template>
```

---

### calendar.vue page

```vue
<script setup lang="ts">
definePageMeta({ layout: 'private' })

const { isEmployee, isManager, isAdmin, loadProfile } = useCurrentUser()
const { events, isLoading, error, fetchEvents } = useCalendar()

const currentMonth = ref(new Date())

onMounted(async () => {
  await loadProfile()
  await fetchEvents()
})

function prevMonth() {
  currentMonth.value = new Date(
    currentMonth.value.getFullYear(),
    currentMonth.value.getMonth() - 1,
    1
  )
}

function nextMonth() {
  currentMonth.value = new Date(
    currentMonth.value.getFullYear(),
    currentMonth.value.getMonth() + 1,
    1
  )
}

const monthLabel = computed(() =>
  currentMonth.value.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
)
</script>
```

---

### F19 — Manager: "Absents aujourd'hui" panel

Computed from already-loaded events — no additional query:

```ts
const today = new Date().toISOString().split('T')[0]

const absentToday = computed(() =>
  events.value.filter(e =>
    e.status === 'approved'
    && e.startDate <= today
    && e.endDate >= today
  )
)
```

Displayed above the calendar as a card:
```vue
<div class="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
  <h3 class="font-medium text-amber-900 mb-2">Absents aujourd'hui</h3>
  <p v-if="absentToday.length === 0" class="text-sm text-amber-700">
    Aucune absence aujourd'hui.
  </p>
  <ul v-else class="text-sm text-amber-800 space-y-1">
    <li v-for="e in absentToday" :key="e.id">
      {{ e.employeeName }} — {{ e.leaveTypeName }}
    </li>
  </ul>
</div>
```

---

### F20 — Admin: team filter

```ts
const { data: teams } = await supabase.from('teams').select('id, name')

const selectedTeamId = ref<string | 'all'>('all')

const filteredEvents = computed(() => {
  if (selectedTeamId.value === 'all') return events.value
  return events.value.filter(e => /* need teamId on CalendarEvent */)
})
```

Extend `CalendarEvent` with `teamId?: string` to enable this filter. Update `useCalendar` to map `r.profiles.teams?.id` to `teamId`.

---

### Legend

Always shown below the calendar — a list of active leave types with their color:

```vue
<div class="flex flex-wrap gap-4 mt-4">
  <div v-for="type in uniqueLeaveTypes" :key="type.id" class="flex items-center gap-1.5 text-sm">
    <span class="w-3 h-3 rounded-sm" :style="{ backgroundColor: type.color }" />
    <span class="text-gray-700">{{ type.name }}</span>
  </div>
</div>
```

Where `uniqueLeaveTypes` is derived from the loaded events:

```ts
const uniqueLeaveTypes = computed(() => {
  const seen = new Map<string, { id: string; name: string; color: string }>()
  events.value.forEach(e => {
    if (!seen.has(e.leaveTypeName)) {
      seen.set(e.leaveTypeName, {
        id: e.id,
        name: e.leaveTypeName,
        color: e.leaveTypeColor,
      })
    }
  })
  return [...seen.values()]
})
```

---

## Acceptance Criteria

### F18 — Employee Calendar

- [ ] Monthly grid rendered with correct days for current month
- [ ] Employee's own requests shown with all statuses (pending has reduced opacity or dashed border)
- [ ] Team members' `approved` requests shown (other statuses hidden)
- [ ] Navigation: prev/next month buttons work; current month label updates
- [ ] Skeleton shown during initial load
- [ ] Error banner on fetch failure
- [ ] Legend of leave type colors shown below grid

### F19 — Manager Calendar

- [ ] Same monthly grid, filtered to manager's team data (RLS enforces)
- [ ] "Absents aujourd'hui" panel shows names + leave type of members with approved leave today
- [ ] "Aucune absence aujourd'hui" shown when no one is absent
- [ ] Manager's own requests appear in all statuses

### F20 — Admin Calendar

- [ ] All `approved` requests from all teams shown
- [ ] Team filter select available (Toutes les équipes + each team)
- [ ] Filter applied client-side, no re-fetch
- [ ] Events show employee name + team in title attribute

---

## Responsive Design

- **Mobile:** single-column day list (no grid) or compressed 7-col grid with abbreviated event names
- **Desktop:** full 7-column grid with event text visible

Use `hidden md:grid` on the table grid and a `md:hidden` list view for mobile:

```vue
<!-- Mobile: list view -->
<div class="md:hidden space-y-2">
  <div v-for="event in eventsThisMonth" :key="event.id" ...>
    {{ event.employeeName }} — {{ formatDate(event.startDate) }} → {{ formatDate(event.endDate) }}
  </div>
</div>
<!-- Desktop: grid view -->
<div class="hidden md:grid grid-cols-7 ...">
  ...
</div>
```

---

## Testing Strategy

1. Login as employee1 → `/calendar` shows Emma's seeded approved request (Apr 14–18) in a green band
2. Emma's pending request (May 12–16) shows with reduced opacity
3. Prev/Next month navigation works
4. Login as manager → same grid + "Absents aujourd'hui" panel
5. Change month to April → Emma's approved absence shows in the panel if today is in that range
6. Login as admin → all events visible; team filter "Équipe A" shows only that team
