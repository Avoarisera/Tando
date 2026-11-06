import { describe, expect, it } from 'vitest'
import { countBy, funnel, furthestStage, medianDaysToHire, perMonth, pseudonym, type StatApp, type StatEvent } from '../../app/utils/recruit-stats'

const stages = [{ key: 'new', label: 'Nouvelle' }, { key: 'screen', label: 'Présélection' }, { key: 'tech', label: 'Tech' }, { key: 'offer', label: 'Offre' }, { key: 'hired', label: 'Embauché' }]
const app = (over: Partial<StatApp>): StatApp => ({ id: 'a', opening_id: 'o', stage: 'new', status: 'active', source: 'careers', rejection_reason: null, created_at: '2026-10-01T10:00:00Z', ...over })

describe('furthestStage / funnel', () => {
  it('counts a declined candidate at the furthest stage it reached, not where it stopped', () => {
    const events: StatEvent[] = [{ application_id: 'b', kind: 'stage', data: { from: 'new', to: 'tech' }, created_at: '2026-10-05T00:00:00Z' }]
    expect(furthestStage(app({ id: 'b', stage: 'tech', status: 'rejected' }), events, stages)).toBe(2)
  })
  it('builds a never-increasing funnel', () => {
    const apps = [app({ id: 'a' }), app({ id: 'b', stage: 'screen' }), app({ id: 'c', stage: 'hired', status: 'hired' })]
    expect(funnel(apps, [], stages).map(s => s.n)).toEqual([3, 2, 1, 1, 1])
  })
})

describe('medianDaysToHire', () => {
  it('uses the hire event date', () => {
    const apps = [app({ id: 'x', status: 'hired' }), app({ id: 'y', status: 'hired' }), app({ id: 'z' })]
    const ev: StatEvent[] = [
      { application_id: 'x', kind: 'hired', data: {}, created_at: '2026-10-11T10:00:00Z' },
      { application_id: 'y', kind: 'hired', data: {}, created_at: '2026-10-21T10:00:00Z' },
    ]
    expect(medianDaysToHire(apps, ev)).toBe(15)
    expect(medianDaysToHire([app({})], [])).toBeNull()
  })
})

describe('helpers', () => {
  it('counts by key, largest first', () => {
    expect(countBy([{ s: 'linkedin' }, { s: 'careers' }, { s: 'linkedin' }, { s: '' }], x => x.s)).toEqual([{ label: 'linkedin', n: 2 }, { label: 'careers', n: 1 }])
  })
  it('counts per month over the last months', () => {
    const r = perMonth([app({ created_at: '2026-11-02T00:00:00Z' }), app({ created_at: '2026-09-30T00:00:00Z' })], '2026-11-06', 3)
    expect(r).toEqual([{ month: '2026-09', n: 1 }, { month: '2026-10', n: 0 }, { month: '2026-11', n: 1 }])
  })
  it('gives a stable 4-character pseudonym', () => {
    expect(pseudonym('abc')).toBe(pseudonym('abc'))
    expect(pseudonym('abc')).toMatch(/^[0-9A-F]{4}$/)
  })
})
