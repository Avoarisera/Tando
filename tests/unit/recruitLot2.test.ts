import { describe, expect, it } from 'vitest'
import { renderTemplate } from '../../server/utils/recruit-emails'
import { publicStep } from '../../server/utils/candidate-step'

describe('renderTemplate', () => {
  it('replaces the known variables and keeps unknown ones', () => {
    expect(renderTemplate('Bonjour {prenom}, poste {poste} {inconnu}', { prenom: 'Awa', poste: 'Dev' })).toBe('Bonjour Awa, poste Dev {inconnu}')
  })
  it('collapses the empty lines left by a missing optional value', () => {
    expect(renderTemplate('A\n\n{lieu}\n\nB', { lieu: '' })).toBe('A\n\nB')
  })
})

describe('publicStep', () => {
  it('maps internal stages to 4 coarse public steps', () => {
    expect(publicStep('new', 'active')).toBe('received')
    expect(publicStep('screen', 'active')).toBe('review')
    expect(publicStep('tech', 'active')).toBe('interviews')
    expect(publicStep('offer', 'active')).toBe('offer')
  })
  it('never reveals a reason: a rejection is just « closed »', () => {
    expect(publicStep('tech', 'rejected')).toBe('closed')
    expect(publicStep('new', 'withdrawn')).toBe('withdrawn')
    expect(publicStep('hired', 'hired')).toBe('hired')
  })
})
