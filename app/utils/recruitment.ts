/** TND-30 — shared shapes and labels of the recruitment module */

export type ContractType = 'cdi' | 'cdd' | 'internship' | 'apprenticeship' | 'freelance'
export type RemoteMode = 'on_site' | 'hybrid' | 'remote'
export type OpeningStatus = 'draft' | 'published' | 'paused' | 'closed'
export interface OpeningQuestion { id: string, label: string, required?: boolean }
export interface Stage { key: string, label: string }

export interface PublicOpening {
  id: string
  slug: string
  title: string
  location: string
  contract_type: ContractType
  remote: RemoteMode
  salary_min: number | null
  salary_max: number | null
  salary_period: 'year' | 'month'
  salary_currency: string
  summary: string
  missions: string
  profile: string
  benefits: string
  process_steps: string[]
  questions: OpeningQuestion[]
  cover_letter: 'none' | 'optional' | 'required'
  published_at: string | null
  teams: { name: string } | null
}

export interface Criterion { id: string, label: string }

export interface Opening extends Omit<PublicOpening, 'teams'> {
  /** scorecard criteria (TND-30 lot 2), up to 6 */
  criteria: Criterion[]
  /** hide identity at the first stages (TND-30 lot 3) */
  anonymous_screening: boolean
  team_id: string | null
  hiring_manager_id: string | null
  stages: Stage[]
  status: OpeningStatus
  created_at: string
  updated_at: string
}

export const DEFAULT_STAGES: Stage[] = [
  { key: 'new', label: 'Nouvelle' }, { key: 'screen', label: 'Présélection' }, { key: 'hr', label: 'Échange RH' },
  { key: 'tech', label: 'Entretien technique' }, { key: 'team', label: 'Rencontre équipe' }, { key: 'offer', label: 'Offre' },
  { key: 'hired', label: 'Embauché' },
]

/** « 45 000 – 55 000 € / an » (no decimals, locale grouping) */
export function salaryLabel(o: Pick<PublicOpening, 'salary_min' | 'salary_max' | 'salary_currency' | 'salary_period'>, locale: string, perYear: string, perMonth: string): string | null {
  if (o.salary_min == null && o.salary_max == null) return null
  const f = new Intl.NumberFormat(locale, { style: 'currency', currency: o.salary_currency || 'EUR', maximumFractionDigits: 0 })
  const range = o.salary_min != null && o.salary_max != null && o.salary_min !== o.salary_max
    ? `${f.format(o.salary_min)} – ${f.format(o.salary_max)}`
    : f.format((o.salary_min ?? o.salary_max)!)
  return `${range} ${o.salary_period === 'month' ? perMonth : perYear}`
}

/** Paragraphs and "- " bullet lists from the plain text typed by HR (no HTML is ever injected) */
export function textBlocks(text: string): ({ kind: 'p', text: string } | { kind: 'ul', items: string[] })[] {
  const out: ({ kind: 'p', text: string } | { kind: 'ul', items: string[] })[] = []
  for (const block of text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean)) {
    const lines = block.split('\n').map(l => l.trim())
    if (lines.every(l => /^[-•*]\s+/.test(l))) out.push({ kind: 'ul', items: lines.map(l => l.replace(/^[-•*]\s+/, '')) })
    else out.push({ kind: 'p', text: lines.join(' ') })
  }
  return out
}

/** URL slug from a job title: lower case, no accents, dashes (same rule as the server) */
export function slugify(title: string): string {
  return title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'offre'
}

/** Anonymous screening (TND-30 lot 3): identity hidden at « Nouvelle » and « Présélection » */
export const ANON_STAGES = ['new', 'screen']
export function isAnonymous(opening: Pick<Opening, 'anonymous_screening'> | null | undefined, app: { stage: string, status: string }): boolean {
  return !!opening?.anonymous_screening && app.status === 'active' && ANON_STAGES.includes(app.stage)
}

/** Readable names of the application sources (?source= of the share links) */
export const SOURCE_LABEL: Record<string, string> = { careers: 'Page carrières', linkedin: 'LinkedIn', indeed: 'Indeed', referral: 'Cooptation', vivier: 'Vivier', welcome: 'Welcome to the Jungle' }
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s
