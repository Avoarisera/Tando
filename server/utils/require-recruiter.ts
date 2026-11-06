import type { H3Event } from 'h3'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { serverSupabaseServiceRole } from '#supabase/server'

export interface RecruiterAccess { supabase: SupabaseClient, user: User, recruiter: boolean }

/**
 * TND-30 — service-role routes of the recruitment module: a valid session and
 * either recruiter rights (admin or HR access) or, when `openingId` is given,
 * being the hiring manager of that opening.
 */
export async function requireRecruiter(event: H3Event, openingId?: string, interviewApplicationId?: string): Promise<RecruiterAccess> {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Non authentifié' })
  const supabase = serverSupabaseServiceRole(event)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user?.id) throw createError({ statusCode: 401, statusMessage: 'Session invalide' })
  const { data: me } = await supabase.from('profiles').select('role, is_hr').eq('id', user.id).single()
  const recruiter = me?.role === 'admin' || me?.is_hr === true
  if (recruiter) return { supabase, user, recruiter }
  if (openingId) {
    const { data: o } = await supabase.from('job_openings').select('id').eq('id', openingId).eq('hiring_manager_id', user.id).maybeSingle()
    if (o) return { supabase, user, recruiter: false }
  }
  // read-only access for an interviewer of this application (files)
  if (interviewApplicationId) {
    const { data: p } = await supabase.from('interview_participants').select('interview_id, interviews!inner (application_id, status)')
      .eq('profile_id', user.id).eq('interviews.application_id', interviewApplicationId).neq('interviews.status', 'cancelled').limit(1)
    if (p?.length) return { supabase, user, recruiter: false }
  }
  throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
}
