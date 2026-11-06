import { loadTracked } from '../../../../utils/candidate-track'

/** The candidate withdraws the application (kept until purge, marked « withdrawn ») */
export default defineEventHandler(async (event) => {
  const { supabase, app } = await loadTracked(event)
  if (app.status === 'withdrawn') return { ok: true }
  if (app.status === 'hired') throw createError({ statusCode: 409, statusMessage: 'Cette candidature est déjà finalisée' })
  await supabase.from('applications').update({ status: 'withdrawn', last_contact_at: new Date().toISOString() }).eq('id', app.id)
  await supabase.from('application_events').insert({ application_id: app.id, kind: 'withdrawn', data: { by: 'candidate' } })
  return { ok: true }
})
