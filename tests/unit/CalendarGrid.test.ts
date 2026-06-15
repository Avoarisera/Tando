import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import CalendarGrid from '~/components/calendar/CalendarGrid.vue'
import type { CalendarEvent } from '~/types/index'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const EMMA_APPROVED: CalendarEvent = {
  id:             'req-43',
  userId:         'user-emma',
  employeeName:   'Emma Employée',
  leaveTypeName:  'Congé payé',
  leaveTypeColor: '#4CAF50',
  startDate:      '2026-04-14',
  endDate:        '2026-04-18',
  status:         'approved',
  isOwn:          true,
  teamId:         'team-a',
  teamName:       'Équipe A',
}

const RTT_EVENT: CalendarEvent = {
  id:             'req-42',
  userId:         'user-eddy',
  employeeName:   'Eddy Employé',
  leaveTypeName:  'RTT',
  leaveTypeColor: '#2196F3',
  startDate:      '2026-04-20',
  endDate:        '2026-04-21',
  status:         'approved',
  isOwn:          false,
  teamId:         'team-a',
  teamName:       'Équipe A',
}

// CalendarGrid.vue exposes its internal computed/functions via the setup proxy.
// We cast to any to access them without needing defineExpose.
type GridVm = {
  weeks:            (Date | null)[][]
  eventsForDay:     (day: Date) => CalendarEvent[]
  isEventStart:     (event: CalendarEvent, day: Date) => boolean
  isEventEnd:       (event: CalendarEvent, day: Date) => boolean
  uniqueLeaveTypes: { name: string; color: string }[]
}

