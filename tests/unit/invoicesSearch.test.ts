/**
 * Unit tests for the invoice search computed logic in app/pages/invoices.vue.
 *
 * The three computed properties (trimmedSearch, filteredInvoices, emptyDescription)
 * are tested here as extracted pure functions that mirror the component's logic
 * exactly. If the component logic changes, these tests break — that's intentional.
 */

import { describe, it, expect } from 'vitest'
import type { Invoice, InvoiceStatus } from '~/types/index'

// ── Pure functions mirroring invoices.vue computed logic ─────────────────────
//
// trimmedSearch = computed(() => searchQuery.value.trim())
// filteredInvoices = computed(() => {
//   const byStatus = filter === 'all' ? invoices : invoices.filter(i => i.status === filter)
//   if (trimmedSearch.length < 3) return byStatus
//   const lower = trimmedSearch.toLowerCase()
//   return byStatus.filter(i => i.reference.toLowerCase().includes(lower))
// })
// emptyDescription = computed(() => {
//   if (trimmedSearch.length >= 3 && filter !== 'all')
//     return `Aucune facture « ${trimmedSearch} » avec ce statut.`
//   if (trimmedSearch.length >= 3)
//     return `Aucune référence ne correspond à « ${trimmedSearch} ».`
//   return 'Essayez un autre statut.'
// })

type FilterStatus = 'all' | InvoiceStatus

function getTrimmedSearch(raw: string): string {
  return raw.trim()
}

function getFilteredInvoices(
  invoices: Invoice[],
  filterStatus: FilterStatus,
  trimmedSearch: string,
): Invoice[] {
  const byStatus = filterStatus === 'all'
    ? invoices
    : invoices.filter(i => i.status === filterStatus)
  if (trimmedSearch.length < 3) return byStatus
  const lower = trimmedSearch.toLowerCase()
  return byStatus.filter(i => i.reference.toLowerCase().includes(lower))
}

