import { loadApplicationForAction } from '../../../../utils/recruit-actions'
import { sendMail } from '../../../../utils/mailer'
import { PRIVACY_FOOTER } from '../../../../utils/recruit-emails'

/** Send an e-mail to the candidate (TND-30 lot 2): text prepared from a template and edited by HR */
export default defineEventHandler(async (event) => {
  const { supabase, user, app } = await loadApplicationForAction(event)
  const b = await readBody<{ subject?: unknown, text?: unknown, template?: unknown }>(event)
  const subject = typeof b?.subject === 'string' ? b.subject.trim().slice(0, 200) : ''
  const text = typeof b?.text === 'string' ? b.text.trim().slice(0, 6000) : ''
  const template = typeof b?.template === 'string' && ['invitation', 'offer', 'rejection', 'acknowledgement'].includes(b.template) ? b.template : 'custom'
  if (!subject || !text) throw createError({ statusCode: 400, statusMessage: 'L’objet et le message sont obligatoires' })
  if (!app.candidates?.email) throw createError({ statusCode: 400, statusMessage: 'Adresse du candidat inconnue' })
  const sent = await sendMail(supabase, { to: app.candidates.email, subject, text: text + PRIVACY_FOOTER })
  await supabase.from('application_events').insert({ application_id: app.id, actor_id: user.id, kind: 'email', data: { template, subject, sent: sent.sent, reason: sent.reason ?? null } })
  if (sent.sent) await supabase.from('applications').update({ last_contact_at: new Date().toISOString() }).eq('id', app.id)
  return { sent: sent.sent, reason: sent.reason ?? null }
})
