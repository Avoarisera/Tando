import { describe, expect, it } from 'vitest'
import { cleanFileName, createRateLimiter, sniffMime, slugify, validateApplication, ACCEPTED_MIME, type ApplicationFields } from '../../server/utils/careers'

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0])
const base: ApplicationFields = { first_name: 'Awa', last_name: 'Diallo', email: 'awa@example.com', phone: null, linkedin_url: null, cover_letter_text: null, answers: {}, consent: true, consent_pool: false, website: '' }
const form = { cover_letter: 'optional' as const, questions: [] }

describe('sniffMime', () => {
  it('recognises PDF, DOC and DOCX from their first bytes', () => {
    expect(sniffMime(bytes(0x25, 0x50, 0x44, 0x46), 'cv.pdf')).toBe(ACCEPTED_MIME.pdf)
    expect(sniffMime(bytes(0xD0, 0xCF, 0x11, 0xE0), 'cv.doc')).toBe(ACCEPTED_MIME.doc)
    expect(sniffMime(bytes(0x50, 0x4B, 0x03, 0x04), 'cv.docx')).toBe(ACCEPTED_MIME.docx)
  })
  it('refuses a renamed executable or a zip that is not a .docx', () => {
    expect(sniffMime(bytes(0x4D, 0x5A), 'cv.pdf')).toBeNull()
    expect(sniffMime(bytes(0x50, 0x4B, 0x03, 0x04), 'archive.zip')).toBeNull()
  })
})

describe('validateApplication', () => {
  it('accepts a minimal valid application', () => {
    expect(validateApplication(base, form, { cv: true, coverLetter: false })).toEqual([])
  })
  it('requires names, a valid e-mail, the CV and the consent', () => {
    const e = validateApplication({ ...base, first_name: ' ', email: 'nope', consent: false }, form, { cv: false, coverLetter: false })
    expect(e).toEqual(expect.arrayContaining(['first_name', 'email', 'cv', 'consent']))
  })
  it('enforces a required cover letter (file or text) and required questions', () => {
    const f2 = { cover_letter: 'required' as const, questions: [{ id: 'q1', label: 'Dispo ?', required: true }] }
    expect(validateApplication(base, f2, { cv: true, coverLetter: false })).toEqual(['cover_letter', 'q:q1'])
    expect(validateApplication({ ...base, cover_letter_text: 'Motivé', answers: { q1: 'Janvier' } }, f2, { cv: true, coverLetter: false })).toEqual([])
  })
  it('checks optional phone and link formats', () => {
    expect(validateApplication({ ...base, phone: 'abc', linkedin_url: 'javascript:alert(1)' }, form, { cv: true, coverLetter: false })).toEqual(['phone', 'linkedin_url'])
  })
})

describe('helpers', () => {
  it('cleans file names', () => {
    expect(cleanFileName('../../etc/<CV> Awa.pdf')).toBe('CV Awa.pdf')
  })
  it('slugifies titles without accents', () => {
    expect(slugify('Développeur·se Vue / Nuxt (H/F)')).toBe('developpeur-se-vue-nuxt-h-f')
  })
  it('limits per key in a sliding window', () => {
    const hit = createRateLimiter(2, 1000)
    expect([hit('a', 0), hit('a', 10), hit('a', 20), hit('b', 20), hit('a', 1500)]).toEqual([true, true, false, true, true])
  })
})
