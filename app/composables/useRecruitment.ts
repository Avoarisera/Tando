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

  return { listOpenings, getOpening, saveOpening, listApplications, listEvents, addNote, moveStage, reject, restore, fileUrl }
}

export const stageLabel = (stages: Stage[], key: string) => stages.find(s => s.key === key)?.label ?? key
