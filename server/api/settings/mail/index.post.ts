import { requireAdmin } from '../../../utils/require-admin'
import { clearMailCache } from '../../../utils/mailer'
import { parseMailSettings } from '../../../utils/mail-settings'

/** Save the SMTP settings (admin). The password is optional: sent only to replace it. */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const b = await readBody<Record<string, unknown>>(event)
  const { value, error } = parseMailSettings(b)
  if (error) throw createError({ statusCode: 400, statusMessage: error })
  const password = typeof b?.smtp_password === 'string' ? b.smtp_password : ''
  if (password.length > 500) throw createError({ statusCode: 400, statusMessage: 'Mot de passe trop long' })
  if (password) {
    const { error: e } = await supabase.rpc('set_mail_secret', { p_secret: password })
    if (e) throw createError({ statusCode: 500, statusMessage: 'Enregistrement du mot de passe impossible' })
  }
  const { error: e2 } = await supabase.from('mail_settings').update({ ...value, last_error: null, updated_at: new Date().toISOString() }).eq('id', true)
  if (e2) throw createError({ statusCode: 500, statusMessage: e2.message })
  clearMailCache()
  return { ok: true }
})
