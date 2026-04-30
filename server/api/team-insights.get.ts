import { serverSupabaseClient } from '#supabase/server'

// UX Validation excluded — UX team isn't part of dev velocity tracking
const ACTIVE_QA_STATES = ['In Review', 'Code Review', 'Review', 'Q/A Check', 'QA', 'Pending', 'PO Check']
const IN_PROGRESS_STATES = ['In Progress', 'In Development', 'Development']
const STUCK_THRESHOLD_DAYS = 5
// 2 story points = 1 expected day → 1 point = 0.5 day
const DAYS_PER_POINT = 0.5
const DEFAULT_ESTIMATE = 2
// Tickets with these labels are excluded from blocked/long-running views (not dev work)
const EXCLUDED_LABELS = ['ux', 'design']

function computeSelectionMonths(year: number, range: number): string[] {
  const months: string[] = []
  const currentYear = new Date().getFullYear()
  if (year === currentYear) {
    const now = new Date()
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months
  }
  for (let m = 12 - range; m < 12; m++) {
    months.push(`${year}-${String(m + 1).padStart(2, '0')}`)
  }
  return months
}

export interface ProblematicTicket {
  id: string
  identifier: string | null
  title: string | null
  assignee_id: string | null
  assignee_name: string | null
  status: string | null
  estimate: number | null
  expected_days: number
  stuck_days: number
}

export interface BlockedTicket {
  id: string
  identifier: string | null
  title: string | null
  assignee_id: string | null
  assignee_name: string | null
  status: string | null
  stuck_since: string | null
  stuck_days: number
}

export default defineEventHandler(async (event) => {
  const { workspaceId, teamId, year, range } = getQuery(event)
  if (!workspaceId || !teamId || !year || !range) {
    throw createError({ statusCode: 400, statusMessage: 'workspaceId, teamId, year et range requis' })
  }

  const supabase = await serverSupabaseClient(event)
  const months = new Set(computeSelectionMonths(Number(year), Number(range)))

  // Fetch all issues for the team — one query
  const { data: issues, error } = await supabase
    .from('linear_issues')
    .select('id, identifier, title, assignee_id, status, estimate, started_at, qa_started_at, completed_at, updated_at, labels')
    .eq('workspace_id', workspaceId as string)
    .eq('team_id', teamId as string)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!issues?.length) return { problematic: [], blocked: [] }

  function hasExcludedLabel(labels: unknown): boolean {
    if (!Array.isArray(labels)) return false
    return labels.some(l => typeof l === 'string' && EXCLUDED_LABELS.includes(l.toLowerCase()))
  }

  // Profiles for display name
  const assigneeIds = [...new Set(issues.map(i => i.assignee_id).filter(Boolean))] as string[]
  const nameMap = new Map<string, string | null>()
  if (assigneeIds.length) {
    const { data: users } = await supabase
      .from('linear_users')
      .select('id, display_name, email')
      .in('id', assigneeIds)
    for (const u of users ?? []) {
      nameMap.set(u.id, u.display_name ?? u.email ?? null)
    }
  }

  const now = Date.now()

  function inSelectedPeriod(ts: string | null | undefined): boolean {
    if (!ts) return false
    const d = new Date(ts)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return months.has(key)
  }

  // Tickets à analyser : currently In Progress and exceeding their estimate.
  // Expected = max(estimate, 1 pt) × 0.5 day. Null estimate → 2 pts default (1 day).
  const problematic: ProblematicTicket[] = issues
    .filter((i) => {
      if (!i.status || !IN_PROGRESS_STATES.some(s => i.status!.includes(s))) return false
      if (hasExcludedLabel(i.labels)) return false
      if (!inSelectedPeriod(i.started_at ?? i.updated_at)) return false
      return true
    })
    .map((i) => {
      const ts: string = i.started_at ?? i.updated_at ?? new Date().toISOString()
      const stuckDays = Math.floor((now - new Date(ts).getTime()) / 86_400_000)
      const points = i.estimate ?? DEFAULT_ESTIMATE
      const expectedDays = Math.max(1, points * DAYS_PER_POINT)
      return {
        id: i.id,
        identifier: i.identifier,
        title: i.title,
        assignee_id: i.assignee_id,
        assignee_name: i.assignee_id ? (nameMap.get(i.assignee_id) ?? null) : null,
        status: i.status,
        estimate: i.estimate,
        expected_days: expectedDays,
        stuck_days: stuckDays,
      }
    })
    .filter(t => t.stuck_days > t.expected_days)
    .sort((a, b) => (b.stuck_days - b.expected_days) - (a.stuck_days - a.expected_days))

  // Tickets bloqués : currently in an active QA/Review state for > N days,
  // active during the selected period, and not labeled UX/design
  const blocked: BlockedTicket[] = issues
    .filter((i) => {
      if (!i.status || !ACTIVE_QA_STATES.some(s => i.status!.includes(s))) return false
      if (hasExcludedLabel(i.labels)) return false
      if (!inSelectedPeriod(i.started_at ?? i.updated_at)) return false
      return true
    })
    .map((i) => {
      const ts: string = i.qa_started_at ?? i.updated_at ?? new Date().toISOString()
      const stuckDays = Math.floor((now - new Date(ts).getTime()) / 86_400_000)
      return {
        id: i.id,
        identifier: i.identifier,
        title: i.title,
        assignee_id: i.assignee_id,
        assignee_name: i.assignee_id ? (nameMap.get(i.assignee_id) ?? null) : null,
        status: i.status,
        stuck_since: ts ?? null,
        stuck_days: stuckDays,
      }
    })
    .filter(t => t.stuck_days >= STUCK_THRESHOLD_DAYS)
    .sort((a, b) => b.stuck_days - a.stuck_days)

  return { problematic, blocked }
})
