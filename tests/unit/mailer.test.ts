import { describe, expect, it } from 'vitest'
import { fromHeader, smtpReason, textToHtml, transportOptions } from '../../server/utils/mailer'
import { parseMailSettings } from '../../server/utils/mail-settings'

describe('mailer helpers', () => {
  it('builds « Name <address> » and strips header-breaking characters', () => {
    expect(fromHeader('Recrutement WakaBods', 'jobs@waka.com')).toBe('Recrutement WakaBods <jobs@waka.com>')
    expect(fromHeader('Evil <x> "y"', 'a@b.co')).toBe('Evil x y <a@b.co>')
    expect(fromHeader('', 'a@b.co')).toBe('a@b.co')
  })
  it('escapes HTML in the text part', () => {
    expect(textToHtml('<script>x</script>\n\nOk')).toContain('&lt;script&gt;')
  })
  it('maps the security mode to Nodemailer options', () => {
    expect(transportOptions({ host: 'h', port: 465, security: 'tls', user: 'u', pass: 'p' })).toMatchObject({ secure: true, requireTLS: false })
    expect(transportOptions({ host: 'h', port: 587, security: 'starttls', user: 'u', pass: 'p' })).toMatchObject({ secure: false, requireTLS: true })
    expect(transportOptions({ host: 'h', port: 25, security: 'none', user: '', pass: '' })).toMatchObject({ ignoreTLS: true, auth: undefined })
  })
  it('gives readable SMTP errors without leaking secrets', () => {
    expect(smtpReason({ code: 'EAUTH', message: 'Invalid login: pass=secret' })).toBe('Identifiants SMTP refusés')
    expect(smtpReason({ responseCode: 550, response: 'Mailbox unavailable' })).toBe('SMTP 550 : Mailbox unavailable')
  })
})

describe('parseMailSettings', () => {
  it('accepts a typical provider configuration', () => {
    const r = parseMailSettings({ enabled: true, smtp_host: 'SMTP.Mail.OVH.net', smtp_port: '587', smtp_security: 'starttls', smtp_user: 'jobs@waka.com', from_email: 'Jobs@Waka.com' })
    expect(r.error).toBeNull()
    expect(r.value).toMatchObject({ smtp_host: 'smtp.mail.ovh.net', smtp_port: 587, from_email: 'jobs@waka.com' })
  })
  it('defaults the port from the security mode', () => {
    expect(parseMailSettings({ smtp_security: 'tls' }).value.smtp_port).toBe(465)
  })
  it('refuses a bad host, a bad address, or enabling without host and sender', () => {
    expect(parseMailSettings({ smtp_host: 'smtp exemple' }).error).toMatch(/Hôte/)
    expect(parseMailSettings({ from_email: 'nope' }).error).toMatch(/expédition/)
    expect(parseMailSettings({ enabled: true }).error).toMatch(/avant d’activer/)
  })
})
