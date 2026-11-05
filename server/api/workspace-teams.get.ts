import { requireAdmin } from '../utils/require-admin'
import { getLinearClient } from '../utils/linear-client'
import { TEAMS_QUERY } from '../utils/linear-queries'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)

  const { workspaceId } = getQuery(event)
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'workspaceId requis' })

  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('linear_api_key')
    .eq('id', workspaceId as string)
    .single()

  if (wsError || !workspace) throw createError({ statusCode: 404, statusMessage: 'Workspace introuvable' })

  const linear = getLinearClient(workspace.linear_api_key)
  const res = await linear.client.rawRequest<
    { teams: { nodes: { id: string; name: string }[] } },
    Record<string, never>
  >(TEAMS_QUERY, {})

  return (res.data?.teams?.nodes ?? []) as { id: string; name: string }[]
})
