import { describe, it, expect } from 'vitest'

describe('formatDate', () => {
  describe('valid ISO date strings', () => {
    it('formats YYYY-MM-DD to DD/MM/YYYY', () => {
      expect(formatDate('2026-06-01')).toBe('01/06/2026')
    })

    it('pads single-digit day and month with leading zero', () => {
      expect(formatDate('2026-01-05')).toBe('05/01/2026')
    })

    it('handles end-of-year date', () => {
      expect(formatDate('2026-12-31')).toBe('31/12/2026')
    })

    it('handles start-of-year date', () => {
      expect(formatDate('2026-01-01')).toBe('01/01/2026')
    })

    it('strips time component from full ISO timestamp', () => {
      expect(formatDate('2026-04-14T00:00:00Z')).toBe('14/04/2026')
    })

    it('strips timezone offset from ISO timestamp with offset', () => {
      expect(formatDate('2026-04-14T09:30:00+02:00')).toBe('14/04/2026')
    })
  })

  describe('null / empty inputs → em dash', () => {
    it('returns em dash for null', () => {
      expect(formatDate(null)).toBe('—')
    })

    it('returns em dash for undefined', () => {
      expect(formatDate(undefined)).toBe('—')
    })

    it('returns em dash for empty string', () => {
      expect(formatDate('')).toBe('—')
    })
  })

  describe('output format integrity', () => {
    it('uses forward slashes as separator, not dashes', () => {
      const result = formatDate('2026-06-15')
      expect(result).not.toContain('-')
      expect(result.split('/').length).toBe(3)
    })

    it('day is always the first segment', () => {
      const [day] = formatDate('2026-06-15').split('/')
      expect(day).toBe('15')
    })

    it('year is always the last segment', () => {
      const parts = formatDate('2026-06-15').split('/')
      expect(parts[2]).toBe('2026')
    })
  })
})
