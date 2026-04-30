import { serverSupabaseServiceRole } from '#supabase/server'
import type { H3Event } from 'h3'
import type { Json } from '~/types/database'
import { getLinearClient } from './linear-client'
import { ISSUES_WITH_HISTORY, TEAMS_QUERY } from './linear-queries'
import { DEV_DELIVERED_STATES } from './metrics'

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

function extractQaStartedAt(historyNodes: HistoryNode[]): string | null {
  const sorted = [...historyNodes].sort(
    (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  )
  const transition = sorted.find(h => DEV_DELIVERED_STATES.includes(h.toState?.name ?? ''))
  return transition?.createdAt ?? null
}

export async function syncWorkspace(event: H3Event, workspaceId: string, fullResync = false): Promise<void> {
  const supabase = serverSupabaseServiceRole(event)

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

  for (const team of teams) {
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

      for (const issue of page.nodes) {
        if (issue.assignee) {
          await supabase.from('linear_users').upsert(
            {
              id: issue.assignee.id,
              workspace_id: workspaceId,
              email: issue.assignee.email,
              display_name: issue.assignee.displayName,
              is_active: issue.assignee.active,
              raw: issue.assignee as unknown as Json,
              synced_at: new Date().toISOString(),
            },
            { onConflict: 'id' },
          )
        }

        await supabase.from('linear_issues').upsert(
          {
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
          },
          { onConflict: 'id' },
        )

        const histRows = issue.history.nodes
          .filter((h: HistoryNode) => h.fromState && h.toState)
          .map((h: HistoryNode) => ({
            issue_id: issue.id,
            workspace_id: workspaceId,
            from_status: h.fromState!.name,
            to_status: h.toState!.name,
            changed_at: h.createdAt,
            actor_id: h.actor?.id ?? null,
          }))

        if (histRows.length) {
          await supabase.from('issue_history').delete().eq('issue_id', issue.id)
          const { error: histError } = await supabase.from('issue_history').insert(histRows)
          if (histError) throw new Error(`history insert failed: ${histError.message}`)
        }
      }

      cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
    } while (cursor)
  }

  await supabase
    .from('workspaces')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', workspaceId)
}
