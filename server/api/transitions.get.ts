import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const { workspaceId, teamId, assigneeId, months: monthsParam } = getQuery(event)
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'workspaceId requis' })

  const supabase = await serverSupabaseClient(event)

  let query = supabase
    .from('issue_history')
    .select('from_status, to_status, issue_id, changed_at, linear_issues!inner(id, identifier, title, team_id, assignee_id)')
    .eq('workspace_id', workspaceId as string)

  if (teamId) query = query.eq('linear_issues.team_id', teamId as string)
  if (assigneeId) query = query.eq('linear_issues.assignee_id', assigneeId as string)

  // Filter by period when months are provided (e.g. "2026-01,2026-02,2026-03")
  if (monthsParam) {
    const monthsList = (monthsParam as string).split(',').sort()
    const from = monthsList[0] + '-01'
    const lastMonth = monthsList[monthsList.length - 1]!
    const [ly, lm] = lastMonth.split('-').map(Number)
    const nextMonth = new Date(ly!, lm!, 1)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    const to = nextMonth.toISOString().slice(0, 10)
    query = query.gte('changed_at', from).lt('changed_at', to)
  }

  const { data, error } = await query
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  interface TicketRef { id: string; identifier: string | null; title: string | null; assignee_id?: string | null }

  // Workflow order — higher index = further along in the process
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

  // Rework = backward transition FROM In Review / QA / Done only (level ≥ 2).
  // In Progress → Todo (fl=1) is noise — only late-stage returns indicate real rework.
  function isRework(from: string, to: string): boolean {
    const fl = stateLevel(from)
    const tl = stateLevel(to)
    return fl >= 2 && tl >= 0 && tl < fl
  }

  const countMap = new Map<string, number>()
  const ticketMap = new Map<string, Map<string, TicketRef>>()
  const allReworkedIds = new Set<string>()
  const allActiveIds = new Set<string>()
  // per-dev: devId → Set of ticket IDs (reworked / total active)
  const perDevReworkedIds = new Map<string, Set<string>>()
  const perDevActiveIds = new Map<string, Set<string>>()

  for (const row of data ?? []) {
    if (!row.from_status || !row.to_status) continue
    const issue = row.linear_issues as unknown as TicketRef

    // Count every ticket seen as "active" — denominator
    allActiveIds.add(issue.id)
    if (issue.assignee_id) {
      if (!perDevActiveIds.has(issue.assignee_id)) perDevActiveIds.set(issue.assignee_id, new Set())
      perDevActiveIds.get(issue.assignee_id)!.add(issue.id)
    }

    if (!isRework(row.from_status, row.to_status)) continue
    const from = row.from_status.toLowerCase()
    const to = row.to_status.toLowerCase()
    const key = `${from}|||${to}`
    countMap.set(key, (countMap.get(key) ?? 0) + 1)

    allReworkedIds.add(issue.id)
    if (!ticketMap.has(key)) ticketMap.set(key, new Map())
    ticketMap.get(key)!.set(issue.id, issue)

    if (issue.assignee_id) {
      if (!perDevReworkedIds.has(issue.assignee_id)) perDevReworkedIds.set(issue.assignee_id, new Set())
      perDevReworkedIds.get(issue.assignee_id)!.add(issue.id)
    }
  }

  const transitions = Array.from(countMap.entries())
    .map(([key, count]) => {
      const [from_status, to_status] = key.split('|||')
      const tickets = Array.from(ticketMap.get(key)?.values() ?? [])
      return { from_status: from_status!, to_status: to_status!, count, tickets }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  // perDevRework & perDevTotal: devId → count — same source, consistent denominator
  const perDevRework: Record<string, number> = {}
  const perDevTotal: Record<string, number> = {}
  for (const [devId, ids] of perDevReworkedIds) perDevRework[devId] = ids.size
  for (const [devId, ids] of perDevActiveIds) perDevTotal[devId] = ids.size

  // Global rework rate for the period: reworked / active tickets
  const totalActiveTickets = allActiveIds.size
  const reworkedTicketsCount = allReworkedIds.size

  return { transitions, reworkedTicketsCount, totalActiveTickets, perDevRework, perDevTotal }
})
