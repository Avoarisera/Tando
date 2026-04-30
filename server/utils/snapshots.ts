import type { SupabaseClient } from '@supabase/supabase-js'
import { computeMonthly, type IssueHistoryRow } from './metrics'

function monthToDate(month: string): string {
  return `${month}-01`
}

export async function computeAndStoreMonthlySnapshot(
  supabase: SupabaseClient,
  workspaceId: string,
  month: string,
  teamId?: string,
): Promise<void> {
  let issuesQuery = supabase
    .from('linear_issues')
    .select('id, assignee_id, status, estimate, started_at, qa_started_at, completed_at, updated_at, created_at')
    .eq('workspace_id', workspaceId)

  if (teamId) issuesQuery = issuesQuery.eq('team_id', teamId)

  const { data: issues, error: issuesErr } = await issuesQuery
  if (issuesErr) throw new Error(issuesErr.message)

  const assigneeIds = [...new Set((issues ?? []).map(i => i.assignee_id).filter(Boolean))] as string[]
  if (!assigneeIds.length) return

  const issueIds = (issues ?? []).map(i => i.id)
  let history: IssueHistoryRow[] = []
  if (issueIds.length > 0) {
    const { data: historyData } = await supabase
      .from('issue_history')
      .select('issue_id, from_status, to_status, changed_at')
      .eq('workspace_id', workspaceId)
    history = historyData ?? []
  }

  const rows = assigneeIds.map(userId => {
    const m = computeMonthly(issues ?? [], history, userId, month)
    return {
      workspace_id: workspaceId,
      user_id: userId,
      team_id: teamId ?? null,
      month: monthToDate(month),
      tickets_count: m.ticketsCount,
      points_sum: m.pointsSum,
      bugs_count: m.bugsCount,
      avg_size: m.avgSize,
      median_dev_cycle_hours: m.medianDevCycleHours,
      p90_dev_cycle_hours: m.p90DevCycleHours,
      median_lead_time_hours: m.medianLeadTimeHours,
      rework_rate: m.reworkRate,
      median_qa_time_hours: m.medianQaTimeHours,
      median_review_time_hours: m.medianReviewTimeHours,
      ticket_ids: m.ticketIds,
      computed_at: new Date().toISOString(),
    }
  })

  await supabase
    .from('monthly_snapshots')
    .upsert(rows, { onConflict: 'workspace_id,user_id,team_id,month' })
}

export async function getSnapshotMonths(
  supabase: SupabaseClient,
  workspaceId: string,
  months: string[],
  teamId?: string,
): Promise<Map<string, Map<string, { ticketsCount: number; pointsSum: number; bugsCount: number; avgSize: number; medianDevCycleHours: number; p90DevCycleHours: number; medianLeadTimeHours: number; medianQaTimeHours: number; medianReviewTimeHours: number; reworkRate: number; ticketIds: string[] }>>> {
  const monthDates = months.map(monthToDate)

  let query = supabase
    .from('monthly_snapshots')
    .select('user_id, month, tickets_count, points_sum, bugs_count, avg_size, median_dev_cycle_hours, p90_dev_cycle_hours, median_lead_time_hours, rework_rate, median_qa_time_hours, median_review_time_hours, ticket_ids')
    .eq('workspace_id', workspaceId)
    .in('month', monthDates)

  if (teamId) {
    query = query.eq('team_id', teamId)
  } else {
    query = query.is('team_id', null)
  }

  const { data, error } = await query
  if (error) return new Map()

  // Map: devId → month → metrics
  const result = new Map<string, Map<string, ReturnType<typeof getSnapshotMonths> extends Promise<Map<string, Map<string, infer T>>> ? T : never>>()

  for (const row of data ?? []) {
    const monthKey = (row.month as string).slice(0, 7) // '2026-04-01' → '2026-04'
    if (!result.has(row.user_id)) result.set(row.user_id, new Map())
    result.get(row.user_id)!.set(monthKey, {
      ticketsCount: row.tickets_count ?? 0,
      pointsSum: row.points_sum ?? 0,
      bugsCount: row.bugs_count ?? 0,
      avgSize: row.avg_size ?? 0,
      medianDevCycleHours: row.median_dev_cycle_hours ?? 0,
      p90DevCycleHours: (row as Record<string, unknown>).p90_dev_cycle_hours as number ?? 0,
      medianLeadTimeHours: (row as Record<string, unknown>).median_lead_time_hours as number ?? 0,
      reworkRate: (row as Record<string, unknown>).rework_rate as number ?? 0,
      medianQaTimeHours: (row as Record<string, unknown>).median_qa_time_hours as number ?? 0,
      medianReviewTimeHours: (row as Record<string, unknown>).median_review_time_hours as number ?? 0,
      ticketIds: (row.ticket_ids as string[]) ?? [],
    })
  }

  return result
}
