import { describe, it, expect } from 'vitest'
import {
  isDevDelivered,
  devCycleHours,
  qaTimeHours,
  leadTimeHours,
  percentile,
  reworkRate,
  computeMonthly,
  DEV_DELIVERED_STATES,
  type LinearIssueRow,
  type IssueHistoryRow,
} from '../../server/utils/metrics'

function makeIssue(overrides: Partial<LinearIssueRow> = {}): LinearIssueRow {
  return {
    id: 'issue-1',
    assignee_id: 'dev-1',
    status: 'Done',
    estimate: 3,
    started_at: '2026-04-01T09:00:00Z',
    qa_started_at: '2026-04-03T09:00:00Z',
    completed_at: '2026-04-04T09:00:00Z',
    updated_at: '2026-04-04T10:00:00Z',
    created_at: '2026-03-30T09:00:00Z',
    ...overrides,
  }
}

function makeHistory(overrides: Partial<IssueHistoryRow> = {}): IssueHistoryRow {
  return {
    issue_id: 'issue-1',
    from_status: 'Done',
    to_status: 'In Progress',
    changed_at: '2026-04-05T10:00:00Z',
    ...overrides,
  }
}

describe('isDevDelivered', () => {
  it('returns true for every DEV_DELIVERED_STATES value', () => {
    for (const status of DEV_DELIVERED_STATES) {
      expect(isDevDelivered(makeIssue({ status }))).toBe(true)
    }
  })

  it('returns false for in-progress statuses', () => {
    for (const status of ['In Progress', 'Todo', 'Backlog', 'Cancelled', null]) {
      expect(isDevDelivered(makeIssue({ status }))).toBe(false)
    }
  })
})

describe('devCycleHours', () => {
  it('computes hours between started_at and qa_started_at', () => {
    const issue = makeIssue({
      started_at: '2026-04-01T09:00:00Z',
      qa_started_at: '2026-04-02T09:00:00Z',
    })
    expect(devCycleHours(issue)).toBe(24)
  })

  it('returns null when started_at is missing', () => {
    expect(devCycleHours(makeIssue({ started_at: null }))).toBeNull()
  })

  it('returns null when qa_started_at is missing', () => {
    expect(devCycleHours(makeIssue({ qa_started_at: null }))).toBeNull()
  })

  it('handles sub-hour durations', () => {
    const issue = makeIssue({
      started_at: '2026-04-01T09:00:00Z',
      qa_started_at: '2026-04-01T10:30:00Z',
    })
    expect(devCycleHours(issue)).toBe(1.5)
  })
})

describe('percentile', () => {
  it('returns 0 for empty array', () => {
    expect(percentile([], 50)).toBe(0)
    expect(percentile([], 90)).toBe(0)
  })

  it('P50 equals median for odd-length sorted array', () => {
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30)
  })

  it('P50 interpolates for even-length array', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25)
  })

  it('P90 interpolates correctly', () => {
    // [10,20,30,40,50,60,70,80,90,100] — rank = 0.9 * 9 = 8.1 → 90 + 0.1*(100-90) = 91
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90)).toBeCloseTo(91)
  })

  it('P0 returns min value', () => {
    expect(percentile([5, 10, 15], 0)).toBe(5)
  })

  it('P100 returns max value', () => {
    expect(percentile([5, 10, 15], 100)).toBe(15)
  })

  it('works with unsorted input', () => {
    expect(percentile([30, 10, 20], 50)).toBe(20)
  })
})

describe('qaTimeHours', () => {
  it('computes hours between qa_started_at and completed_at', () => {
    const issue = makeIssue({
      qa_started_at: '2026-04-03T09:00:00Z',
      completed_at: '2026-04-04T09:00:00Z',
    })
    expect(qaTimeHours(issue)).toBe(24)
  })

  it('returns null when qa_started_at is absent', () => {
    expect(qaTimeHours(makeIssue({ qa_started_at: null }))).toBeNull()
  })

  it('returns null when completed_at is absent', () => {
    expect(qaTimeHours(makeIssue({ completed_at: null }))).toBeNull()
  })

  it('handles sub-hour durations', () => {
    const issue = makeIssue({
      qa_started_at: '2026-04-03T09:00:00Z',
      completed_at: '2026-04-03T10:30:00Z',
    })
    expect(qaTimeHours(issue)).toBe(1.5)
  })
})

describe('leadTimeHours', () => {
  it('computes hours between created_at and qa_started_at', () => {
    const issue = makeIssue({
      created_at: '2026-04-01T09:00:00Z',
      qa_started_at: '2026-04-03T09:00:00Z',
    })
    expect(leadTimeHours(issue)).toBe(48)
  })

  it('returns null when created_at is absent', () => {
    expect(leadTimeHours(makeIssue({ created_at: null }))).toBeNull()
  })

  it('returns null when qa_started_at is absent', () => {
    expect(leadTimeHours(makeIssue({ qa_started_at: null }))).toBeNull()
  })
})

