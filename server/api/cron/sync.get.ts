import { serverSupabaseServiceRole } from '#supabase/server'
import { syncWorkspace } from '../../utils/linear-sync'
import { computeAndStoreMonthlySnapshot } from '../../utils/snapshots'

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
  const auth = getHeader(event, 'authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
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

  return { synced: results.length, results }
})
