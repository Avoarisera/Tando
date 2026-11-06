import { loadApplicationForAction } from '../../../../utils/recruit-actions'
import { sendMail } from '../../../../utils/mailer'
import { rejectionEmail } from '../../../../utils/recruit-emails'
import { companyInfo } from '../../../../utils/public-openings'

/** Decline an application with an internal reason, and optionally the polite e-mail (TND-30) */
export default defineEventHandler(async (event) => {
  const { supabase, user, app } = await loadApplicationForAction(event)
  const body = await readBody<{ reason?: unknown, sendEmail?: unknown }>(event)
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 300) : ''
  if (!reason) throw createError({ statusCode: 400, statusMessage: 'Le motif interne est obligatoire' })
  if (app.status === 'rejected') return { ok: true, emailed: false }
  const { error } = await supabase.from('applications').update({ status: 'rejected', rejection_reason: reason, last_contact_at: new Date().toISOString() }).eq('id', app.id)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  await supabase.from('application_events').insert({ application_id: app.id, actor_id: user.id, kind: 'rejected', data: { reason } })
  let emailed = false
  if (body?.sendEmail === true && app.candidates?.email) {
    const company = await companyInfo(supabase)
    const mail = rejectionEmail({ firstName: app.candidates.first_name, jobTitle: app.job_openings?.title ?? '', company: company.name })
    const sent = await sendMail({ to: app.candidates.email, ...mail })
    emailed = sent.sent
    await supabase.from('application_events').insert({ application_id: app.id, actor_id: user.id, kind: 'email', data: { template: 'rejection', sent: sent.sent, reason: sent.reason ?? null } })
  }
  return { ok: true, emailed }
})
