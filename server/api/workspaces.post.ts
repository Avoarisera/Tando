import { requireAdmin } from '../utils/require-admin'

export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireAdmin(event)

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
