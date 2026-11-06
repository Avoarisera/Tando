import { loadApplicationForAction } from '../../../../utils/recruit-actions'
import { invitePerson } from '../../../../utils/invite-person'

/**
 * Hire (TND-30 lot 2): creates the employee account from the application
 * (invitation e-mail, profile, balances) and marks the application « hired ».
 * Recruiters only (not the hiring manager).
 */
export default defineEventHandler(async (event) => {
  const { supabase, user, recruiter, app } = await loadApplicationForAction(event)
  if (!recruiter) throw createError({ statusCode: 403, statusMessage: 'Seul le RH peut embaucher' })
  if (app.status === 'rejected' || app.status === 'withdrawn') throw createError({ statusCode: 409, statusMessage: 'La candidature n’est plus en cours' })
  const b = await readBody<{ team_id?: unknown, role?: unknown, joined_at?: unknown, country?: unknown }>(event)
  const role = b?.role === 'manager' ? 'manager' : 'employee'
  const teamId = typeof b?.team_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.team_id) ? b.team_id : null
  const joinedAt = typeof b?.joined_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.joined_at) ? b.joined_at : null
  const country = typeof b?.country === 'string' && /^[A-Z]{2}$/.test(b.country) ? b.country : 'FR'
  const { data: cand } = await supabase.from('applications').select('candidates (first_name, last_name, email)').eq('id', app.id).single()
  const c = (cand as { candidates: { first_name: string, last_name: string, email: string } | null } | null)?.candidates
  if (!c) throw createError({ statusCode: 404, statusMessage: 'Candidat introuvable' })

  const userId = await invitePerson(supabase, getRequestURL(event).origin, {
    email: c.email, firstName: c.first_name, lastName: c.last_name, role, teamId, country, joinedAt,
  })
  await supabase.from('applications').update({ status: 'hired', stage: 'hired', last_contact_at: new Date().toISOString() }).eq('id', app.id)
  await supabase.from('application_events').insert({ application_id: app.id, actor_id: user.id, kind: 'hired', data: { profile_id: userId, joined_at: joinedAt } })
  return { id: userId }
})
