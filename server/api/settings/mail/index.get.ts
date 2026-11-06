import { requireAdmin } from '../../../utils/require-admin'
/** Settings › E-mails (TND-30 lot 4): configuration without the key (only its last 4 characters) */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const { data } = await supabase.from('mail_settings').select('provider, enabled, from_name, from_email, reply_to, key_hint, key_secret_id, last_test_at, last_error, updated_at').eq('id', true).maybeSingle()
  return {
    provider: data?.provider ?? 'resend',
    enabled: !!data?.enabled,
    from_name: data?.from_name ?? '',
    from_email: data?.from_email ?? '',
    reply_to: data?.reply_to ?? '',
    has_key: !!data?.key_secret_id,
    key_hint: data?.key_hint ?? '',
    last_test_at: data?.last_test_at ?? null,
    last_error: data?.last_error ?? null,
    env_fallback: !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
  }
})
