import { serverSupabaseServiceRole } from '#supabase/server'
import { syncWorkspace } from '../../utils/linear-sync'
import { computeAndStoreMonthlySnapshot } from '../../utils/snapshots'
import { runCandidatePurge } from '../../utils/candidate-purge'
import { mailPendingReviewNotifications } from '../../utils/review-mails'
import { siteUrl } from '../../utils/site-url'

function lastNClosedMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  // Closed months = all months before current
  for (let i = n; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export default defineEventHandler(async (event) => {
  // Vercel Cron injects Authorization: Bearer <CRON_SECRET>
  // Fail closed: without a configured secret the endpoint is disabled, otherwise
  // anyone could trigger a service-role sync of every workspace (TND-18).
  const auth = getHeader(event, 'authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    throw createError({ statusCode: 503, statusMessage: 'CRON_SECRET non configuré' })
  }
  if (auth !== `Bearer ${cronSecret}`) {
    throw createError({ statusCode: 401, statusMessage: 'Non autorisé' })
  }

  const supabase = serverSupabaseServiceRole(event)

  const { data: workspaces, error } = await supabase
    .from('workspaces')
    .select('id')

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const closedMonths = lastNClosedMonths(6)
  const results: { workspaceId: string; ok: boolean; error?: string }[] = []

  for (const ws of workspaces ?? []) {
    try {
      await syncWorkspace(event, ws.id)

      // Compute snapshots for closed months after each sync
      for (const month of closedMonths) {
        await computeAndStoreMonthlySnapshot(supabase, ws.id, month)
      }

      results.push({ workspaceId: ws.id, ok: true })
    } catch (e) {
      results.push({ workspaceId: ws.id, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // GDPR purge of expired applications, once a day (TND-30 lot 3); never blocks the sync
  const purge = await runCandidatePurge(supabase).catch(e => ({ error: e instanceof Error ? e.message : String(e) }))

  // review e-mails missed right after an action (TND-32); never blocks the sync
  const reviewMails = await mailPendingReviewNotifications(supabase, siteUrl(event)).catch(e => ({ error: e instanceof Error ? e.message : String(e) }))

  return { synced: results.length, results, purge, reviewMails }
})
