import { requireAdmin } from '../utils/require-admin'

interface TeamRef { id: string; name: string }

export default defineEventHandler(async (event) => {
  // Workspaces are shared by all admins (decision 2026-11-05, TND-17)
  const { supabase } = await requireAdmin(event)

  const { workspaceId, teams } = await readBody<{ workspaceId: string; teams: TeamRef[] }>(event)
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'workspaceId requis' })

  const { data: updated, error } = await supabase
    .from('workspaces')
    .update({ selected_teams: teams })
    .eq('id', workspaceId)
    .select('id')

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!updated?.length) throw createError({ statusCode: 404, statusMessage: 'Workspace introuvable' })

  return { ok: true }
})
