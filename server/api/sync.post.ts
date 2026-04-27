import { serverSupabaseServiceRole } from '#supabase/server'
import { syncWorkspace } from '../utils/linear-sync'

export default defineEventHandler(async (event) => {
  // Cron : x-sync-secret header
  const secret = getHeader(event, 'x-sync-secret')
  if (secret && process.env.SYNC_SECRET && secret === process.env.SYNC_SECRET) {
    const { workspaceId, fullResync } = await readBody<{ workspaceId: string; fullResync?: boolean }>(event)
    if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'workspaceId requis' })
    await syncWorkspace(event, workspaceId, fullResync ?? false)
    return { ok: true }
  }

  // UI : JWT Bearer token
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Non autorisé' })
  }

  const supabase = serverSupabaseServiceRole(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Session invalide' })
  }

  const { workspaceId, fullResync } = await readBody<{ workspaceId: string; fullResync?: boolean }>(event)
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'workspaceId requis' })
  }

  await syncWorkspace(event, workspaceId, fullResync ?? false)

  return { ok: true }
})
