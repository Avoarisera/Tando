export const DEV_DELIVERED_STATES = [
  'Q/A Check',
  'Pending',
  'UX Validation',
  'PO Check',
  'Done',
  'Deployed',
]

export interface LinearIssueRow {
  id: string
  assignee_id: string | null
  status: string | null
  estimate: number | null
  started_at: string | null
  qa_started_at: string | null
  completed_at: string | null
  updated_at: string | null
  created_at?: string | null
}

export interface IssueHistoryRow {
  issue_id: string
  from_status: string | null
  to_status: string | null
  changed_at: string
}

export interface MonthlyMetrics {
  ticketsCount: number
  pointsSum: number
  bugsCount: number
  avgSize: number
  medianDevCycleHours: number
  p90DevCycleHours: number
  medianLeadTimeHours: number
  medianQaTimeHours: number
  reworkRate: number
  ticketIds: string[]
}

export function isDevDelivered(issue: LinearIssueRow): boolean {
  return DEV_DELIVERED_STATES.includes(issue.status ?? '')
}

export function devDeliveredAt(issue: LinearIssueRow): string {
  return issue.qa_started_at ?? issue.completed_at ?? issue.updated_at ?? new Date().toISOString()
}

export function devCycleHours(issue: LinearIssueRow): number | null {
  if (!issue.started_at || !issue.qa_started_at) return null
  // On reworked tickets, started_at can be refreshed after qa_started_at → negative result.
  // Treat as no data rather than showing a negative cycle time.
  const h = (+new Date(issue.qa_started_at) - +new Date(issue.started_at)) / 3_600_000
  return h > 0 ? h : null
}

export function qaTimeHours(issue: LinearIssueRow): number | null {
  if (!issue.qa_started_at || !issue.completed_at) return null
  return (+new Date(issue.completed_at) - +new Date(issue.qa_started_at)) / 3_600_000
}

export function leadTimeHours(issue: LinearIssueRow): number | null {
  if (!issue.created_at || !issue.qa_started_at) return null
  return (+new Date(issue.qa_started_at) - +new Date(issue.created_at)) / 3_600_000
}

// Linear interpolation percentile — p in [0, 100]
export function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  if (s.length === 1) return s[0] ?? 0
  const rank = (p / 100) * (s.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  const frac = rank - lo
  return (s[lo] ?? 0) * (1 - frac) + (s[hi] ?? 0) * frac
}

function median(arr: number[]): number {
  return percentile(arr, 50)
}

function monthKey(d: string): string {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}

// Workflow levels — same ordering used in transitions endpoint.
const STATE_LEVELS: string[][] = [
  ['backlog', 'todo', 'triage'],
  ['in progress', 'in development', 'development'],
  ['in review', 'code review', 'review'],
  ['q/a check', 'qa', 'testing', 'pending', 'ux validation', 'po check'],
  ['done', 'deployed', 'cancelled'],
]

function stateLevel(status: string): number {
  const s = status.toLowerCase()
  for (let i = 0; i < STATE_LEVELS.length; i++) {
    if (STATE_LEVELS[i]!.some(kw => s.includes(kw))) return i
  }
  return -1
}

// Returns % of issues that had at least one backward transition from level ≥ 2
// (In Review, Q/A, Done → earlier state). Same threshold as the transitions endpoint.
export function reworkRate(issues: LinearIssueRow[], history: IssueHistoryRow[]): number {
  if (!issues.length) return 0
  const issueIds = new Set(issues.map(i => i.id))
  const reworked = new Set<string>()

  for (const row of history) {
    if (!issueIds.has(row.issue_id) || !row.from_status || !row.to_status) continue
    const fl = stateLevel(row.from_status)
    const tl = stateLevel(row.to_status)
    if (fl >= 2 && tl >= 0 && tl < fl) {
      reworked.add(row.issue_id)
    }
  }

  return (reworked.size / issues.length) * 100
}

export function computeMonthly(
  issues: LinearIssueRow[],
  history: IssueHistoryRow[],
  devId: string,
  month: string,
): MonthlyMetrics {
  const filtered = issues.filter(
    i =>
      i.assignee_id === devId &&
      isDevDelivered(i) &&
      monthKey(devDeliveredAt(i)) === month,
  )

  const sizes = filtered.map(i => i.estimate).filter((x): x is number => x != null)
  const cycles = filtered.map(devCycleHours).filter((x): x is number => x != null)
  const leadTimes = filtered.map(leadTimeHours).filter((x): x is number => x != null)
  const qaTimes = filtered.map(qaTimeHours).filter((x): x is number => x != null)

  // Only consider history rows belonging to this dev's filtered tickets
  const filteredHistory = history.filter(row =>
    filtered.some(i => i.id === row.issue_id),
  )

  return {
    ticketsCount: filtered.length,
    pointsSum: sizes.reduce((s, x) => s + x, 0),
    bugsCount: filtered.length - sizes.length,
    avgSize: sizes.length ? sizes.reduce((s, x) => s + x, 0) / sizes.length : 0,
    medianDevCycleHours: median(cycles),
    p90DevCycleHours: percentile(cycles, 90),
    medianLeadTimeHours: median(leadTimes),
    medianQaTimeHours: median(qaTimes),
    reworkRate: reworkRate(filtered, filteredHistory),
    ticketIds: filtered.map(i => i.id),
  }
}
