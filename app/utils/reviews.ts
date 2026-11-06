/** TND-29 — performance reviews: shapes and pure helpers (unit-tested) */

export interface Competency { id: string, label: string, levels: string[] }
export type ReviewRole = 'self' | 'manager' | 'peer'
export interface ReviewQuestion { id: string, label: string, roles: ReviewRole[] }
/** short form asked to colleagues (TND-29 lot 2) */
export interface PeerPart { competencies: string[], questions: { id: string, label: string }[] }
export interface TemplateContent { objectives: boolean, competencies: Competency[], questions: ReviewQuestion[], peer?: PeerPart }
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
