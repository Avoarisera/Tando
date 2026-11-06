/**
 * TND-30 — public applications: field validation, file sniffing, rate limit.
 * Pure helpers (unit-tested), used by POST /api/careers/[slug]/apply.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ACCEPTED_MIME = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const
export type AcceptedMime = typeof ACCEPTED_MIME[keyof typeof ACCEPTED_MIME]

/** Real type from the first bytes (never trust the browser's Content-Type or the extension) */
export function sniffMime(bytes: Uint8Array, fileName: string): AcceptedMime | null {
  const b = (i: number) => bytes[i] ?? -1
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return ACCEPTED_MIME.pdf // %PDF
  if (b(0) === 0xD0 && b(1) === 0xCF && b(2) === 0x11 && b(3) === 0xE0) return ACCEPTED_MIME.doc // OLE2
  // DOCX is a zip: accept it only with a .docx name (other zips are refused)
  if (b(0) === 0x50 && b(1) === 0x4B && b(2) === 0x03 && b(3) === 0x04 && /\.docx$/i.test(fileName)) return ACCEPTED_MIME.docx
  return null
}

export const extOf = (mime: AcceptedMime) => (mime === ACCEPTED_MIME.pdf ? 'pdf' : mime === ACCEPTED_MIME.doc ? 'doc' : 'docx')

/** File name safe to store and show (no path, no control characters, 120 chars max) */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'document'
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim().slice(-120) || 'document'
}

export interface OpeningForm {
  cover_letter: 'none' | 'optional' | 'required'
  questions: { id: string, label: string, required?: boolean }[]
}
export interface ApplicationFields {
  first_name: string
  last_name: string
  email: string
  phone: string | null
  linkedin_url: string | null
  cover_letter_text: string | null
  answers: Record<string, string>
  consent: boolean
  consent_pool: boolean
  /** honeypot: must stay empty */
  website: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const URL_RE = /^https?:\/\/[^\s]+$/i

/** Returns the list of field errors (keys), empty when valid */
export function validateApplication(f: ApplicationFields, form: OpeningForm, files: { cv: boolean, coverLetter: boolean }): string[] {
  const errors: string[] = []
  if (!f.first_name.trim() || f.first_name.length > 80) errors.push('first_name')
  if (!f.last_name.trim() || f.last_name.length > 80) errors.push('last_name')
  if (!EMAIL.test(f.email) || f.email.length > 254) errors.push('email')
  if (f.phone && (f.phone.length > 40 || !/^[+\d\s().-]{6,}$/.test(f.phone))) errors.push('phone')
  if (f.linkedin_url && (f.linkedin_url.length > 300 || !URL_RE.test(f.linkedin_url))) errors.push('linkedin_url')
  if (!files.cv) errors.push('cv')
  if (form.cover_letter === 'required' && !files.coverLetter && !(f.cover_letter_text ?? '').trim()) errors.push('cover_letter')
  if ((f.cover_letter_text ?? '').length > 6000) errors.push('cover_letter')
  for (const q of form.questions) {
    const a = (f.answers[q.id] ?? '').trim()
    if (q.required && !a) errors.push(`q:${q.id}`)
    if (a.length > 1000) errors.push(`q:${q.id}`)
  }
  if (!f.consent) errors.push('consent')
  return [...new Set(errors)]
}

/** Sliding-window limiter in memory (one instance behind Coolify): `limit` hits per `windowMs` per key */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>()
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs)
    if (recent.length >= limit) { hits.set(key, recent); return false }
    recent.push(now)
    hits.set(key, recent)
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k)
    return true
  }
}

/** URL slug from a job title: lower case, no accents, dashes */
export function slugify(title: string): string {
  return title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'offre'
}
