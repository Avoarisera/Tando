import type { Opening, Stage } from '~/utils/recruitment'

export interface ApplicationRow {
  id: string
  opening_id: string
  stage: string
  status: 'active' | 'rejected' | 'withdrawn' | 'hired'
  answers: Record<string, string>
  cover_letter_text: string | null
  source: string
  consent_pool: boolean
  rejection_reason: string | null
  purge_after: string
  created_at: string
  updated_at: string
  candidates: { id: string, first_name: string, last_name: string, email: string, phone: string | null, linkedin_url: string | null } | null
  application_files: { id: string, kind: 'cv' | 'cover_letter', file_name: string, mime_type: string, size_bytes: number }[]
}
export interface Interview {
  id: string
  stage_key: string
  starts_at: string
  duration_min: number
  location: string
  video_url: string | null
  notes: string
  status: 'scheduled' | 'done' | 'cancelled'
  interview_participants: { profile_id: string, profiles: { first_name: string, last_name: string } | null }[]
}
export type Recommendation = 'strong_yes' | 'yes' | 'no' | 'strong_no'
export interface Scorecard {
  id: string
  application_id: string
  author_id: string
  stage_key: string
  ratings: Record<string, number>
  comments: Record<string, string>
  summary: string
  recommendation: Recommendation | null
  submitted_at: string | null
  updated_at: string
  profiles: { first_name: string, last_name: string } | null
}
export interface PoolRow {
  id: string
  opening_id: string
  stage: string
  status: 'active' | 'rejected' | 'withdrawn' | 'hired'
  source: string
  consent_pool: boolean
  rejection_reason: string | null
  created_at: string
  updated_at: string
  candidates: { id: string, first_name: string, last_name: string, email: string } | null
  application_files: { id: string, kind: string }[]
}
export interface EmailTemplate { key: 'acknowledgement' | 'rejection' | 'invitation' | 'offer', subject: string, body: string }

export interface ApplicationEvent { id: number, kind: string, data: Record<string, unknown>, created_at: string, actor_id: string | null, profiles: { first_name: string, last_name: string } | null }

