import { serverSupabaseClient } from '#supabase/server'
import { computeMonthly, DEV_DELIVERED_STATES, type IssueHistoryRow, type MonthlyMetrics } from '../utils/metrics'
import { getSnapshotMonths } from '../utils/snapshots'
import { fetchAllByIds, fetchAllRows, periodStart } from '../utils/paginate'

function lastNMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default defineEventHandler(async (event) => {
  const { workspaceId, teamId, months: monthsParam } = getQuery(event)
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'workspaceId requis' })
  }

  const months = monthsParam
    ? (monthsParam as string).split(',')
    : lastNMonths(6)

  const current = currentMonthKey()
  const closedMonths = months.filter(m => m < current)

  const supabase = await serverSupabaseClient(event)

  // Load snapshots for closed months (fast path — avoids full issues scan)
  const snapshots = await getSnapshotMonths(
    supabase,
    workspaceId as string,
    closedMonths,
    teamId as string | undefined,
  )

  // Determine which months still need live computation (current month + any missing from snapshots)
  const snapshotDevIds = new Set(snapshots.keys())
  const needsLive = months.includes(current) || months.some(m => m < current && (
    // Month is closed but we have no snapshot for any dev yet
    !Array.from(snapshots.values()).some(devMap => devMap.has(m))
  ))

  type IssueRow = { id: string; assignee_id: string | null; status: string | null; estimate: number | null; started_at: string | null; qa_started_at: string | null; completed_at: string | null; updated_at: string | null; created_at: string | null }
  let allIssues: IssueRow[] = []
  let history: IssueHistoryRow[] = []

  // Always fetch issues + history so rework_rate is always computed live.
  // Snapshots are used for performance on non-rework metrics; rework is always overridden.
  {
    // Only the selected period (a ticket's delivery date is never after its last update),
    // every page of it: the API stops at 1000 rows and a team has ~1,850 delivered tickets (TND-24)
    const since = periodStart(months)
    allIssues = await fetchAllRows<IssueRow>((from, to) => {
      let q = supabase
        .from('linear_issues')
        .select('id, assignee_id, status, estimate, started_at, qa_started_at, completed_at, updated_at, created_at')
        .eq('workspace_id', workspaceId as string)
        .in('status', DEV_DELIVERED_STATES)
      if (teamId) q = q.eq('team_id', teamId as string)
      if (since) q = q.gte('updated_at', since)
      return q.order('id').range(from, to)
    })

    if (allIssues.length > 0) {
      // History of those tickets, by id chunks, every page of each chunk (rework needs all of it)
      history = await fetchAllByIds<IssueHistoryRow>(allIssues.map(i => i.id), (chunk, from, to) => supabase
        .from('issue_history')
        .select('issue_id, from_status, to_status, changed_at')
        .in('issue_id', chunk)
        .order('id')
        .range(from, to))
    }
  }

  const assigneeIds = needsLive
    ? [...new Set(allIssues.map(i => i.assignee_id).filter(Boolean))] as string[]
    : [...snapshotDevIds]

  // Merge: snapshot-sourced devs + live-computed devs
  const allDevIds = [...new Set([...assigneeIds, ...snapshotDevIds])]

  let devsData: { id: string; display_name: string | null; email: string | null }[] = []
  if (allDevIds.length > 0) {
    const { data, error } = await supabase
      .from('linear_users')
      .select('id, display_name, email')
      .eq('workspace_id', workspaceId as string)
      .in('id', allDevIds)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    devsData = data ?? []
  }

  const metrics: Record<string, Record<string, MonthlyMetrics>> = {}

  for (const dev of devsData) {
    const devMetrics: Record<string, MonthlyMetrics> = {}

    for (const month of months) {
      if (month < current) {
        const snap = snapshots.get(dev.id)?.get(month)
        if (snap) {
          // Snapshot exists but rework_rate was computed before history was populated.
          // Always recompute rework live so it reflects actual issue_history data.
          const live = computeMonthly(allIssues, history, dev.id, month)
          devMetrics[month] = { ...snap, reworkRate: live.reworkRate, wipCount: live.wipCount, medianReviewTimeHours: live.medianReviewTimeHours }
          continue
        }
      }
      // Current month or missing snapshot → compute fully live
      devMetrics[month] = computeMonthly(allIssues, history, dev.id, month)
    }

    metrics[dev.id] = devMetrics
  }

  return { months, devs: devsData, metrics }
})
