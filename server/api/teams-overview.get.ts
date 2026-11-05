import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { DEV_DELIVERED_STATES, devCycleHours, devDeliveredAt, type LinearIssueRow } from '../utils/metrics'

/**
 * TND-24 — one call for the Vélocité overview: every team of every workspace
 * the admin can read (RLS), with this month's deliveries, the previous month,
 * a 6-month sparkline, the median dev cycle over 3 months and the blocked
 * tickets (same rules as team-insights: > 5 days in Review / QA, UX/design excluded).
 * Cached 5 minutes per user; `?fresh=1` bypasses the cache.
 */

const ACTIVE_QA_STATES = ['In Review', 'Code Review', 'Review', 'Q/A Check', 'QA', 'Pending', 'PO Check']
const STUCK_THRESHOLD_DAYS = 5
const EXCLUDED_LABELS = ['ux', 'design']
const PAGE = 1000
const TTL_MS = 5 * 60 * 1000

export interface TeamOverview {
  id: string
  name: string
  workspaceId: string
  workspaceName: string
  thisMonth: number
  lastMonth: number
  /** previous month, same days (1st → today's day): a fair comparison mid-month */
  lastMonthToDate: number
  monthly: { month: string, count: number }[]
  cycleMedianHours: number | null
  blocked: number
}

type IssueRow = LinearIssueRow & { team_id: string | null, workspace_id: string, labels: unknown }

const cache = new Map<string, { at: number, data: TeamOverview[] }>()

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
function hasExcludedLabel(labels: unknown): boolean {
  if (!Array.isArray(labels)) return false
  return labels.some((l) => {
    const name = typeof l === 'string' ? l : (l as { name?: string })?.name
    return !!name && EXCLUDED_LABELS.includes(name.toLowerCase())
  })
}

export default defineEventHandler(async (event): Promise<TeamOverview[]> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Non authentifié' })
  const userId = (user as { id?: string, sub?: string }).id ?? (user as { sub?: string }).sub ?? ''
  const fresh = getQuery(event).fresh === '1'
  const hit = cache.get(userId)
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.data

  const supabase = await serverSupabaseClient(event)

  // Teams this user can see: admin → every (selected) team, manager → the Linear
  // teams linked to their team (TND-26). Never reads workspaces (API key).
  const { data: vt, error: tError } = await supabase.rpc('velocity_teams')
  if (tError) throw createError({ statusCode: 500, statusMessage: tError.message })
  const visible = (vt ?? []) as { workspace_id: string, workspace_name: string, team_id: string, team_name: string | null }[]
  if (!visible.length) return []
  const wsIds = [...new Set(visible.map(v => v.workspace_id))]

  // Issues touched in the last 6 months, read page by page (the API caps a page at 1000 rows)
  const now = new Date()
  const since = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const issues: IssueRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('linear_issues')
      .select('id, team_id, workspace_id, assignee_id, status, estimate, started_at, qa_started_at, completed_at, updated_at, created_at, labels')
      .in('workspace_id', wsIds)
      .in('team_id', [...new Set(visible.map(v => v.team_id))])
      .gte('updated_at', since.toISOString())
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    issues.push(...((data ?? []) as IssueRow[]))
    if (!data || data.length < PAGE) break
  }

  const months = Array.from({ length: 6 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)))
  const current = months.at(-1)!
  const previous = months.at(-2)!
  const cycleMonths = new Set(months.slice(-3))

  const result: TeamOverview[] = []
  {
    for (const v of visible) {
      const team = { id: v.team_id, name: v.team_name }
      const ws = { id: v.workspace_id, name: v.workspace_name }
      const mine = issues.filter(i => i.team_id === team.id && i.workspace_id === ws.id)
      const delivered = mine.filter(i => DEV_DELIVERED_STATES.includes(i.status ?? ''))
      const perMonth = new Map<string, number>(months.map(m => [m, 0]))
      const cycles: number[] = []
      let lastToDate = 0
      for (const i of delivered) {
        const at = devDeliveredAt(i)
        const m = at.slice(0, 7)
        if (m === previous && Number(at.slice(8, 10)) <= now.getDate()) lastToDate++
        if (perMonth.has(m)) perMonth.set(m, perMonth.get(m)! + 1)
        if (cycleMonths.has(m)) {
          const h = devCycleHours(i)
          if (h !== null) cycles.push(h)
        }
      }
      const blocked = mine.filter((i) => {
        if (!i.status || !ACTIVE_QA_STATES.some(s => i.status!.includes(s))) return false
        if (hasExcludedLabel(i.labels)) return false
        const ts = i.qa_started_at ?? i.updated_at
        return !!ts && (now.getTime() - new Date(ts).getTime()) / 86_400_000 > STUCK_THRESHOLD_DAYS
      }).length
      result.push({
        id: team.id,
        name: team.name ?? team.id,
        workspaceId: ws.id,
        workspaceName: ws.name,
        thisMonth: perMonth.get(current) ?? 0,
        lastMonth: perMonth.get(previous) ?? 0,
        lastMonthToDate: lastToDate,
        monthly: months.map(m => ({ month: m, count: perMonth.get(m) ?? 0 })),
        cycleMedianHours: median(cycles),
        blocked,
      })
    }
  }

  cache.set(userId, { at: Date.now(), data: result })
  return result
})
