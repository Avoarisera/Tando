import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Non authentifié' })
  }

  const supabase = serverSupabaseServiceRole(event)

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Session invalide' })
  }

  const { name, apiKey } = await readBody<{ name: string; apiKey: string }>(event)
  if (!name || !apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'name et apiKey requis' })
  }

  const { data, error } = await supabase
    .from('workspaces')
    .insert({ name, linear_api_key: apiKey, user_id: user.id })
    .select('id, name, last_synced_at, created_at')
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return data
})