/** TND-30 — recruitment data (RLS: recruiters see everything, hiring managers their openings) */
export function useRecruitment() {
  const supabase = useSupabaseClient()

  /** Server routes of the module need the session token (service role behind a guard) */
  async function authFetch<T>(url: string, opts: { method?: 'GET' | 'POST', body?: Record<string, unknown> } = {}): Promise<T> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Non authentifié')
    return await $fetch<T>(url, { method: opts.method ?? 'GET', body: opts.body, headers: { Authorization: `Bearer ${session.access_token}` } })
  }

  async function listOpenings() {
    const [{ data, error }, { data: apps, error: e2 }] = await Promise.all([
      supabase.from('job_openings').select('*, teams (name)').order('created_at', { ascending: false }),
      supabase.from('applications').select('opening_id, stage, status, created_at'),
    ])
    if (error) throw new Error(errorMessage(error))
    if (e2) throw new Error(errorMessage(e2))
    return { openings: (data ?? []) as (Opening & { teams: { name: string } | null })[], apps: (apps ?? []) as Pick<ApplicationRow, 'opening_id' | 'stage' | 'status' | 'created_at'>[] }
  }

  async function getOpening(id: string) {
    const { data, error } = await supabase.from('job_openings').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(errorMessage(error))
    return data as Opening | null
  }

  async function saveOpening(id: string | null, patch: Partial<Opening>) {
    const q = id
      ? supabase.from('job_openings').update(patch).eq('id', id).select('id').single()
      : supabase.from('job_openings').insert(patch).select('id').single()
    const { data, error } = await q
    if (error) throw new Error(error.code === '23505' ? 'Cette adresse d’offre existe déjà : changez le titre ou l’adresse.' : errorMessage(error))
    return (data as { id: string }).id
  }

  async function listApplications(openingId: string) {
    const { data, error } = await supabase.from('applications')
      .select('*, candidates (id, first_name, last_name, email, phone, linkedin_url), application_files (id, kind, file_name, mime_type, size_bytes)')
      .eq('opening_id', openingId).order('created_at', { ascending: false })
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as ApplicationRow[]
  }

  async function listEvents(applicationId: string) {
    const { data, error } = await supabase.from('application_events')
      .select('id, kind, data, created_at, actor_id, profiles:actor_id (first_name, last_name)')
      .eq('application_id', applicationId).order('created_at', { ascending: true })
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as unknown as ApplicationEvent[]
  }

  async function addNote(applicationId: string, text: string, me: string) {
    const { error } = await supabase.from('application_events').insert({ application_id: applicationId, actor_id: me, kind: 'note', data: { text } })
    if (error) throw new Error(errorMessage(error))
  }

  const moveStage = (id: string, stage: string) => authFetch<{ ok: true }>(`/api/recruiting/applications/${id}/stage`, { method: 'POST', body: { stage } })
  const reject = (id: string, reason: string, sendEmail: boolean) => authFetch<{ ok: true, emailed: boolean }>(`/api/recruiting/applications/${id}/reject`, { method: 'POST', body: { reason, sendEmail } })
  const restore = (id: string) => authFetch<{ ok: true }>(`/api/recruiting/applications/${id}/restore`, { method: 'POST' })
  const fileUrl = (id: string, download = false) => authFetch<{ url: string, name: string }>(`/api/recruiting/files/${id}${download ? '?download=1' : ''}`)

  // ── Lot 2: interviews, scorecards, e-mails, hire ─────────────────────────
  async function listInterviews(applicationId: string) {
    const { data, error } = await supabase.from('interviews')
      .select('id, stage_key, starts_at, duration_min, location, video_url, notes, status, interview_participants (profile_id, profiles (first_name, last_name))')
      .eq('application_id', applicationId).order('starts_at')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as unknown as Interview[]
  }
  const planInterview = (applicationId: string, body: Record<string, unknown>) => authFetch<{ id: string, emailed: boolean | null }>(`/api/recruiting/applications/${applicationId}/interviews`, { method: 'POST', body })
  const cancelInterview = (id: string) => authFetch<{ ok: true }>(`/api/recruiting/interviews/${id}/cancel`, { method: 'POST' })

  async function listScorecards(applicationId: string) {
    const { data, error } = await supabase.from('scorecards')
      .select('*, profiles:author_id (first_name, last_name)').eq('application_id', applicationId).order('submitted_at', { ascending: true, nullsFirst: false })
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as unknown as Scorecard[]
  }
  async function saveScorecard(card: Partial<Scorecard> & { application_id: string, author_id: string, stage_key: string }) {
    const row = { application_id: card.application_id, author_id: card.author_id, stage_key: card.stage_key, ratings: card.ratings ?? {}, comments: card.comments ?? {}, summary: card.summary ?? '', recommendation: card.recommendation ?? null, submitted_at: card.submitted_at ?? null }
    const { error } = card.id
      ? await supabase.from('scorecards').update(row).eq('id', card.id)
      : await supabase.from('scorecards').insert(row)
    if (error) throw new Error(errorMessage(error))
  }

  async function listTemplates() {
    const { data, error } = await supabase.from('email_templates').select('key, subject, body').order('key')
    if (error) throw new Error(errorMessage(error))
    return (data ?? []) as EmailTemplate[]
  }
  async function saveTemplate(t: EmailTemplate) {
    const { error } = await supabase.from('email_templates').update({ subject: t.subject, body: t.body, updated_at: new Date().toISOString() }).eq('key', t.key)
    if (error) throw new Error(errorMessage(error))
  }
  const sendEmail = (applicationId: string, body: { subject: string, text: string, template: string }) => authFetch<{ sent: boolean, reason: string | null }>(`/api/recruiting/applications/${applicationId}/email`, { method: 'POST', body })
  const purge = (dry: boolean) => authFetch<{ last: { last_run_at: string, result: { applications?: number, files?: number, candidates?: number } } | null }>(`/api/recruiting/purge${dry ? '?dry=1' : ''}`, { method: dry ? 'GET' : 'POST' })
  const propose = (applicationId: string, openingId: string) => authFetch<{ id: string, opening_id: string }>(`/api/recruiting/applications/${applicationId}/propose`, { method: 'POST', body: { opening_id: openingId } })

  /** Lot 3 — every application with its stage history, for the statistics and the talent pool */
  async function listAllApplications() {
    const [{ data: apps, error }, { data: events, error: e2 }, { data: ops, error: e3 }] = await Promise.all([
      supabase.from('applications').select('id, opening_id, stage, status, source, consent_pool, rejection_reason, created_at, updated_at, candidates (id, first_name, last_name, email), application_files (id, kind)').order('created_at', { ascending: false }),
      supabase.from('application_events').select('application_id, kind, data, created_at').in('kind', ['stage', 'hired']),
      supabase.from('job_openings').select('id, title, status, stages'),
    ])
    if (error || e2 || e3) throw new Error(errorMessage(error ?? e2 ?? e3))
    return { apps: (apps ?? []) as unknown as PoolRow[], events: (events ?? []) as { application_id: string, kind: string, data: { from?: string, to?: string }, created_at: string }[], openings: (ops ?? []) as { id: string, title: string, status: string, stages: { key: string, label: string }[] }[] }
  }

  const hire = (applicationId: string, body: Record<string, unknown>) => authFetch<{ id: string }>(`/api/recruiting/applications/${applicationId}/hire`, { method: 'POST', body })

  return { listOpenings, getOpening, saveOpening, listApplications, listEvents, addNote, moveStage, reject, restore, fileUrl,
    listInterviews, planInterview, cancelInterview, listScorecards, saveScorecard, listTemplates, saveTemplate, sendEmail, hire,
    propose, listAllApplications, purge }
}

export const stageLabel = (stages: Stage[], key: string) => stages.find(s => s.key === key)?.label ?? key

/** Same variables as the server ({prenom} {poste}…): preview and prefill of an e-mail */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(prenom|nom|poste|entreprise|date|lieu|lien_suivi)\}/g, (m, k: string) => vars[k] ?? m).replace(/\n{3,}/g, '\n\n')
}