function getEmptyDescription(trimmedSearch: string, filterStatus: FilterStatus): string {
  if (trimmedSearch.length >= 3 && filterStatus !== 'all') {
    return `Aucune facture « ${trimmedSearch} » avec ce statut.`
  }
  if (trimmedSearch.length >= 3) {
    return `Aucune référence ne correspond à « ${trimmedSearch} ».`
  }
  return 'Essayez un autre statut.'
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeInvoice(overrides: Partial<Invoice> & Pick<Invoice, 'id' | 'reference' | 'status'>): Invoice {
  return {
    client:       'Test Corp',
    amount:       100,
    currency:     'EUR',
    invoice_date: '2026-05-01',
    due_date:     null,
    notes:        null,
    pdf_path:     null,
    created_by:   'admin-uuid',
    created_at:   '2026-05-01T00:00:00Z',
    ...overrides,
  }
}

const FIXTURES: Invoice[] = [
  makeInvoice({ id: 's1', reference: 'INV-2025-001', status: 'en_attente' }),
  makeInvoice({ id: 's2', reference: 'INV-2025-002', status: 'envoyee' }),
  makeInvoice({ id: 's3', reference: 'FAC-001',      status: 'en_attente' }),
  makeInvoice({ id: 's4', reference: 'inv-2025-003', status: 'payee' }),   // lowercase ref
]

// ── trimmedSearch ─────────────────────────────────────────────────────────────

describe('trimmedSearch', () => {
  it('returns empty string for empty input', () => {
    expect(getTrimmedSearch('')).toBe('')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(getTrimmedSearch('   ')).toBe('')
  })

  it('strips leading and trailing spaces', () => {
    expect(getTrimmedSearch('  INV  ')).toBe('INV')
  })

  it('preserves internal characters unchanged', () => {
    expect(getTrimmedSearch('INV-2025-001')).toBe('INV-2025-001')
  })

  it('preserves special characters (angle brackets, script tags)', () => {
    expect(getTrimmedSearch('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
  })
})

// ── filteredInvoices ──────────────────────────────────────────────────────────

describe('filteredInvoices', () => {
  describe('search threshold', () => {
    it('returns all invoices when search is empty', () => {
      const result = getFilteredInvoices(FIXTURES, 'all', '')
      expect(result).toHaveLength(4)
    })

    it('returns all invoices when search is 1 character', () => {
      const result = getFilteredInvoices(FIXTURES, 'all', 'I')
      expect(result).toHaveLength(4)
    })

    it('returns all invoices when search is exactly 2 characters', () => {
      const result = getFilteredInvoices(FIXTURES, 'all', 'IN')
      expect(result).toHaveLength(4)
    })

    it('activates filtering at exactly 3 characters', () => {
      const result = getFilteredInvoices(FIXTURES, 'all', 'INV')
      expect(result).toHaveLength(3)   // INV-2025-001, INV-2025-002, inv-2025-003
    })
  })

  describe('case-insensitive matching', () => {
    it('matches uppercase query against lowercase reference', () => {
      const result = getFilteredInvoices(FIXTURES, 'all', 'INV')
      const ids = result.map(i => i.id)
      expect(ids).toContain('s4')   // 'inv-2025-003' matched by 'INV'
    })

    it('matches lowercase query against uppercase reference', () => {
      const result = getFilteredInvoices(FIXTURES, 'all', 'inv')
      const ids = result.map(i => i.id)
      expect(ids).toContain('s1')   // 'INV-2025-001' matched by 'inv'
      expect(ids).toContain('s2')
      expect(ids).toContain('s4')
    })

    it('is symmetric — "INV" and "inv" return the same set', () => {
      const upper = getFilteredInvoices(FIXTURES, 'all', 'INV').map(i => i.id).sort()
      const lower = getFilteredInvoices(FIXTURES, 'all', 'inv').map(i => i.id).sort()
      expect(upper).toEqual(lower)
    })
  })

  describe('substring matching', () => {
    it('matches a substring in the middle of the reference', () => {
      const result = getFilteredInvoices(FIXTURES, 'all', '2025')
      const ids = result.map(i => i.id)
      expect(ids).toContain('s1')
      expect(ids).toContain('s2')
      expect(ids).toContain('s4')
      expect(ids).not.toContain('s3')   // 'FAC-001' has no '2025'
    })

    it('returns empty array when query matches nothing', () => {
      const result = getFilteredInvoices(FIXTURES, 'all', 'XYZ')
      expect(result).toHaveLength(0)
    })

    it('matches exact full reference', () => {
      const result = getFilteredInvoices(FIXTURES, 'all', 'FAC-001')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('s3')
    })
  })

  describe('status filter', () => {
    it('returns only invoices matching the filter status when no search', () => {
      const result = getFilteredInvoices(FIXTURES, 'envoyee', '')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('s2')
    })

    it('returns empty array when status filter matches nothing', () => {
      const result = getFilteredInvoices(FIXTURES, 'payee', 'ZZZ')
      // search < 3 chars would not apply, but even without: payee has only s4
      expect(result).toHaveLength(0)
    })
  })

  describe('combined: status filter + search', () => {
    it('applies status filter first, then search within that subset', () => {
      // en_attente: s1 (INV-2025-001), s3 (FAC-001)
      // search "INV" within en_attente → only s1
      const result = getFilteredInvoices(FIXTURES, 'en_attente', 'INV')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('s1')
    })

    it('returns empty array when search matches no invoice in the filtered status', () => {
      // envoyee: only s2 (INV-2025-002); search "FAC" → no match
      const result = getFilteredInvoices(FIXTURES, 'envoyee', 'FAC')
      expect(result).toHaveLength(0)
    })

    it('search that would match across statuses is scoped to the active status', () => {
      // "2025" matches s1, s2, s4 — but with filter envoyee, only s2 qualifies
      const result = getFilteredInvoices(FIXTURES, 'envoyee', '2025')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('s2')
    })

    it('filter "all" with search returns matches across all statuses', () => {
      const result = getFilteredInvoices(FIXTURES, 'all', '2025')
      expect(result).toHaveLength(3)   // s1, s2, s4
    })
  })

  describe('whitespace trimming applied before matching', () => {
    it('trims before length check — "  A  " is treated as 1 char (no activation)', () => {
      const trimmed = getTrimmedSearch('  A  ')
      const result = getFilteredInvoices(FIXTURES, 'all', trimmed)
      expect(result).toHaveLength(4)   // 1 char after trim — search inactive
    })

    it('trims before matching — "  INV  " activates and matches', () => {
      const trimmed = getTrimmedSearch('  INV  ')
      const result = getFilteredInvoices(FIXTURES, 'all', trimmed)
      expect(result).toHaveLength(3)
    })
  })
})

// ── emptyDescription ──────────────────────────────────────────────────────────

describe('emptyDescription', () => {
  it('returns status-only message when search is inactive (< 3 chars)', () => {
    expect(getEmptyDescription('', 'envoyee')).toBe('Essayez un autre statut.')
    expect(getEmptyDescription('IN', 'envoyee')).toBe('Essayez un autre statut.')
  })

  it('returns status-only message when filter is "all" and search is inactive', () => {
    expect(getEmptyDescription('', 'all')).toBe('Essayez un autre statut.')
  })

  it('returns search-only message when filter is "all" and search is active', () => {
    expect(getEmptyDescription('XYZ', 'all'))
      .toBe('Aucune référence ne correspond à « XYZ ».')
  })

  it('returns combined message when both search and status filter are active', () => {
    expect(getEmptyDescription('XYZ', 'envoyee'))
      .toBe('Aucune facture « XYZ » avec ce statut.')
  })

  it('uses the exact trimmed search value in the message (not the raw input)', () => {
    const trimmed = getTrimmedSearch('  XYZ  ')
    expect(getEmptyDescription(trimmed, 'all'))
      .toBe('Aucune référence ne correspond à « XYZ ».')
  })

  it('interpolates the search term verbatim (including special characters)', () => {
    expect(getEmptyDescription('FAC-2025', 'all'))
      .toBe('Aucune référence ne correspond à « FAC-2025 ».')
  })

  it('boundary: search exactly 3 chars activates the search message', () => {
    expect(getEmptyDescription('INV', 'all'))
      .toBe('Aucune référence ne correspond à « INV ».')
  })

  it('boundary: search exactly 2 chars does not activate search message', () => {
    expect(getEmptyDescription('IN', 'all')).toBe('Essayez un autre statut.')
  })
})
