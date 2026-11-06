import { requireRecruiter } from '../../../../utils/require-recruiter'
import { siteUrl } from '../../../../utils/site-url'
import { remindLate } from '../../../../utils/review-reminders'

/**
 * HR reminder (TND-29 lot 2): everyone still late in an active campaign gets an
 * in-app notification and an e-mail. The cron sends the same automatically at
 * D-3 and D+1 of each due date (TND-35).
 */
export default defineEventHandler(async (event) => {
  const { supabase, user, recruiter } = await requireRecruiter(event)
  if (!recruiter) throw createError({ statusCode: 403, statusMessage: 'Réservé au RH' })
  const id = getRouterParam(event, 'id') ?? ''
  const { data: cycle } = await supabase.from('review_cycles').select('id, name, status, peers_enabled, self_due, manager_due, peer_due').eq('id', id).maybeSingle()
  if (!cycle || cycle.status !== 'active') throw createError({ statusCode: 400, statusMessage: 'Campagne non active' })
  return await remindLate(supabase, cycle, siteUrl(event), user.id)
})
