/** Validation of the SMTP settings form (TND-30 lot 4) — pure, unit-tested */
export interface MailSettingsInput {
  enabled: boolean
  smtp_host: string
  smtp_port: number
  smtp_security: 'starttls' | 'tls' | 'none'
  smtp_user: string
  from_name: string
  from_email: string
  reply_to: string
}
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/
const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i

export function parseMailSettings(b: Record<string, unknown> | null | undefined): { value: MailSettingsInput, error: string | null } {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const security = b?.smtp_security === 'tls' || b?.smtp_security === 'none' ? b.smtp_security : 'starttls'
  const port = Number(b?.smtp_port)
  const value: MailSettingsInput = {
    enabled: b?.enabled === true,
    smtp_host: str(b?.smtp_host, 253).toLowerCase(),
    smtp_port: Number.isInteger(port) && port > 0 && port < 65536 ? port : (security === 'tls' ? 465 : 587),
    smtp_security: security,
    smtp_user: str(b?.smtp_user, 254),
    from_name: str(b?.from_name, 80),
    from_email: str(b?.from_email, 254).toLowerCase(),
    reply_to: str(b?.reply_to, 254).toLowerCase(),
  }
  if (value.smtp_host && !HOST.test(value.smtp_host)) return { value, error: 'Hôte SMTP invalide (ex. smtp.votre-fournisseur.com)' }
  if (value.from_email && !EMAIL.test(value.from_email)) return { value, error: 'Adresse d’expédition invalide' }
  if (value.reply_to && !EMAIL.test(value.reply_to)) return { value, error: 'Adresse de réponse invalide' }
  if (value.enabled && (!value.smtp_host || !value.from_email)) return { value, error: 'Renseignez le serveur SMTP et l’adresse d’expédition avant d’activer l’envoi' }
  return { value, error: null }
}
