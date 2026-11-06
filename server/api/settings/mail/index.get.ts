import { requireAdmin } from '../../../utils/require-admin'

/** Settings › E-mails (TND-30 lot 4): SMTP configuration, never the password */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const { data } = await supabase.from('mail_settings').select('enabled, smtp_host, smtp_port, smtp_security, smtp_user, from_name, from_email, reply_to, secret_id, last_test_at, last_error').eq('id', true).maybeSingle()
  return {
    enabled: !!data?.enabled,
    smtp_host: data?.smtp_host ?? '',
    smtp_port: data?.smtp_port ?? 587,
    smtp_security: data?.smtp_security ?? 'starttls',
    smtp_user: data?.smtp_user ?? '',
    has_password: !!data?.secret_id,
    from_name: data?.from_name ?? '',
    from_email: data?.from_email ?? '',
    reply_to: data?.reply_to ?? '',
    last_test_at: data?.last_test_at ?? null,
    last_error: data?.last_error ?? null,
    env_fallback: !!(process.env.SMTP_HOST && process.env.MAIL_FROM),
  }
})
