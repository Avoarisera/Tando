import { describe, it, expect } from 'vitest'
import { foldText, textMatch } from '~/utils/wb'

describe('accent-insensitive search', () => {
  it('folds accents and case', () => {
    expect(foldText('Éloïse Garnier')).toBe('eloise garnier')
    expect(foldText('  Société  ')).toBe('societe')
  })
  it('matches with or without accents, both ways', () => {
    expect(textMatch('Emma Employée', 'employee')).toBe(true)
    expect(textMatch('Emma Employee', 'employée')).toBe(true)
    expect(textMatch('Lefèvre', 'LEFEVRE')).toBe(true)
    expect(textMatch('Martin', 'durand')).toBe(false)
  })
  it('an empty query matches everything', () => {
    expect(textMatch('x', '')).toBe(true)
    expect(textMatch(null, '  ')).toBe(true)
  })
})
