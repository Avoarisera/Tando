import { describe, it, expect } from 'vitest'
import { errorMessage } from '~/utils/api-error'

describe('errorMessage', () => {
  it('reads Error, PostgREST objects and strings', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage({ message: 'column leave_types.tracks_balance does not exist', code: '42703' })).toBe('column leave_types.tracks_balance does not exist')
    expect(errorMessage('texte')).toBe('texte')
  })
  it('never returns [object Object]', () => {
    expect(errorMessage({ code: 'x' }, 'Erreur')).toBe('Erreur')
    expect(errorMessage(null, 'Erreur')).toBe('Erreur')
  })
})
