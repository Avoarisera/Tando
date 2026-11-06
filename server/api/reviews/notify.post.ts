import { serverSupabaseServiceRole } from '#supabase/server'
import { mailPendingReviewNotifications } from '../../utils/review-mails'
import { siteUrl } from '../../utils/site-url'

/**
 * TND-32 — mail the pending review notifications right after an action
 * (launch, peer proposal / approval, share). Any signed-in user may trigger it:
 * it only sends what the database already decided, once.
 */
export default defineEventHandler(async (event) => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Non authentifié' })
  const supabase = serverSupabaseServiceRole(event)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user?.id) throw createError({ statusCode: 401, statusMessage: 'Session invalide' })
  return await mailPendingReviewNotifications(supabase, siteUrl(event))
})
