/** TND-29 — performance reviews: shapes and pure helpers (unit-tested) */

export interface Competency { id: string, label: string, levels: string[] }
export type ReviewRole = 'self' | 'manager' | 'peer'
export interface ReviewQuestion { id: string, label: string, roles: ReviewRole[] }
/** short form asked to colleagues (TND-29 lot 2) */
export interface PeerPart { competencies: string[], questions: { id: string, label: string }[] }
/** no_rating / professional / bilan: « entretien professionnel » (TND-35), no performance rating */
export interface TemplateContent { objectives: boolean, competencies: Competency[], questions: ReviewQuestion[], peer?: PeerPart, no_rating?: boolean, professional?: boolean, bilan?: boolean }
export interface ObjectiveReview { text: string, status: 'met' | 'partial' | 'missed' | '', comment: string }

export interface ReviewResponse {
  id?: string
  packet_id: string
  author_id: string
  role: ReviewRole
  ratings: Record<string, number>
  comments: Record<string, string>
  answers: Record<string, string>
  objectives: ObjectiveReview[]
  submitted_at: string | null
}

export const LEVEL_KEYS = [1, 2, 3, 4] as const

/** What is still missing before a response can be submitted */
export function missingInResponse(content: TemplateContent, role: ReviewRole, r: Pick<ReviewResponse, 'ratings' | 'answers'>): { competencies: string[], questions: string[] } {
  return {
    competencies: content.competencies.filter(c => r.ratings[c.id] === undefined).map(c => c.id),
    questions: content.questions.filter(q => q.roles.includes(role) && !(r.answers[q.id] ?? '').trim()).map(q => q.id),
  }
}

/** Per competency: self vs manager, and the gap when both rated (0 = « can't say » ignored) */
export function compareRatings(content: TemplateContent, self: Record<string, number> | undefined, manager: Record<string, number> | undefined) {
  return content.competencies.map((c) => {
    const s = self?.[c.id] || null
    const m = manager?.[c.id] || null
    const gap = s && m ? s - m : null
    return { id: c.id, label: c.label, self: s, manager: m, gap, flag: gap !== null && Math.abs(gap) >= 2 }
  })
}

/** Average of the rated competencies (null when none) */
export function averageRating(ratings: Record<string, number> | undefined): number | null {
  const v = Object.values(ratings ?? {}).filter(n => n >= 1 && n <= 4)
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
}

export type PacketStep = 'self' | 'manager' | 'hr' | 'ready' | 'shared' | 'acknowledged'
/** Where a packet stands, for HR progress views */
export function packetStep(p: { self_submitted: boolean, manager_submitted: boolean, has_manager: boolean, hr_done: boolean, shared: boolean, acknowledged: boolean }): PacketStep {
  if (p.acknowledged) return 'acknowledged'
  if (p.shared) return 'shared'
  if (p.hr_done) return 'ready'
  if (!p.self_submitted) return 'self'
  if (p.has_manager && !p.manager_submitted) return 'manager'
  return 'hr'
}

/** The colleagues' form as a template of its own: the chosen competencies, the peer questions, no objectives */
export function peerContent(content: TemplateContent): TemplateContent {
  const ids = content.peer?.competencies ?? []
  return {
    objectives: false,
    competencies: content.competencies.filter(c => ids.includes(c.id)),
    questions: (content.peer?.questions ?? []).map(q => ({ ...q, roles: ['peer'] as ReviewRole[] })),
  }
}

/** Anonymous aggregate returned by peer_feedback() */
export interface PeerFeedback { count: number, min: number, shown: boolean, averages?: Record<string, number>, comments?: Record<string, string[]>, answers?: Record<string, string[]> }

// ── Lot 3 (TND-35) ──────────────────────────────────────────────────────────
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
function shiftIso(iso: string, { years = 0, days = 0 }: { years?: number, days?: number }): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y + years, m - 1, d + days))
  // 29 Feb + n years → 28 Feb (keep the month)
  if (years && dt.getUTCMonth() !== m - 1) dt.setUTCDate(0)
  return isoDay(dt)
}
export const addYearsIso = (iso: string, years: number) => shiftIso(iso, { years })
export const addDaysIso = (iso: string, days: number) => shiftIso(iso, { days })

export type DueStatus = 'overdue' | 'soon' | 'ok'
/** Professional interview every 2 years (L6315-1) and 6-year review, from hire date or the last one shared */
export function professionalDue(p: { joined_at: string, last_ep: string | null, last_bilan: string | null }, today: string, soonDays = 60) {
  const nextEp = addYearsIso(p.last_ep ?? p.joined_at, 2)
  let nextBilan = addYearsIso(p.joined_at, 6)
  while (p.last_bilan && nextBilan <= p.last_bilan) nextBilan = addYearsIso(nextBilan, 6)
  const status = (d: string): DueStatus => (d < today ? 'overdue' : d <= addDaysIso(today, soonDays) ? 'soon' : 'ok')
  return { nextEp, nextBilan, epStatus: status(nextEp), bilanStatus: status(nextBilan) }
}

/**
 * Automatic reminders around a due date: « before » from D-3 to D, « after »
 * from D+1 to D+7 (the cron runs often; each phase is sent once, see job_runs).
 */
export function reminderPhase(due: string | null, today: string): 'before' | 'after' | null {
  if (!due) return null
  if (today >= addDaysIso(due, -3) && today <= due) return 'before'
  if (today >= addDaysIso(due, 1) && today <= addDaysIso(due, 7)) return 'after'
  return null
}
