import { loadApplicationForAction } from '../../../../utils/recruit-actions'
import { sendMail } from '../../../../utils/mailer'
import { buildEmail, PRIVACY_FOOTER } from '../../../../utils/recruit-emails'
import { companyInfo } from '../../../../utils/public-openings'

/**
 * Plan an interview (TND-30 lot 2): stage, date, duration, place or video link,
 * interviewers (any employee: they then see this candidate only), optional
 * invitation e-mail to the candidate from the « invitation » template.
 */
interface Body { stage_key?: unknown, starts_at?: unknown, duration_min?: unknown, location?: unknown, video_url?: unknown, notes?: unknown, participants?: unknown, notify_candidate?: unknown }

export default defineEventHandler(async (event) => {
  const { supabase, user, app } = await loadApplicationForAction(event)
  const b = await readBody<Body>(event)
  const stages = app.job_openings?.stages ?? []
  const stage = typeof b?.stage_key === 'string' && stages.some(s => s.key === b.stage_key) ? b.stage_key : null
  const startsAt = typeof b?.starts_at === 'string' && !Number.isNaN(Date.parse(b.starts_at)) ? new Date(b.starts_at) : null
  const duration = Number(b?.duration_min) || 45
  const location = typeof b?.location === 'string' ? b.location.trim().slice(0, 200) : ''
  const video = typeof b?.video_url === 'string' && /^https?:\/\/\S+$/i.test(b.video_url.trim()) ? b.video_url.trim().slice(0, 500) : null
  const notes = typeof b?.notes === 'string' ? b.notes.trim().slice(0, 1000) : ''
  const participants = Array.isArray(b?.participants) ? [...new Set(b.participants.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 10) : []
  if (!stage) throw createError({ statusCode: 400, statusMessage: 'Étape inconnue' })
  if (!startsAt) throw createError({ statusCode: 400, statusMessage: 'Date invalide' })
  if (duration < 10 || duration > 480) throw createError({ statusCode: 400, statusMessage: 'Durée invalide' })
  if (!participants.length) throw createError({ statusCode: 400, statusMessage: 'Ajoutez au moins un intervenant' })
  if (app.status !== 'active') throw createError({ statusCode: 409, statusMessage: 'La candidature n’est plus en cours' })

  const { data: people } = await supabase.from('profiles').select('id').in('id', participants)
  if ((people ?? []).length !== participants.length) throw createError({ statusCode: 400, statusMessage: 'Intervenant introuvable' })

  const { data: itv, error } = await supabase.from('interviews').insert({
    application_id: app.id, stage_key: stage, starts_at: startsAt.toISOString(), duration_min: duration, location, video_url: video, notes, created_by: user.id,
  }).select('id').single()
  if (error || !itv) throw createError({ statusCode: 500, statusMessage: 'Entretien non créé' })
  await supabase.from('interview_participants').insert(participants.map(p => ({ interview_id: itv.id, profile_id: p })))
  await supabase.from('application_events').insert({ application_id: app.id, actor_id: user.id, kind: 'interview', data: { stage, starts_at: startsAt.toISOString(), participants: participants.length } })
  await supabase.from('applications').update({ last_contact_at: new Date().toISOString() }).eq('id', app.id)

  // interviewers are told in the app
  const others = participants.filter(p => p !== user.id)
  if (others.length) {
    await supabase.from('notifications').insert(others.map(p => ({
      user_id: p, kind: 'interview_scheduled', actor_id: user.id,
      data: { first_name: app.candidates?.first_name ?? '', job: app.job_openings?.title ?? '', starts_at: startsAt.toISOString(), opening_id: app.opening_id, application_id: app.id },
    })))
  }

  let emailed: boolean | null = null
  if (b?.notify_candidate === true && app.candidates?.email) {
    const company = await companyInfo(supabase)
    const when = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(startsAt)
    const where = [location, video].filter(Boolean).join(' · ')
    const mail = await buildEmail(supabase, 'invitation', { prenom: app.candidates.first_name, poste: app.job_openings?.title ?? '', entreprise: company.name, date: `${when} (${duration} min)`, lieu: where })
    const sent = await sendMail({ to: app.candidates.email, subject: mail.subject, text: mail.text + PRIVACY_FOOTER })
    emailed = sent.sent
    await supabase.from('application_events').insert({ application_id: app.id, actor_id: user.id, kind: 'email', data: { template: 'invitation', sent: sent.sent, reason: sent.reason ?? null } })
  }
  return { id: itv.id, emailed }
})
