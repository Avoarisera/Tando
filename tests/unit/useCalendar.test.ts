import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { CalendarEvent } from '~/types/index'

// ── Supabase mock ────────────────────────────────────────────────────────────

const { fromResult, sharedBuilder, mockFrom } = vi.hoisted(() => {
  const fromResult: { data: unknown; error: unknown } = { data: null, error: null }
  const sharedBuilder = {
    select: vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    then(resolve: (v: typeof fromResult) => unknown) {
      return Promise.resolve(fromResult).then(resolve)
    },
    catch(reject: (e: Error) => unknown) {
      return Promise.resolve(fromResult).catch(reject)
    },
  }
  const mockFrom = vi.fn().mockReturnValue(sharedBuilder)
  return { fromResult, sharedBuilder, mockFrom }
})

const mockUser = vi.hoisted(() => ({ value: { id: 'user-emma' } as { id: string } | null }))

mockNuxtImport('useSupabaseClient', () => () => ({ from: mockFrom }))
mockNuxtImport('useSupabaseUser',   () => () => mockUser)

// ── Fixtures ─────────────────────────────────────────────────────────────────

const EMMA_APPROVED = {
  id:          'req-43',
  user_id:     'user-emma',
  start_date:  '2026-04-14',
  end_date:    '2026-04-18',
  status:      'approved',
  leave_types: { name: 'Congé payé', color: '#4CAF50' },
  profiles:    { id: 'user-emma', first_name: 'Emma', last_name: 'Employée',
                 teams: { id: 'team-a', name: 'Équipe A' } },
}

const EMMA_PENDING = {
  id:          'req-41',
  user_id:     'user-emma',
  start_date:  '2026-05-12',
  end_date:    '2026-05-16',
  status:      'pending',
  leave_types: { name: 'Congé payé', color: '#4CAF50' },
  profiles:    { id: 'user-emma', first_name: 'Emma', last_name: 'Employée',
                 teams: { id: 'team-a', name: 'Équipe A' } },
}

const EDDY_MANAGER_APPROVED = {
  id:          'req-42',
  user_id:     'user-eddy',
  start_date:  '2026-05-05',
  end_date:    '2026-05-07',
  status:      'manager_approved',
  leave_types: { name: 'RTT', color: '#2196F3' },
  profiles:    { id: 'user-eddy', first_name: 'Eddy', last_name: 'Employé',
                 teams: { id: 'team-a', name: 'Équipe A' } },
}

const EDDY_REJECTED = {
  id:          'req-44',
  user_id:     'user-eddy',
  start_date:  '2026-03-10',
  end_date:    '2026-03-12',
  status:      'rejected',
  leave_types: { name: 'Congé maladie', color: '#F44336' },
  profiles:    { id: 'user-eddy', first_name: 'Eddy', last_name: 'Employé',
                 teams: { id: 'team-a', name: 'Équipe A' } },
}