async function mountGrid(month: Date, events: CalendarEvent[] = []) {
  return mountSuspended(CalendarGrid, {
    props: { currentMonth: month, events },
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CalendarGrid', () => {
  // ── UC-010-10 : avril 2026 ────────────────────────────────────────────────

  describe('UC-010-10: April 2026 grid structure', () => {
    it('starts with 2 leading null days (Wednesday = ISO day 2)', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1))
      const vm = wrapper.vm as unknown as GridVm
      expect(vm.weeks[0][0]).toBeNull() // Monday 30/3
      expect(vm.weeks[0][1]).toBeNull() // Tuesday 31/3
      expect(vm.weeks[0][2]).toBeInstanceOf(Date) // Wednesday 1 April
    })

    it('has exactly 30 day cells (non-null entries)', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1))
      const vm = wrapper.vm as unknown as GridVm
      const allDays = vm.weeks.flat().filter(d => d !== null)
      expect(allDays).toHaveLength(30)
    })

    it('has 5 weeks (rows)', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1))
      const vm = wrapper.vm as unknown as GridVm
      expect(vm.weeks).toHaveLength(5)
    })

    it('last day is April 30', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1))
      const vm = wrapper.vm as unknown as GridVm
      const days = vm.weeks.flat().filter((d): d is Date => d !== null)
      const last = days[days.length - 1]
      expect(last.getDate()).toBe(30)
      expect(last.getMonth()).toBe(3)
    })
  })

  // ── UC-010-11 : février 2026 ──────────────────────────────────────────────

  describe('UC-010-11: February 2026 grid structure', () => {
    it('has exactly 28 day cells', async () => {
      const wrapper = await mountGrid(new Date(2026, 1, 1))
      const vm = wrapper.vm as unknown as GridVm
      const allDays = vm.weeks.flat().filter(d => d !== null)
      expect(allDays).toHaveLength(28)
    })

    it('starts with 6 leading null days (Sunday = ISO day 6)', async () => {
      const wrapper = await mountGrid(new Date(2026, 1, 1))
      const vm = wrapper.vm as unknown as GridVm
      const leadingNulls = vm.weeks[0].filter(d => d === null)
      expect(leadingNulls).toHaveLength(6)
      expect(vm.weeks[0][6]).toBeInstanceOf(Date) // Sunday 1 Feb
      expect((vm.weeks[0][6] as Date).getDate()).toBe(1)
    })

    it('contains no day 29', async () => {
      const wrapper = await mountGrid(new Date(2026, 1, 1))
      const vm = wrapper.vm as unknown as GridVm
      const days = vm.weeks.flat().filter((d): d is Date => d !== null)
      expect(days.find(d => d.getDate() === 29)).toBeUndefined()
    })
  })

  // ── UC-010-12 : eventsForDay — multi-day event ───────────────────────────

  describe('UC-010-12: eventsForDay multi-day coverage', () => {
    it('returns event for a day in the middle of the range', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1), [EMMA_APPROVED])
      const vm = wrapper.vm as unknown as GridVm
      const mid = new Date(2026, 3, 15) // 2026-04-15 ∈ [14-18]
      expect(vm.eventsForDay(mid)).toHaveLength(1)
      expect(vm.eventsForDay(mid)[0].id).toBe('req-43')
    })

    it('returns empty array for the day before the event starts', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1), [EMMA_APPROVED])
      const vm = wrapper.vm as unknown as GridVm
      const before = new Date(2026, 3, 13) // 2026-04-13 < 2026-04-14
      expect(vm.eventsForDay(before)).toHaveLength(0)
    })

    it('returns empty array for the day after the event ends', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1), [EMMA_APPROVED])
      const vm = wrapper.vm as unknown as GridVm
      const after = new Date(2026, 3, 19) // 2026-04-19 > 2026-04-18
      expect(vm.eventsForDay(after)).toHaveLength(0)
    })

    it('returns event on the start date itself', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1), [EMMA_APPROVED])
      const vm = wrapper.vm as unknown as GridVm
      const start = new Date(2026, 3, 14)
      expect(vm.eventsForDay(start)).toHaveLength(1)
    })

    it('returns event on the end date itself', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1), [EMMA_APPROVED])
      const vm = wrapper.vm as unknown as GridVm
      const end = new Date(2026, 3, 18)
      expect(vm.eventsForDay(end)).toHaveLength(1)
    })
  })

  // ── UC-010-13 : isEventStart ──────────────────────────────────────────────

  describe('UC-010-13: isEventStart', () => {
    it('returns true on the event start date', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1), [EMMA_APPROVED])
      const vm = wrapper.vm as unknown as GridVm
      expect(vm.isEventStart(EMMA_APPROVED, new Date(2026, 3, 14))).toBe(true)
    })

    it('returns false on a subsequent day of the event', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1), [EMMA_APPROVED])
      const vm = wrapper.vm as unknown as GridVm
      expect(vm.isEventStart(EMMA_APPROVED, new Date(2026, 3, 15))).toBe(false)
    })

    it('returns false on the end date when start ≠ end', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1), [EMMA_APPROVED])
      const vm = wrapper.vm as unknown as GridVm
      expect(vm.isEventStart(EMMA_APPROVED, new Date(2026, 3, 18))).toBe(false)
    })
  })

  // ── UC-010-14 : uniqueLeaveTypes ──────────────────────────────────────────

  describe('UC-010-14: uniqueLeaveTypes deduplication', () => {
    it('returns one entry per distinct leave type name', async () => {
      // Two EMMA_APPROVED events (same type), one RTT
      const duplicate = { ...EMMA_APPROVED, id: 'req-99', startDate: '2026-04-20', endDate: '2026-04-21' }
      const wrapper = await mountGrid(new Date(2026, 3, 1), [EMMA_APPROVED, duplicate, RTT_EVENT])
      const vm = wrapper.vm as unknown as GridVm
      expect(vm.uniqueLeaveTypes).toHaveLength(2)
    })

    it('preserves name and color for each unique type', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1), [EMMA_APPROVED, RTT_EVENT])
      const vm = wrapper.vm as unknown as GridVm
      const names = vm.uniqueLeaveTypes.map(t => t.name)
      expect(names).toContain('Congé payé')
      expect(names).toContain('RTT')
    })

    it('returns empty array when no events', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1), [])
      const vm = wrapper.vm as unknown as GridVm
      expect(vm.uniqueLeaveTypes).toHaveLength(0)
    })

    it('does not duplicate when same type appears multiple times', async () => {
      const same1 = { ...EMMA_APPROVED, id: 'a' }
      const same2 = { ...EMMA_APPROVED, id: 'b' }
      const same3 = { ...EMMA_APPROVED, id: 'c' }
      const wrapper = await mountGrid(new Date(2026, 3, 1), [same1, same2, same3])
      const vm = wrapper.vm as unknown as GridVm
      expect(vm.uniqueLeaveTypes).toHaveLength(1)
    })
  })

  // ── Mobile list: eventsThisMonth ──────────────────────────────────────────

  describe('Mobile list: events visible in the current month', () => {
    it('includes event whose range overlaps the displayed month', async () => {
      const wrapper = await mountGrid(new Date(2026, 3, 1), [EMMA_APPROVED])
      // Employee name should appear in the mobile list
      expect(wrapper.text()).toContain('Emma Employée')
    })

    it('does not show event entirely outside the displayed month', async () => {
      // RTT is 2026-04-20 but let's mount on May 2026
      const mayOnly: CalendarEvent = { ...EMMA_APPROVED, startDate: '2026-04-14', endDate: '2026-04-18' }
      const wrapper = await mountGrid(new Date(2026, 4, 1), [mayOnly]) // May 2026
      expect(wrapper.text()).not.toContain('Emma Employée')
    })
  })
})
