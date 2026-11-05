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
