import { describe, expect, it } from 'vitest'
import { fromHeader, textToHtml } from '../../server/utils/mailer'

describe('mailer helpers', () => {
  it('builds « Name <address> » and strips header-breaking characters', () => {
    expect(fromHeader('Recrutement WakaBods', 'jobs@waka.com')).toBe('Recrutement WakaBods <jobs@waka.com>')
    expect(fromHeader('Evil <x> "y"', 'a@b.co')).toBe('Evil x y <a@b.co>')
    expect(fromHeader('', 'a@b.co')).toBe('a@b.co')
  })
  it('escapes HTML in the text part', () => {
    expect(textToHtml('<script>x</script>\n\nOk')).toContain('&lt;script&gt;')
  })
})
