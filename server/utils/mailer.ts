import type { SupabaseClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

/**
 * Transactional e-mail (TND-30) over generic SMTP with Nodemailer — works with
 * any provider (OVH, Google Workspace, Microsoft 365, Brevo, Mailgun, Resend…).
 * Configuration from Settings › E-mails (mail_settings + password in Supabase
 * Vault), otherwise the SMTP_* / MAIL_FROM environment variables. Without either
 * nothing is sent and the caller records "not sent". Never throws: an e-mail
 * failure must not lose an application.
 */
export interface MailInput { to: string, subject: string, text: string, html?: string, replyTo?: string }
export interface MailResult { sent: boolean, id?: string, reason?: string }
export type SmtpSecurity = 'starttls' | 'tls' | 'none'
export interface SmtpConfig {
  host: string
  port: number
  security: SmtpSecurity
  user: string
  pass: string
  from: string
  replyTo: string | null
  source: 'settings' | 'env'
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
/** Plain text → minimal, readable HTML (paragraphs; links stay as text) */
export function textToHtml(text: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#121a2d">${
    text.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`
}

/** « Nom <adresse> » when a name is set */
export const fromHeader = (name: string, email: string) => (name.trim() ? `${name.trim().replace(/[<>"]/g, '')} <${email.trim()}>` : email.trim())

/** Nodemailer options from our settings: 465 → implicit TLS, 587 → STARTTLS required */
export function transportOptions(c: Pick<SmtpConfig, 'host' | 'port' | 'security' | 'user' | 'pass'>) {
  return {
    host: c.host,
    port: c.port,
    secure: c.security === 'tls',
    requireTLS: c.security === 'starttls',
    ignoreTLS: c.security === 'none',
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  }
}

/** Readable reason from a Nodemailer / SMTP error (never the password) */
export function smtpReason(e: unknown): string {
  const err = e as { code?: string, responseCode?: number, response?: string, message?: string }
  if (err.code === 'EAUTH') return 'Identifiants SMTP refusés'
  if (err.code === 'ECONNECTION' || err.code === 'ECONNREFUSED') return 'Serveur SMTP injoignable (hôte ou port)'
  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKET') return 'Délai dépassé ou chiffrement incorrect (vérifiez le port et la sécurité)'
  if (err.code === 'EDNS') return 'Hôte SMTP introuvable'
  if (err.responseCode) return `SMTP ${err.responseCode} : ${(err.response ?? '').slice(0, 200)}`
  return (err.message ?? 'erreur').slice(0, 200)
}

let cache: { at: number, config: SmtpConfig | null, transport: Transporter | null } | null = null
export function clearMailCache() {
  cache?.transport?.close()
  cache = null
}

export async function getMailConfig(supabase: SupabaseClient): Promise<SmtpConfig | null> {
  if (cache && Date.now() - cache.at < 60_000) return cache.config
  let config: SmtpConfig | null = null
  const { data: s } = await supabase.from('mail_settings').select('enabled, smtp_host, smtp_port, smtp_security, smtp_user, from_name, from_email, reply_to, secret_id').eq('id', true).maybeSingle()
  if (s?.enabled && s.smtp_host && s.from_email) {
    const { data: pass } = s.secret_id ? await supabase.rpc('get_mail_secret') : { data: '' }
    config = { host: s.smtp_host, port: s.smtp_port, security: s.smtp_security as SmtpSecurity, user: s.smtp_user ?? '', pass: typeof pass === 'string' ? pass : '', from: fromHeader(s.from_name ?? '', s.from_email), replyTo: s.reply_to || null, source: 'settings' }
  }
  const env = process.env
  if (!config && env.SMTP_HOST && env.MAIL_FROM) {
    const port = Number(env.SMTP_PORT) || 587
    const security = (env.SMTP_SECURITY as SmtpSecurity | undefined) ?? (port === 465 ? 'tls' : 'starttls')
    config = { host: env.SMTP_HOST, port, security, user: env.SMTP_USER ?? '', pass: env.SMTP_PASS ?? '', from: env.MAIL_FROM, replyTo: env.MAIL_REPLY_TO ?? null, source: 'env' }
  }
  cache?.transport?.close()
  cache = { at: Date.now(), config, transport: config ? nodemailer.createTransport(transportOptions(config)) : null }
  return config
}

export async function sendWith(config: SmtpConfig, input: MailInput, transport?: Transporter | null): Promise<MailResult> {
  const t = transport ?? nodemailer.createTransport(transportOptions(config))
  try {
    const info = await t.sendMail({
      from: config.from, to: input.to, subject: input.subject, text: input.text, html: input.html ?? textToHtml(input.text),
      ...((input.replyTo ?? config.replyTo) ? { replyTo: input.replyTo ?? config.replyTo! } : {}),
    })
    return { sent: true, id: info.messageId }
  }
  catch (e) {
    return { sent: false, reason: smtpReason(e) }
  }
  finally {
    if (!transport) t.close()
  }
}

/** Checks the connection and the login without sending anything */
export async function verifySmtp(config: Pick<SmtpConfig, 'host' | 'port' | 'security' | 'user' | 'pass'>): Promise<MailResult> {
  const t = nodemailer.createTransport(transportOptions(config))
  try {
    await t.verify()
    return { sent: true }
  }
  catch (e) {
    return { sent: false, reason: smtpReason(e) }
  }
  finally { t.close() }
}

export async function sendMail(supabase: SupabaseClient, input: MailInput): Promise<MailResult> {
  const config = await getMailConfig(supabase)
  if (!config) return { sent: false, reason: 'not_configured' }
  const r = await sendWith(config, input, cache?.transport)
  // keep the last provider error visible in Settings › E-mails
  if (!r.sent && config.source === 'settings') await supabase.from('mail_settings').update({ last_error: (r.reason ?? 'erreur').slice(0, 500) }).eq('id', true)
  return r
}
