import { loadApplicationForAction } from '../../../../utils/recruit-actions'

/** Reopen a declined application (TND-30) */
export default defineEventHandler(async (event) => {
  const { supabase, user, app } = await loadApplicationForAction(event)
  if (app.status !== 'rejected') return { ok: true }
  const { error } = await supabase.from('applications').update({ status: 'active', rejection_reason: null }).eq('id', app.id)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  await supabase.from('application_events').insert({ application_id: app.id, actor_id: user.id, kind: 'restored', data: {} })
  return { ok: true }
})
