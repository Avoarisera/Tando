import { describe, expect, it } from 'vitest'
import { averageRating, compareRatings, missingInResponse, packetStep, type TemplateContent } from '../../app/utils/reviews'

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
