import { serverSupabaseServiceRole } from '#supabase/server'
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '~/types/database'
import { getLinearClient } from './linear-client'
import { ISSUES_WITH_HISTORY, TEAMS_QUERY } from './linear-queries'
import { DEV_DELIVERED_STATES } from './metrics'

type Db = Database
type UserInsert = Database['public']['Tables']['linear_users']['Insert']
type IssueInsert = Database['public']['Tables']['linear_issues']['Insert']
type HistInsert = Database['public']['Tables']['issue_history']['Insert']
type WorkspaceUpdate = Database['public']['Tables']['workspaces']['Update']

interface HistoryNode {
  id: string
  createdAt: string
  fromState: { name: string } | null
  toState: { name: string } | null
  actor: { id: string } | null
}

interface IssueNode {
  id: string
  identifier: string
  title: string
  state: { name: string; type: string }
  assignee: { id: string; email: string; displayName: string; active: boolean } | null
  estimate: number | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
  labels: { nodes: { name: string }[] }
  history: { nodes: HistoryNode[] }
}

// Supabase rejects a bulk upsert whose batch contains the same PK twice
// ("cannot affect row a second time"), so keep chunks well under Postgres limits.
const CHUNK = 500

function chunk<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

function extractQaStartedAt(historyNodes: HistoryNode[]): string | null {
  const sorted = [...historyNodes].sort(
    (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  )
  const transition = sorted.find(h => DEV_DELIVERED_STATES.includes(h.toState?.name ?? ''))
  return transition?.createdAt ?? null
}

async function patchStatus(supabase: SupabaseClient<Db>, workspaceId: string, fields: WorkspaceUpdate): Promise<void> {
  await supabase.from('workspaces').update(fields).eq('id', workspaceId)
}

export async function syncWorkspace(event: H3Event, workspaceId: string, fullResync = false): Promise<void> {
  const supabase = serverSupabaseServiceRole(event)

  await patchStatus(supabase, workspaceId, {
    sync_status: 'running',
    sync_error: null,
    sync_teams_total: 0,
    sync_teams_done: 0,
    sync_issues_done: 0,
    sync_started_at: new Date().toISOString(),
    sync_finished_at: null,
  })

  try {
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('linear_api_key, last_synced_at, selected_teams')
      .eq('id', workspaceId)
      .single()

    if (wsError || !workspace) throw new Error('Workspace introuvable')

    const selectedIds = Array.isArray(workspace.selected_teams)
      ? (workspace.selected_teams as { id: string }[]).map(t => t.id)
      : null

    const linear = getLinearClient(workspace.linear_api_key)
    const since = (!fullResync && workspace.last_synced_at)
      ? new Date(workspace.last_synced_at)
      : new Date('2024-01-01T00:00:00.000Z')

    const teamsRes = await linear.client.rawRequest<
      { teams: { nodes: { id: string; name: string }[] } },
      Record<string, never>
    >(TEAMS_QUERY, {})
    const allTeams = teamsRes.data?.teams?.nodes ?? []
    // Filter to selected teams only — null means sync all (backward-compatible)
    const teams = selectedIds ? allTeams.filter(t => selectedIds.includes(t.id)) : allTeams

    await patchStatus(supabase, workspaceId, { sync_teams_total: teams.length })

    let issuesDone = 0

    for (let t = 0; t < teams.length; t++) {
      const team = teams[t]!
      await supabase.from('linear_teams').upsert(
        { id: team.id, workspace_id: workspaceId, name: team.name },
        { onConflict: 'id' },
      )

      let cursor: string | null = null

      type IssuesResponse = { team: { issues: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: IssueNode[] } } }

      do {
        const res: Awaited<ReturnType<typeof linear.client.rawRequest<IssuesResponse, { teamId: string; after: string; cursor: string | null }>>> = await linear.client.rawRequest<
          IssuesResponse,
          { teamId: string; after: string; cursor: string | null }
        >(ISSUES_WITH_HISTORY, {
          teamId: team.id,
          after: since.toISOString(),
          cursor,
        })

        const page: IssuesResponse['team']['issues'] | undefined = res.data?.team?.issues
        if (!page) break

        // ── Build batched rows for this page ──────────────────────────────
        const usersById = new Map<string, UserInsert>()
        const issueRows: IssueInsert[] = []
        const issueIds: string[] = []
        const histRows: HistInsert[] = []
        const nowIso = new Date().toISOString()

        for (const issue of page.nodes) {
          if (issue.assignee) {
            // dedup: same assignee across issues would double-hit the PK in one batch
            usersById.set(issue.assignee.id, {
              id: issue.assignee.id,
              workspace_id: workspaceId,
              email: issue.assignee.email,
              display_name: issue.assignee.displayName,
              is_active: issue.assignee.active,
              raw: issue.assignee as unknown as Json,
              synced_at: nowIso,
            })
          }

          issueIds.push(issue.id)
          issueRows.push({
            id: issue.id,
            workspace_id: workspaceId,
            identifier: issue.identifier,
            title: issue.title,
            team_id: team.id,
            assignee_id: issue.assignee?.id ?? null,
            status: issue.state.name,
            status_type: issue.state.type,
            estimate: issue.estimate,
            created_at: issue.createdAt,
            started_at: issue.startedAt,
            completed_at: issue.completedAt,
            updated_at: issue.updatedAt,
            qa_started_at: extractQaStartedAt(issue.history.nodes),
            labels: (issue.labels?.nodes?.map(l => l.name) ?? []) as Json,
            raw: issue as unknown as Json,
          })

          for (const h of issue.history.nodes) {
            if (!h.fromState || !h.toState) continue
            histRows.push({
              issue_id: issue.id,
              workspace_id: workspaceId,
              from_status: h.fromState.name,
              to_status: h.toState.name,
              changed_at: h.createdAt,
              actor_id: h.actor?.id ?? null,
            })
          }
        }

        // ── Flush in bulk (a handful of round-trips per page, not per issue) ─
        const users = [...usersById.values()]
        for (const c of chunk(users)) {
          const { error } = await supabase.from('linear_users').upsert(c, { onConflict: 'id' })
          if (error) throw new Error(`users upsert failed: ${error.message}`)
        }

        for (const c of chunk(issueRows)) {
          const { error } = await supabase.from('linear_issues').upsert(c, { onConflict: 'id' })
          if (error) throw new Error(`issues upsert failed: ${error.message}`)
        }

        if (issueIds.length) {
          // Replace history for the issues in this page in one delete + bulk insert
          const { error: delErr } = await supabase.from('issue_history').delete().in('issue_id', issueIds)
          if (delErr) throw new Error(`history delete failed: ${delErr.message}`)
        }
        for (const c of chunk(histRows)) {
          const { error } = await supabase.from('issue_history').insert(c)
          if (error) throw new Error(`history insert failed: ${error.message}`)
        }

        issuesDone += page.nodes.length
        await patchStatus(supabase, workspaceId, { sync_issues_done: issuesDone })

        cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
      } while (cursor)

      await patchStatus(supabase, workspaceId, { sync_teams_done: t + 1 })
    }

    await patchStatus(supabase, workspaceId, {
      last_synced_at: new Date().toISOString(),
      sync_status: 'done',
      sync_finished_at: new Date().toISOString(),
    })
  }
  catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await patchStatus(supabase, workspaceId, {
      sync_status: 'error',
      sync_error: message,
      sync_finished_at: new Date().toISOString(),
    })
    throw e
  }
}
