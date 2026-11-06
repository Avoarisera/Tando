import { requireAdmin } from '../../../utils/require-admin'
import { clearMailCache, fromHeader, sendWith, verifySmtp, type SmtpSecurity } from '../../../utils/mailer'

/**
 * With the saved settings (even while sending is off): `{ verify: true }` checks the
 * SMTP connection and login without sending; `{ to }` sends a test e-mail.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const b = await readBody<{ to?: unknown, verify?: unknown }>(event)
  const { data: s } = await supabase.from('mail_settings').select('smtp_host, smtp_port, smtp_security, smtp_user, from_name, from_email, reply_to, secret_id').eq('id', true).single()
  if (!s?.smtp_host) throw createError({ statusCode: 400, statusMessage: 'Enregistrez d’abord le serveur SMTP' })
  const { data: pass } = s.secret_id ? await supabase.rpc('get_mail_secret') : { data: '' }
  const base = { host: s.smtp_host, port: s.smtp_port, security: s.smtp_security as SmtpSecurity, user: s.smtp_user ?? '', pass: typeof pass === 'string' ? pass : '' }

  let r
  if (b?.verify === true) r = await verifySmtp(base)
  else {
    if (typeof b?.to !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(b.to.trim())) throw createError({ statusCode: 400, statusMessage: 'Adresse de test invalide' })
    if (!s.from_email) throw createError({ statusCode: 400, statusMessage: 'Renseignez l’adresse d’expédition' })
    r = await sendWith({ ...base, from: fromHeader(s.from_name, s.from_email), replyTo: s.reply_to || null, source: 'settings' }, {
      to: b.to.trim(),
      subject: 'Test d’envoi — WakaBods',
      text: 'Bonjour,\n\nCet e-mail confirme que l’envoi depuis WakaBods fonctionne : les candidats recevront bien vos messages.\n\nVous pouvez l’ignorer.',
    })
  }
  await supabase.from('mail_settings').update({ last_test_at: new Date().toISOString(), last_error: r.sent ? null : (r.reason ?? 'erreur').slice(0, 500) }).eq('id', true)
  clearMailCache()
  return r
})
