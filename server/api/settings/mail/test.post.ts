import { requireAdmin } from '../../../utils/require-admin'
import { clearMailCache, fromHeader, sendWith } from '../../../utils/mailer'

/** Send a test e-mail with the saved settings (even when sending is not enabled yet) */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const { to } = await readBody<{ to?: unknown }>(event)
  if (typeof to !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(to.trim())) throw createError({ statusCode: 400, statusMessage: 'Adresse de test invalide' })
  const { data: s } = await supabase.from('mail_settings').select('from_name, from_email, reply_to, key_secret_id').eq('id', true).single()
  const { data: key } = await supabase.rpc('get_mail_api_key')
  if (!s?.from_email || typeof key !== 'string' || !key) throw createError({ statusCode: 400, statusMessage: 'Enregistrez d’abord la clé et l’adresse d’expédition' })
  const r = await sendWith({ apiKey: key, from: fromHeader(s.from_name, s.from_email), replyTo: s.reply_to || null, source: 'settings' }, {
    to: to.trim(),
    subject: 'Test d’envoi — WakaBods',
    text: 'Bonjour,\n\nCet e-mail confirme que l’envoi depuis WakaBods fonctionne : les candidats recevront bien vos messages.\n\nVous pouvez l’ignorer.',
  })
  await supabase.from('mail_settings').update({ last_test_at: new Date().toISOString(), last_error: r.sent ? null : (r.reason ?? 'erreur').slice(0, 500) }).eq('id', true)
  clearMailCache()
  return r
})
