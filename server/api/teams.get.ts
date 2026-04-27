import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const { workspaceId } = getQuery(event)
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'workspaceId requis' })
  }

  const supabase = await serverSupabaseClient(event)

  // Fetch workspace to check selected_teams filter
  const { data: ws } = await supabase
    .from('workspaces')
    .select('selected_teams')
    .eq('id', workspaceId as string)
    .single()

  const selectedIds = Array.isArray(ws?.selected_teams)
    ? (ws.selected_teams as { id: string }[]).map(t => t.id)
    : null

  let query = supabase
    .from('linear_teams')
    .select('id, name')
    .eq('workspace_id', workspaceId as string)
    .order('name')

  if (selectedIds) query = query.in('id', selectedIds)

  const { data, error } = await query
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data ?? []
})
