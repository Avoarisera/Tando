import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const { issueId, workspaceId } = getQuery(event)
  if (!issueId || !workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'issueId et workspaceId requis' })
  }

  const supabase = await serverSupabaseClient(event)

  const [issueResult, historyResult] = await Promise.all([
    supabase
      .from('linear_issues')
      .select('id, identifier, title, assignee_id, status, estimate, started_at, qa_started_at, completed_at, updated_at, raw')
      .eq('id', issueId as string)
      .eq('workspace_id', workspaceId as string)
      .single(),
    supabase
      .from('issue_history')
      .select('id, from_status, to_status, changed_at, actor_id')
      .eq('issue_id', issueId as string)
      .eq('workspace_id', workspaceId as string)
      .order('changed_at', { ascending: true }),
  ])

  if (issueResult.error) throw createError({ statusCode: 404, statusMessage: 'Ticket introuvable' })
  if (historyResult.error) throw createError({ statusCode: 500, statusMessage: historyResult.error.message })

  return {
    issue: issueResult.data,
    history: historyResult.data ?? [],
  }
})
