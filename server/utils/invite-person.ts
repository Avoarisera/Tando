import type { SupabaseClient } from '@supabase/supabase-js'

export interface PersonInput {
  email: string
  firstName: string
  lastName: string
  role: 'employee' | 'manager' | 'admin'
  teamId: string | null
  country: string
  joinedAt: string | null
}

/**
 * Creates a WakaBods account (Supabase invitation e-mail), its profile and a zero
 * balance per active leave type for this year. Shared by People › Invite and
 * Recruitment › Hire (TND-30). Throws an H3 error with a readable message.
 */
export async function invitePerson(supabase: SupabaseClient, origin: string, p: PersonInput): Promise<string> {
  if (p.teamId) {
    const { data: team } = await supabase.from('teams').select('id').eq('id', p.teamId).maybeSingle()
    if (!team) throw createError({ statusCode: 400, statusMessage: 'Équipe introuvable' })
  }
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(p.email, {
    redirectTo: `${origin}/accept-invite`,
    data: { first_name: p.firstName, last_name: p.lastName },
  })
  if (inviteError || !invited?.user) {
    const exists = inviteError && (inviteError.status === 422 || /already/i.test(inviteError.message))
    throw createError({ statusCode: exists ? 409 : 500, statusMessage: exists ? 'Cette adresse a déjà un compte' : 'Invitation impossible' })
  }
  const userId = invited.user.id
  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId, first_name: p.firstName, last_name: p.lastName, role: p.role, team_id: p.teamId,
    country: p.country, joined_at: p.joinedAt ?? new Date().toISOString().slice(0, 10),
  })
  if (profileError) {
    // Don't leave an account without a profile behind
    await supabase.auth.admin.deleteUser(userId)
    throw createError({ statusCode: 500, statusMessage: 'Création du profil impossible' })
  }
  const year = new Date().getFullYear()
  const { data: types } = await supabase.from('leave_types').select('id').eq('is_active', true)
  if (types?.length) {
    await supabase.from('leave_balances').upsert(
      types.map(t => ({ user_id: userId, leave_type_id: t.id, year, allocated_days: 0, used_days: 0 })),
      { onConflict: 'user_id,leave_type_id,year', ignoreDuplicates: true },
    )
  }
  return userId
}
