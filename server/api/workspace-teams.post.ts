import { serverSupabaseServiceRole } from '#supabase/server'

interface TeamRef { id: string; name: string }

export default defineEventHandler(async (event) => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Non authentifié' })

  const supabase = serverSupabaseServiceRole(event)

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user?.id) throw createError({ statusCode: 401, statusMessage: 'Session invalide' })

  const { workspaceId, teams } = await readBody<{ workspaceId: string; teams: TeamRef[] }>(event)
  if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'workspaceId requis' })

  const { error } = await supabase
    .from('workspaces')
    .update({ selected_teams: teams })
    .eq('id', workspaceId)
    .eq('user_id', user.id)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { ok: true }
})