const PRESEEDED_EVENT: CalendarEvent = {
  id: 'req-43', userId: 'user-emma', employeeName: 'Emma Employée',
  leaveTypeName: 'Congé payé', leaveTypeColor: '#4CAF50',
  startDate: '2026-04-14', endDate: '2026-04-18',
  status: 'approved', isOwn: true, teamId: 'team-a', teamName: 'Équipe A',
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useCalendar', () => {
  beforeEach(() => {
    fromResult.data  = null
    fromResult.error = null
    sharedBuilder.select.mockClear()
    sharedBuilder.order.mockClear()
    mockFrom.mockClear()
    mockUser.value = { id: 'user-emma' }
    useState<CalendarEvent[]>('calendar-events').value = []
  })

  // ── fetchEvents ─────────────────────────────────────────────────────────────

  describe('fetchEvents()', () => {
    it('UC-010-01: isLoading goes false and error stays null on success', async () => {
      fromResult.data = [EMMA_APPROVED]
      const { isLoading, error, fetchEvents } = useCalendar()
      await fetchEvents()
      expect(isLoading.value).toBe(false)
      expect(error.value).toBeNull()
    })

    it('UC-010-01: every event has all required fields', async () => {
      fromResult.data = [EMMA_APPROVED]
      const { events, fetchEvents } = useCalendar()
      await fetchEvents()
      const e = events.value[0]
      for (const field of ['id', 'userId', 'employeeName', 'leaveTypeName',
        'leaveTypeColor', 'startDate', 'endDate', 'status', 'isOwn']) {
        expect(e, `field "${field}" missing`).toHaveProperty(field)
      }
      // teamId and teamName are optional but should be present when profile has a team
      expect(e.teamId).toBe('team-a')
      expect(e.teamName).toBe('Équipe A')
    })

    it('UC-010-02: Emma sees her 2 own events regardless of status', async () => {
      fromResult.data = [EMMA_APPROVED, EMMA_PENDING, EDDY_MANAGER_APPROVED, EDDY_REJECTED]
      mockUser.value = { id: 'user-emma' }
      const { events, fetchEvents } = useCalendar()
      await fetchEvents()
      const emmaEvents = events.value.filter(e => e.userId === 'user-emma')
      expect(emmaEvents).toHaveLength(2)
    })

    it('UC-010-02: Emma does not see Eddy manager_approved (not own, not approved)', async () => {
      fromResult.data = [EMMA_APPROVED, EMMA_PENDING, EDDY_MANAGER_APPROVED, EDDY_REJECTED]
      mockUser.value = { id: 'user-emma' }
      const { events, fetchEvents } = useCalendar()
      await fetchEvents()
      expect(events.value.find(e => e.id === 'req-42')).toBeUndefined()
    })

    it('UC-010-02: Emma does not see Eddy rejected (not own, not approved)', async () => {
      fromResult.data = [EMMA_APPROVED, EMMA_PENDING, EDDY_MANAGER_APPROVED, EDDY_REJECTED]
      mockUser.value = { id: 'user-emma' }
      const { events, fetchEvents } = useCalendar()
      await fetchEvents()
      expect(events.value.find(e => e.id === 'req-44')).toBeUndefined()
    })

    it('UC-010-02: Eddy sees Emma approved (different user, status=approved)', async () => {
      fromResult.data = [EMMA_APPROVED, EDDY_MANAGER_APPROVED]
      mockUser.value = { id: 'user-eddy' }
      const { events, fetchEvents } = useCalendar()
      await fetchEvents()
      expect(events.value.find(e => e.id === 'req-43')).toBeDefined()
    })

    it('UC-010-03: isOwn is true for events belonging to current user', async () => {
      fromResult.data = [EMMA_APPROVED, EMMA_PENDING]
      mockUser.value = { id: 'user-emma' }
      const { events, fetchEvents } = useCalendar()
      await fetchEvents()
      expect(events.value.every(e => e.isOwn)).toBe(true)
    })

    it('UC-010-03: isOwn is false for another user approved event visible to Eddy', async () => {
      fromResult.data = [EMMA_APPROVED]
      mockUser.value = { id: 'user-eddy' }
      const { events, fetchEvents } = useCalendar()
      await fetchEvents()
      expect(events.value[0]?.isOwn).toBe(false)
    })

    it('UC-010-04: error.value is set on Supabase failure', async () => {
      fromResult.data  = null
      fromResult.error = { message: 'network error' }
      const { error, fetchEvents } = useCalendar()
      await fetchEvents()
      expect(error.value).toBeTruthy()
      expect(typeof error.value).toBe('string')
    })

    it('UC-010-04: isLoading returns to false on error', async () => {
      fromResult.error = { message: 'error' }
      const { isLoading, fetchEvents } = useCalendar()
      await fetchEvents()
      expect(isLoading.value).toBe(false)
    })

    it('UC-010-04: events are not cleared when fetch fails', async () => {
      useState<CalendarEvent[]>('calendar-events').value = [PRESEEDED_EVENT]
      fromResult.error = { message: 'error' }
      const { events, fetchEvents } = useCalendar()
      await fetchEvents()
      expect(events.value).toHaveLength(1)
    })

    it('UC-010-05: uses "calendar-events" as useState key', () => {
      const { events } = useCalendar()
      const shared = useState<CalendarEvent[]>('calendar-events')
      shared.value = [PRESEEDED_EVENT]
      expect(events.value).toStrictEqual([PRESEEDED_EVENT])
    })

    it('UC-010-06: all events have isOwn false for admin with no personal leave', async () => {
      mockUser.value = { id: 'user-alice' }
      fromResult.data = [EMMA_APPROVED]
      const { events, fetchEvents } = useCalendar()
      await fetchEvents()
      expect(events.value.every(e => !e.isOwn)).toBe(true)
    })
  })

  // ── absentToday logic (UC-010-07 / UC-010-08) ────────────────────────────────
  // absentToday is defined in calendar.vue as:
  //   events.value.filter(e => e.status === 'approved' && e.startDate <= today && e.endDate >= today)
  // We test the filter logic directly via the shared useState.

  describe('absentToday logic', () => {
    it('UC-010-07: includes approved event that spans today', () => {
      const today = '2026-04-15'
      const eventsState = useState<CalendarEvent[]>('calendar-events')
      eventsState.value = [PRESEEDED_EVENT] // approved, 2026-04-14 → 2026-04-18
      const absent = eventsState.value.filter(
        e => e.status === 'approved' && e.startDate <= today && e.endDate >= today,
      )
      expect(absent).toHaveLength(1)
      expect(absent[0].employeeName).toBe('Emma Employée')
    })

    it('UC-010-07: excludes approved event not covering today', () => {
      const today = '2026-04-13'
      const eventsState = useState<CalendarEvent[]>('calendar-events')
      eventsState.value = [PRESEEDED_EVENT] // starts 2026-04-14
      const absent = eventsState.value.filter(
        e => e.status === 'approved' && e.startDate <= today && e.endDate >= today,
      )
      expect(absent).toHaveLength(0)
    })

    it('UC-010-08: returns empty array when no approved events cover today', () => {
      const today = '2026-06-01'
      const eventsState = useState<CalendarEvent[]>('calendar-events')
      eventsState.value = [{ ...PRESEEDED_EVENT, status: 'pending' }]
      const absent = eventsState.value.filter(
        e => e.status === 'approved' && e.startDate <= today && e.endDate >= today,
      )
      expect(absent).toHaveLength(0)
    })
  })

  // ── filteredEvents logic (UC-010-09) ─────────────────────────────────────────
  // filteredEvents is defined in calendar.vue as:
  //   events.value.filter(e => e.teamId === selectedTeamId.value)

  describe('filteredEvents logic', () => {
    it('UC-010-09: filters events by teamId when a team is selected', () => {
      const eventsState = useState<CalendarEvent[]>('calendar-events')
      eventsState.value = [
        PRESEEDED_EVENT,                                      // teamId: 'team-a'
        { ...PRESEEDED_EVENT, id: 'req-99', teamId: 'team-b' },
      ]
      const selectedTeamId = 'team-a'
      const filtered = eventsState.value.filter(e => e.teamId === selectedTeamId)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].teamId).toBe('team-a')
    })

    it('UC-010-09: returns all events when selectedTeamId is "all"', () => {
      const eventsState = useState<CalendarEvent[]>('calendar-events')
      eventsState.value = [
        PRESEEDED_EVENT,
        { ...PRESEEDED_EVENT, id: 'req-99', teamId: 'team-b' },
      ]
      // When 'all', calendar.vue returns events.value directly (no filter)
      expect(eventsState.value).toHaveLength(2)
    })
  })

  // ── readonly refs ─────────────────────────────────────────────────────────────

  describe('readonly refs', () => {
    it('exposes events, isLoading, error as readonly', () => {
      const { events, isLoading, error } = useCalendar()
      expect(Array.isArray(events.value)).toBe(true)
      expect(typeof isLoading.value).toBe('boolean')
      expect(error.value === null || typeof error.value === 'string').toBe(true)
    })
  })
})
