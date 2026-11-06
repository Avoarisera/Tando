import { describe, expect, it } from 'vitest'
import { averageRating, compareRatings, missingInResponse, packetStep, peerContent, type TemplateContent } from '../../app/utils/reviews'

const content: TemplateContent = {
  objectives: true,
  competencies: [{ id: 'q', label: 'Qualité', levels: ['a', 'b', 'c', 'd'] }, { id: 'c', label: 'Collab', levels: ['a', 'b', 'c', 'd'] }],
  questions: [{ id: 'proud', label: 'Fierté', roles: ['self'] }, { id: 'improve', label: 'Progresser', roles: ['self', 'manager'] }, { id: 'strengths', label: 'Forces', roles: ['manager'] }],
}

describe('missingInResponse', () => {
  it('lists unrated competencies and unanswered questions for that role only', () => {
    expect(missingInResponse(content, 'self', { ratings: { q: 3 }, answers: { proud: 'x' } })).toEqual({ competencies: ['c'], questions: ['improve'] })
    expect(missingInResponse(content, 'manager', { ratings: { q: 3, c: 0 }, answers: { improve: 'y', strengths: 'z' } })).toEqual({ competencies: [], questions: [] })
  })
})

describe('compareRatings', () => {
  it('flags a gap of 2 levels or more, ignores « can’t say »', () => {
    const r = compareRatings(content, { q: 4, c: 0 }, { q: 2, c: 3 })
    expect(r[0]).toMatchObject({ self: 4, manager: 2, gap: 2, flag: true })
    expect(r[1]).toMatchObject({ self: null, manager: 3, gap: null, flag: false })
  })
})

describe('averageRating / packetStep', () => {
  it('averages rated competencies only', () => {
    expect(averageRating({ a: 3, b: 4, c: 0 })).toBe(3.5)
    expect(averageRating({})).toBeNull()
  })
  it('gives the current step of a packet', () => {
    const base = { self_submitted: false, manager_submitted: false, has_manager: true, hr_done: false, shared: false, acknowledged: false }
    expect(packetStep(base)).toBe('self')
    expect(packetStep({ ...base, self_submitted: true })).toBe('manager')
    expect(packetStep({ ...base, self_submitted: true, has_manager: false })).toBe('hr')
    expect(packetStep({ ...base, self_submitted: true, manager_submitted: true, hr_done: true })).toBe('ready')
    expect(packetStep({ ...base, shared: true, acknowledged: true })).toBe('acknowledged')
  })
})

describe('peerContent (lot 2)', () => {
  const withPeer: TemplateContent = { ...content, peer: { competencies: ['c', 'gone'], questions: [{ id: 'keep', label: 'Continuer' }] } }
  it('keeps only the competencies asked to colleagues, no objectives, peer questions', () => {
    const p = peerContent(withPeer)
    expect(p.objectives).toBe(false)
    expect(p.competencies.map(c => c.id)).toEqual(['c'])
    expect(p.questions).toEqual([{ id: 'keep', label: 'Continuer', roles: ['peer'] }])
  })
  it('a peer must rate the asked competencies and answer the peer questions', () => {
    expect(missingInResponse(peerContent(withPeer), 'peer', { ratings: {}, answers: {} })).toEqual({ competencies: ['c'], questions: ['keep'] })
    expect(missingInResponse(peerContent(withPeer), 'peer', { ratings: { c: 0 }, answers: { keep: 'ok' } })).toEqual({ competencies: [], questions: [] })
  })
  it('a template without a peer part gives an empty form', () => {
    expect(peerContent(content)).toEqual({ objectives: false, competencies: [], questions: [] })
  })
})

describe('lot 3 — dates (TND-35)', () => {
  it('professional interview: 2 years after hire, then after the last one; 6-year review', async () => {
    const { professionalDue } = await import('../../app/utils/reviews')
    expect(professionalDue({ joined_at: '2024-01-15', last_ep: null, last_bilan: null }, '2025-12-01')).toMatchObject({ nextEp: '2026-01-15', epStatus: 'soon', nextBilan: '2030-01-15', bilanStatus: 'ok' })
    expect(professionalDue({ joined_at: '2020-03-01', last_ep: '2025-06-10', last_bilan: null }, '2026-11-06')).toMatchObject({ nextEp: '2027-06-10', epStatus: 'ok', nextBilan: '2026-03-01', bilanStatus: 'overdue' })
    expect(professionalDue({ joined_at: '2014-03-01', last_ep: '2025-06-10', last_bilan: '2020-04-01' }, '2026-11-06').nextBilan).toBe('2026-03-01')
    expect(professionalDue({ joined_at: '2024-02-29', last_ep: null, last_bilan: null }, '2025-01-01').nextEp).toBe('2026-02-28')
  })
  it('reminders: D-3 to D, then D+1 to D+7', async () => {
    const { reminderPhase } = await import('../../app/utils/reviews')
    expect(reminderPhase('2026-11-20', '2026-11-16')).toBeNull()
    expect(reminderPhase('2026-11-20', '2026-11-17')).toBe('before')
    expect(reminderPhase('2026-11-20', '2026-11-20')).toBe('before')
    expect(reminderPhase('2026-11-20', '2026-11-21')).toBe('after')
    expect(reminderPhase('2026-11-20', '2026-11-27')).toBe('after')
    expect(reminderPhase('2026-11-20', '2026-11-28')).toBeNull()
    expect(reminderPhase(null, '2026-11-20')).toBeNull()
  })
})
