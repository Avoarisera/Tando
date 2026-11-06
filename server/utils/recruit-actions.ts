import { serverSupabaseServiceRole } from '#supabase/server'
import type { H3Event } from 'h3'
import { requireRecruiter } from './require-recruiter'

/** Loads an application with its opening, and checks the caller may act on it */
export async function loadApplicationForAction(event: H3Event) {
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 404, statusMessage: 'Candidature introuvable' })
  const admin = serverSupabaseServiceRole(event)
  const { data: app } = await admin.from('applications')
    .select('id, stage, status, opening_id, candidates (first_name, email), job_openings (title, stages)')
    .eq('id', id).maybeSingle()
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Candidature introuvable' })
  const access = await requireRecruiter(event, app.opening_id as string)
  return { ...access, app: app as unknown as {
    id: string, stage: string, status: string, opening_id: string
    candidates: { first_name: string, email: string } | null
    job_openings: { title: string, stages: { key: string, label: string }[] } | null
  } }
}