describe('reworkRate', () => {
  it('returns 0 for empty issues', () => {
    expect(reworkRate([], [])).toBe(0)
  })

  it('returns 0 when no issue has a regression', () => {
    const issues = [
      makeIssue({ id: 'i1' }),
      makeIssue({ id: 'i2' }),
      makeIssue({ id: 'i3' }),
      makeIssue({ id: 'i4' }),
      makeIssue({ id: 'i5' }),
    ]
    // History only shows forward transitions (non-DEV_DELIVERED → DEV_DELIVERED)
    const history: IssueHistoryRow[] = [
      makeHistory({ issue_id: 'i1', from_status: 'In Progress', to_status: 'Done' }),
    ]
    expect(reworkRate(issues, history)).toBe(0)
  })

  it('returns 50 when 2 of 4 issues have a regression', () => {
    const issues = [
      makeIssue({ id: 'i1' }),
      makeIssue({ id: 'i2' }),
      makeIssue({ id: 'i3' }),
      makeIssue({ id: 'i4' }),
    ]
    const history: IssueHistoryRow[] = [
      makeHistory({ issue_id: 'i1', from_status: 'Done', to_status: 'In Progress' }),
      makeHistory({ issue_id: 'i2', from_status: 'Q/A Check', to_status: 'Todo' }),
      // i3 and i4 have no regression
    ]
    expect(reworkRate(issues, history)).toBe(50)
  })

  it('counts each issue only once even with multiple regression rows', () => {
    const issues = [makeIssue({ id: 'i1' }), makeIssue({ id: 'i2' })]
    const history: IssueHistoryRow[] = [
      makeHistory({ issue_id: 'i1', from_status: 'Done', to_status: 'In Progress' }),
      makeHistory({ issue_id: 'i1', from_status: 'Deployed', to_status: 'Backlog' }),
    ]
    expect(reworkRate(issues, history)).toBe(50)
  })
})

