import { serverSupabaseClient } from '#supabase/server'

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

function isRework(from: string, to: string): boolean {
  const fl = stateLevel(from)
  const tl = stateLevel(to)
  return fl >= 2 && tl >= 0 && tl < fl
}

export default defineEventHandler(async (event) => {
  const { workspaceId, teamId, assigneeId, month, months: monthsParam } = getQuery(event)
  if (!workspaceId || (!month && !monthsParam)) {
    throw createError({ statusCode: 400, statusMessage: 'workspaceId et month(s) requis' })
  }

  // Accept either a single month or a comma-separated list
  const targetMonths = new Set<string>(
    monthsParam
      ? (monthsParam as string).split(',')
      : [(month as string)],
  )

  const supabase = await serverSupabaseClient(event)

  let query = supabase
    .from('linear_issues')
    .select('id, identifier, title, assignee_id, status, estimate, started_at, qa_started_at, completed_at, updated_at')
    .eq('workspace_id', workspaceId as string)

  if (teamId) query = query.eq('team_id', teamId as string)
  if (assigneeId) query = query.eq('assignee_id', assigneeId as string)

  const { data: issues, error } = await query
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const { isDevDelivered, devDeliveredAt } = await import('../utils/metrics')

  const filtered = (issues ?? []).filter((i) => {
    if (!isDevDelivered(i)) return false
    const d = new Date(devDeliveredAt(i))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return targetMonths.has(key)
  })

  if (!filtered.length) return []

  const issueIds = filtered.map(i => i.id)
  const { data: historyRows } = await supabase
    .from('issue_history')
    .select('issue_id, from_status, to_status')
    .in('issue_id', issueIds)
    .limit(10000)

  const reworkedIds = new Set<string>()
  for (const row of historyRows ?? []) {
    if (row.from_status && row.to_status && isRework(row.from_status, row.to_status)) {
      reworkedIds.add(row.issue_id)
    }
  }

  return filtered.map(i => ({ ...i, hasRework: reworkedIds.has(i.id) }))
})
