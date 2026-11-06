import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Transactional e-mail (TND-30). Configuration from Settings › E-mails
 * (mail_settings + API key in Supabase Vault, TND-30 lot 4), otherwise the
 * RESEND_API_KEY / MAIL_FROM environment variables. Without either nothing is
 * sent and the caller records "not sent". Never throws: an e-mail failure must
 * not lose an application.
 */
export interface MailInput { to: string, subject: string, text: string, html?: string, replyTo?: string }
export interface MailResult { sent: boolean, id?: string, reason?: string }
export interface MailConfig { apiKey: string, from: string, replyTo: string | null, source: 'settings' | 'env' }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
/** Plain text → minimal, readable HTML (paragraphs; links stay as text) */
export function textToHtml(text: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#121a2d">${
    text.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`
}

/** « Nom <adresse> » when a name is set */
export const fromHeader = (name: string, email: string) => (name.trim() ? `${name.trim().replace(/[<>"]/g, '')} <${email.trim()}>` : email.trim())

let cache: { at: number, config: MailConfig | null } | null = null
export function clearMailCache() { cache = null }

export async function getMailConfig(supabase: SupabaseClient): Promise<MailConfig | null> {
  if (cache && Date.now() - cache.at < 60_000) return cache.config
  let config: MailConfig | null = null
  const { data: s } = await supabase.from('mail_settings').select('enabled, from_name, from_email, reply_to, key_secret_id').eq('id', true).maybeSingle()
  if (s?.enabled && s.key_secret_id && s.from_email) {
    const { data: key } = await supabase.rpc('get_mail_api_key')
    if (typeof key === 'string' && key) config = { apiKey: key, from: fromHeader(s.from_name ?? '', s.from_email), replyTo: s.reply_to || null, source: 'settings' }
  }
  if (!config && process.env.RESEND_API_KEY && process.env.MAIL_FROM) {
    config = { apiKey: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM, replyTo: null, source: 'env' }
  }
  cache = { at: Date.now(), config }
  return config
}

export async function sendWith(config: MailConfig, input: MailInput): Promise<MailResult> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: config.from, to: [input.to], subject: input.subject, text: input.text, html: input.html ?? textToHtml(input.text),
        ...((input.replyTo ?? config.replyTo) ? { reply_to: input.replyTo ?? config.replyTo } : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { message?: string } | null
      return { sent: false, reason: `http_${res.status}${body?.message ? `: ${body.message.slice(0, 200)}` : ''}` }
    }
    const body = await res.json() as { id?: string }
    return { sent: true, id: body.id }
  }
  catch {
    return { sent: false, reason: 'network' }
  }
}

export async function sendMail(supabase: SupabaseClient, input: MailInput): Promise<MailResult> {
  const config = await getMailConfig(supabase)
  if (!config) return { sent: false, reason: 'not_configured' }
  const r = await sendWith(config, input)
  // keep the last provider error visible in Settings › E-mails
  if (!r.sent && config.source === 'settings') await supabase.from('mail_settings').update({ last_error: (r.reason ?? 'erreur').slice(0, 500) }).eq('id', true)
  return r
}
