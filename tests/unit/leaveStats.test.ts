import { describe, expect, it } from 'vitest'
import { leaveStats, littleLeave, workingDaysIn, type StatRequest } from '../../app/utils/leave-stats'

const r = (over: Partial<StatRequest>): StatRequest => ({
  user_id: 'u1', start_date: '2026-03-02', end_date: '2026-03-06', status: 'approved', type: 'Congé payé', color: '#4CAF50', ...over,
})

describe('workingDaysIn', () => {
  it('counts Mon–Fri only, with half days at the request edges', () => {
    expect(workingDaysIn(r({}), '2026-01-01', '2026-12-31')).toBe(5)
    expect(workingDaysIn(r({ start_date: '2026-03-06', end_date: '2026-03-09' }), '2026-01-01', '2026-12-31')).toBe(2) // Fri + Mon
    expect(workingDaysIn(r({ start_half: true, end_half: true }), '2026-01-01', '2026-12-31')).toBe(4)
  })
  it('clips to the window and skips public holidays', () => {
    expect(workingDaysIn(r({}), '2026-03-04', '2026-12-31')).toBe(3)
    expect(workingDaysIn(r({}), '2026-01-01', '2026-12-31', { '2026-03-03': 'Férié' })).toBe(4)
  })
})

describe('leaveStats', () => {
  it('splits taken and planned around today, per type, approved leave only', () => {
    const s = leaveStats([
      r({}),
      r({ start_date: '2026-11-09', end_date: '2026-11-10', type: 'RTT', color: '#2196F3' }),
      r({ start_date: '2026-11-02', end_date: '2026-11-06' }), // straddles today (Thu 5)
      r({ status: 'pending', start_date: '2026-12-01', end_date: '2026-12-01' }),
      r({ status: 'rejected' }),
    ], 2026, '2026-11-05')
    const p = s.people.get('u1')!
    expect(p.taken).toBe(5 + 3)
    expect(p.planned).toBe(2 + 2)
    expect(p.byType.RTT).toEqual({ taken: 0, planned: 2 })
    expect(p.lastLeave).toBe('2026-11-04')
    expect(s.types.map(t => t.name)).toEqual(['Congé payé', 'RTT'])
    expect(s.months[2]!['Congé payé']).toBe(5)
    expect(s.months[10]!['RTT']).toBe(2)
  })
  it('ignores leave outside the year', () => {
    const s = leaveStats([r({ start_date: '2025-12-29', end_date: '2026-01-02' })], 2026, '2026-11-05', { '2026-01-01': 'Jour de l’an' })
    expect(s.people.get('u1')!.taken).toBe(1) // Fri 2 Jan only
  })
})

describe('littleLeave', () => {
  it('flags under 25 % of the allowance past mid-year', () => {
    expect(littleLeave({ taken: 5, lastLeave: '2026-10-01' }, 25, '2026-11-05', 2026)).toBe(true)
    expect(littleLeave({ taken: 10, lastLeave: '2026-10-01' }, 25, '2026-11-05', 2026)).toBe(false)
  })
  it('flags no leave for 4 months', () => {
    expect(littleLeave({ taken: 12, lastLeave: '2026-06-01' }, 25, '2026-11-05', 2026)).toBe(true)
    expect(littleLeave(undefined, null, '2026-11-05', 2026)).toBe(true)
  })
  it('stays quiet early in the year and on past years', () => {
    expect(littleLeave(undefined, 25, '2026-02-10', 2026)).toBe(false)
    expect(littleLeave(undefined, 25, '2026-11-05', 2025)).toBe(false)
  })
})