describe('computeMonthly', () => {
  const devId = 'dev-1'
  const month = '2026-04'

  const baseIssue = makeIssue({
    id: 'i1',
    assignee_id: devId,
    status: 'Done',
    estimate: 3,
    created_at: '2026-03-30T09:00:00Z',
    started_at: '2026-04-01T09:00:00Z',
    qa_started_at: '2026-04-03T09:00:00Z',
  })

  it('counts tickets delivered in the target month', () => {
    const result = computeMonthly([baseIssue], [], devId, month)
    expect(result.ticketsCount).toBe(1)
  })

  it('sums points from estimated tickets', () => {
    const issues = [
      makeIssue({ id: 'i1', estimate: 3, qa_started_at: '2026-04-03T00:00:00Z' }),
      makeIssue({ id: 'i2', estimate: 5, qa_started_at: '2026-04-10T00:00:00Z' }),
    ]
    const result = computeMonthly(issues, [], devId, month)
    expect(result.pointsSum).toBe(8)
  })

  it('counts bugs as tickets without estimate', () => {
    const issues = [
      makeIssue({ id: 'i1', estimate: 3, qa_started_at: '2026-04-03T00:00:00Z' }),
      makeIssue({ id: 'i2', estimate: null, qa_started_at: '2026-04-10T00:00:00Z' }),
    ]
    const result = computeMonthly(issues, [], devId, month)
    expect(result.bugsCount).toBe(1)
    expect(result.ticketsCount).toBe(2)
  })

  it('excludes tickets from other months', () => {
    const otherMonth = makeIssue({
      id: 'i2',
      qa_started_at: '2026-03-20T00:00:00Z',
    })
    const result = computeMonthly([baseIssue, otherMonth], [], devId, month)
    expect(result.ticketsCount).toBe(1)
  })

  it('excludes tickets from other devs', () => {
    const otherDev = makeIssue({ id: 'i2', assignee_id: 'dev-2' })
    const result = computeMonthly([baseIssue, otherDev], [], devId, month)
    expect(result.ticketsCount).toBe(1)
  })

  it('excludes non-delivered tickets', () => {
    const inProgress = makeIssue({ id: 'i2', status: 'In Progress' })
    const result = computeMonthly([baseIssue, inProgress], [], devId, month)
    expect(result.ticketsCount).toBe(1)
  })

  it('returns zeros for empty input', () => {
    const result = computeMonthly([], [], devId, month)
    expect(result.ticketsCount).toBe(0)
    expect(result.pointsSum).toBe(0)
    expect(result.bugsCount).toBe(0)
    expect(result.medianDevCycleHours).toBe(0)
    expect(result.p90DevCycleHours).toBe(0)
    expect(result.medianLeadTimeHours).toBe(0)
    expect(result.medianQaTimeHours).toBe(0)
    expect(result.reworkRate).toBe(0)
    expect(result.ticketIds).toHaveLength(0)
  })

  it('computes median cycle time from multiple tickets', () => {
    const issues = [
      makeIssue({ id: 'i1', started_at: '2026-04-01T00:00:00Z', qa_started_at: '2026-04-03T00:00:00Z' }), // 48h
      makeIssue({ id: 'i2', started_at: '2026-04-05T00:00:00Z', qa_started_at: '2026-04-06T00:00:00Z' }), // 24h
      makeIssue({ id: 'i3', started_at: '2026-04-10T00:00:00Z', qa_started_at: '2026-04-13T00:00:00Z' }), // 72h
    ]
    const result = computeMonthly(issues, [], devId, month)
    expect(result.medianDevCycleHours).toBe(48)
  })

  it('includes ticket ids in result', () => {
    const result = computeMonthly([baseIssue], [], devId, month)
    expect(result.ticketIds).toContain('i1')
  })

  it('computes p90DevCycleHours from cycle times', () => {
    const issues = [
      makeIssue({ id: 'i1', started_at: '2026-04-01T00:00:00Z', qa_started_at: '2026-04-02T00:00:00Z' }), // 24h
      makeIssue({ id: 'i2', started_at: '2026-04-01T00:00:00Z', qa_started_at: '2026-04-03T00:00:00Z' }), // 48h
      makeIssue({ id: 'i3', started_at: '2026-04-01T00:00:00Z', qa_started_at: '2026-04-04T00:00:00Z' }), // 72h
      makeIssue({ id: 'i4', started_at: '2026-04-01T00:00:00Z', qa_started_at: '2026-04-05T00:00:00Z' }), // 96h
      makeIssue({ id: 'i5', started_at: '2026-04-01T00:00:00Z', qa_started_at: '2026-04-11T00:00:00Z' }), // 240h
    ]
    const result = computeMonthly(issues, [], devId, month)
    // P90 of [24,48,72,96,240]: rank = 0.9 * 4 = 3.6 → 96 + 0.6*(240-96) = 182.4
    expect(result.p90DevCycleHours).toBeCloseTo(182.4)
  })

  it('computes medianLeadTimeHours', () => {
    const issues = [
      makeIssue({ id: 'i1', created_at: '2026-04-01T00:00:00Z', qa_started_at: '2026-04-03T00:00:00Z' }), // 48h
      makeIssue({ id: 'i2', created_at: '2026-04-01T00:00:00Z', qa_started_at: '2026-04-04T00:00:00Z' }), // 72h
      makeIssue({ id: 'i3', created_at: '2026-04-01T00:00:00Z', qa_started_at: '2026-04-05T00:00:00Z' }), // 96h
    ]
    const result = computeMonthly(issues, [], devId, month)
    expect(result.medianLeadTimeHours).toBe(72)
  })

  it('computes medianQaTimeHours from completed_at and qa_started_at', () => {
    const issues = [
      makeIssue({ id: 'i1', qa_started_at: '2026-04-03T00:00:00Z', completed_at: '2026-04-04T00:00:00Z' }), // 24h
      makeIssue({ id: 'i2', qa_started_at: '2026-04-03T00:00:00Z', completed_at: '2026-04-05T00:00:00Z' }), // 48h
      makeIssue({ id: 'i3', qa_started_at: '2026-04-03T00:00:00Z', completed_at: '2026-04-06T00:00:00Z' }), // 72h
    ]
    const result = computeMonthly(issues, [], devId, month)
    expect(result.medianQaTimeHours).toBe(48)
  })

  it('medianQaTimeHours is 0 when completed_at is absent on all issues', () => {
    const issues = [
      makeIssue({ id: 'i1', completed_at: null }),
    ]
    const result = computeMonthly(issues, [], devId, month)
    expect(result.medianQaTimeHours).toBe(0)
  })

  it('computes reworkRate using filtered history', () => {
    const issues = [
      makeIssue({ id: 'i1', assignee_id: devId, qa_started_at: '2026-04-03T00:00:00Z' }),
      makeIssue({ id: 'i2', assignee_id: devId, qa_started_at: '2026-04-04T00:00:00Z' }),
    ]
    const history: IssueHistoryRow[] = [
      makeHistory({ issue_id: 'i1', from_status: 'Done', to_status: 'In Progress' }),
      // history for an issue outside this dev — must be ignored
      makeHistory({ issue_id: 'other-dev-issue', from_status: 'Done', to_status: 'In Progress' }),
    ]
    const result = computeMonthly(issues, history, devId, month)
    expect(result.reworkRate).toBe(50)
  })
})
