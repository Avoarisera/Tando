import { requireAdmin } from '../../../utils/require-admin'
import { clearMailCache } from '../../../utils/mailer'

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/

/** Save the e-mail settings (admin). The API key is optional: sent only to replace it. */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const b = await readBody<{ enabled?: unknown, from_name?: unknown, from_email?: unknown, reply_to?: unknown, api_key?: unknown }>(event)
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const fromEmail = str(b?.from_email, 254).toLowerCase()
  const replyTo = str(b?.reply_to, 254).toLowerCase()
  const apiKey = str(b?.api_key, 200)
  if (fromEmail && !EMAIL.test(fromEmail)) throw createError({ statusCode: 400, statusMessage: 'Adresse d’expédition invalide' })
  if (replyTo && !EMAIL.test(replyTo)) throw createError({ statusCode: 400, statusMessage: 'Adresse de réponse invalide' })
  if (apiKey && !/^re_[A-Za-z0-9_]{8,}$/.test(apiKey)) throw createError({ statusCode: 400, statusMessage: 'Clé Resend invalide (elle commence par « re_ »)' })
  if (apiKey) {
    const { error } = await supabase.rpc('set_mail_api_key', { p_key: apiKey })
    if (error) throw createError({ statusCode: 500, statusMessage: 'Enregistrement de la clé impossible' })
  }
  const { data: cur } = await supabase.from('mail_settings').select('key_secret_id').eq('id', true).single()
  const enabled = b?.enabled === true
  if (enabled && (!cur?.key_secret_id || !fromEmail)) throw createError({ statusCode: 400, statusMessage: 'Renseignez la clé et l’adresse d’expédition avant d’activer l’envoi' })
  const { error } = await supabase.from('mail_settings').update({
    enabled, from_name: str(b?.from_name, 80), from_email: fromEmail, reply_to: replyTo, last_error: null, updated_at: new Date().toISOString(),
  }).eq('id', true)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  clearMailCache()
  return { ok: true }
})
