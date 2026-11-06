import { loadApplicationForAction } from '../../../../utils/recruit-actions'

/** Move an application to another stage of its opening (TND-30). A hiring manager cannot mark « hired ». */
export default defineEventHandler(async (event) => {
  const { supabase, user, recruiter, app } = await loadApplicationForAction(event)
  const { stage } = await readBody<{ stage?: unknown }>(event)
  const stages = app.job_openings?.stages ?? []
  if (typeof stage !== 'string' || !stages.some(s => s.key === stage)) throw createError({ statusCode: 400, statusMessage: 'Étape inconnue' })
  if (app.status !== 'active' && app.status !== 'hired') throw createError({ statusCode: 409, statusMessage: 'Rouvrez la candidature avant de la déplacer' })
  if (stage === 'hired' && !recruiter) throw createError({ statusCode: 403, statusMessage: 'Seul le RH peut marquer une embauche' })
  if (stage === app.stage) return { ok: true }
  const status = stage === 'hired' ? 'hired' : 'active'
  const { error } = await supabase.from('applications').update({ stage, status, last_contact_at: new Date().toISOString() }).eq('id', app.id)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  await supabase.from('application_events').insert({ application_id: app.id, actor_id: user.id, kind: 'stage', data: { from: app.stage, to: stage } })
  return { ok: true }
})
