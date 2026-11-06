import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

/** Application behind a candidate's private follow-up link (TND-30 lot 2) */
export async function loadTracked(event: H3Event) {
  const token = getRouterParam(event, 'token') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(token)) throw createError({ statusCode: 404, statusMessage: 'Lien invalide' })
  const supabase = serverSupabaseServiceRole(event)
  const { data } = await supabase.from('applications')
    .select('id, stage, status, created_at, candidate_id, opening_id, job_openings (title, slug, stages, status), candidates (first_name)')
    .eq('track_token', token).maybeSingle()
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Lien invalide ou candidature supprimée' })
  return { supabase, app: data as unknown as {
    id: string, stage: string, status: string, created_at: string, candidate_id: string, opening_id: string
    job_openings: { title: string, slug: string, stages: { key: string }[], status: string } | null
    candidates: { first_name: string } | null
  } }
}

