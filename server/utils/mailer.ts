/**
 * Transactional e-mail (TND-30): Resend's HTTP API when RESEND_API_KEY and
 * MAIL_FROM are set (EU region account). Without them nothing is sent and the
 * caller records "not sent" — the app keeps working in dev and before the
 * domain is verified. Never throws: an e-mail failure must not lose an application.
 */
export interface MailInput { to: string, subject: string, text: string, html?: string, replyTo?: string }
export interface MailResult { sent: boolean, id?: string, reason?: string }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
/** Plain text → minimal, readable HTML (paragraphs, links kept as text) */
export function textToHtml(text: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#121a2d">${
    text.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  if (!key || !from) return { sent: false, reason: 'not_configured' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, html: input.html ?? textToHtml(input.text), ...(input.replyTo ? { reply_to: input.replyTo } : {}) }),
    })
    if (!res.ok) return { sent: false, reason: `http_${res.status}` }
    const body = await res.json() as { id?: string }
    return { sent: true, id: body.id }
  }
  catch {
    return { sent: false, reason: 'network' }
  }
}
