import type { H3Event } from 'h3'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { serverSupabaseServiceRole } from '#supabase/server'

/**
 * Guard for server routes that act with the service role (Vélocité).
 *
 * The service role bypasses RLS, so these routes must check the caller
 * themselves: a valid session AND the admin role (TND-17). Returns the
 * service client and the authenticated admin.
 */
export async function requireAdmin(event: H3Event): Promise<{ supabase: SupabaseClient; user: User }> {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Non authentifié' })
  }

  const supabase = serverSupabaseServiceRole(event)

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Session invalide' })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Accès réservé aux administrateurs' })
  }

  return { supabase, user }
}

export interface VelocityAccess {
  supabase: SupabaseClient
  user: User
  role: 'admin' | 'manager'
  /** the manager's WakaBods team (null for an admin) */
  teamId: string | null
}

/**
 * TND-26 — Vélocité with the service role, for an admin or for a manager whose
 * WakaBods team is linked to this Linear team (team_linear_teams).
 */
export async function requireVelocityAccess(event: H3Event, workspaceId: string, linearTeamId: string): Promise<VelocityAccess> {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Non authentifié' })
  const supabase = serverSupabaseServiceRole(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user?.id) throw createError({ statusCode: 401, statusMessage: 'Session invalide' })

  const { data: profile } = await supabase.from('profiles').select('role, team_id').eq('id', user.id).single()
  if (profile?.role === 'admin') return { supabase, user, role: 'admin', teamId: null }
  if (profile?.role === 'manager' && profile.team_id) {
    const { data: link } = await supabase.from('team_linear_teams').select('team_id')
      .eq('team_id', profile.team_id).eq('workspace_id', workspaceId).eq('linear_team_id', linearTeamId).maybeSingle()
    if (link) return { supabase, user, role: 'manager', teamId: profile.team_id as string }
  }
  throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
}
