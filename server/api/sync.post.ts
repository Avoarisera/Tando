import { serverSupabaseServiceRole } from '#supabase/server'
import { syncWorkspace } from '../utils/linear-sync'

// A running job older than this is treated as stale (crashed process) and may be restarted.
const STALE_MS = 15 * 60 * 1000

export default defineEventHandler(async (event) => {
  // Cron / server-to-server : x-sync-secret header — runs synchronously.
  const secret = getHeader(event, 'x-sync-secret')
  if (secret && process.env.SYNC_SECRET && secret === process.env.SYNC_SECRET) {
    const { workspaceId, fullResync } = await readBody<{ workspaceId: string; fullResync?: boolean }>(event)
    if (!workspaceId) throw createError({ statusCode: 400, statusMessage: 'workspaceId requis' })
    await syncWorkspace(event, workspaceId, fullResync ?? false)
    return { ok: true }
  }

  // UI : JWT Bearer token — kicks a background job and returns immediately.
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

  // Guard against a double-click launching two concurrent jobs on the same workspace.
  const { data: current } = await supabase
    .from('workspaces')
    .select('sync_status, sync_started_at')
    .eq('id', workspaceId)
    .single()

  const runningFresh = current?.sync_status === 'running'
    && current.sync_started_at
    && Date.now() - new Date(current.sync_started_at).getTime() < STALE_MS
  if (runningFresh) {
    return { ok: true, status: 'running', alreadyRunning: true }
  }

  // Mark running synchronously so the UI shows the bar immediately, then run detached.
  await supabase
    .from('workspaces')
    .update({
      sync_status: 'running',
      sync_error: null,
      sync_teams_total: 0,
      sync_teams_done: 0,
      sync_issues_done: 0,
      sync_started_at: new Date().toISOString(),
      sync_finished_at: null,
    })
    .eq('id', workspaceId)

  // Long-running VPS process: the promise keeps running after we respond.
  // syncWorkspace writes its own final 'done' / 'error' status, so we just swallow here.
  const job = syncWorkspace(event, workspaceId, fullResync ?? false).catch(() => {})
  // Harmless on a persistent server; keeps the job tracked if ever deployed serverless.
  const maybeWaitUntil = (event as unknown as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil
  if (typeof maybeWaitUntil === 'function') maybeWaitUntil(job)

  return { ok: true, status: 'running' }
})
