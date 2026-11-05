import { describe, it, expect } from 'vitest'
import { workingDaysIn, leaveDaysIn, capacityOf } from '../../server/utils/capacity'

const NONE = new Set<string>()
const XMAS = new Set(['2026-12-25'])

describe('workingDaysIn', () => {
  it('skips weekends and holidays', () => {
    // Mon 21 → Sun 27 Dec 2026, Christmas on Friday
    expect(workingDaysIn('2026-12-21', '2026-12-27', XMAS)).toEqual(['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24'])
  })
})

describe('leaveDaysIn', () => {
  it('counts only the part of the leave inside the range', () => {
    const leaves = [{ start_date: '2026-12-17', end_date: '2026-12-22', start_half: false, end_half: false }]
    expect(leaveDaysIn('2026-12-21', '2026-12-27', XMAS, leaves)).toBe(2)
  })
  it('counts half days on the first and last day', () => {
    const leaves = [{ start_date: '2026-12-21', end_date: '2026-12-23', start_half: true, end_half: true }]
    expect(leaveDaysIn('2026-12-21', '2026-12-27', NONE, leaves)).toBe(2)
  })
  it('does not count a holiday or a weekend inside a leave', () => {
    const leaves = [{ start_date: '2026-12-24', end_date: '2026-12-28', start_half: false, end_half: false }]
    expect(leaveDaysIn('2026-12-21', '2026-12-31', XMAS, leaves)).toBe(2)
  })
  it('does not double count overlapping leaves', () => {
    const leaves = [
      { start_date: '2026-12-21', end_date: '2026-12-21', start_half: false, end_half: false },
      { start_date: '2026-12-21', end_date: '2026-12-21', start_half: true, end_half: false },
    ]
    expect(leaveDaysIn('2026-12-21', '2026-12-21', NONE, leaves)).toBe(1)
  })
})

describe('capacityOf', () => {
  it('available = working − leave', () => {
    const leaves = [{ start_date: '2026-12-22', end_date: '2026-12-22', start_half: false, end_half: true }]
    expect(capacityOf('2026-12-21', '2026-12-27', XMAS, leaves)).toEqual({ working: 4, leave: 0.5, available: 3.5 })
  })
})

import { readableApiError } from '~/utils/api-error'

describe('readableApiError', () => {
  it('keeps only the server message of a 4xx', () => {
    expect(readableApiError('[GET] "/api/metrics?teamId=x": 400 workspaceId requis')).toBe('WorkspaceId requis')
  })
  it('hides server errors and network failures behind the generic message', () => {
    expect(readableApiError('[GET] "/api/metrics": 500 Internal Server Error')).toBeNull()
    expect(readableApiError('fetch failed')).toBeNull()
    expect(readableApiError(null)).toBeNull()
  })
  it('passes plain messages through', () => {
    expect(readableApiError('Clé API invalide')).toBe('Clé API invalide')
  })
})
