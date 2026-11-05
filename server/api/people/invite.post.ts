import { requireAdmin } from '../../utils/require-admin'

interface InviteBody {
  email?: unknown
  first_name?: unknown
  last_name?: unknown
  role?: unknown
  team_id?: unknown
  country?: unknown
  joined_at?: unknown
}

const ROLES = ['employee', 'manager', 'admin'] as const
type Role = typeof ROLES[number]

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s && s.length <= max ? s : null
}

/**
 * Invite a person (lot R8-E). Admin only. Sends the Supabase invitation e-mail,
 * creates the profile and a zero balance per active leave type for this year.
 */
export default defineEventHandler(async (event) => {
  const { supabase } = await requireAdmin(event)
  const body = await readBody<InviteBody>(event)

  const email = str(body?.email, 254)?.toLowerCase() ?? null
  const firstName = str(body?.first_name, 80)
  const lastName = str(body?.last_name, 80)
  const role = typeof body?.role === 'string' && (ROLES as readonly string[]).includes(body.role) ? body.role as Role : null
  const teamId = typeof body?.team_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.team_id) ? body.team_id : null
  const country = typeof body?.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : null
  const joinedAt = typeof body?.joined_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.joined_at) ? body.joined_at : null

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw createError({ statusCode: 400, statusMessage: 'E-mail invalide' })
  if (!firstName || !lastName) throw createError({ statusCode: 400, statusMessage: 'Le prénom et le nom sont obligatoires' })
  if (!role) throw createError({ statusCode: 400, statusMessage: 'Rôle invalide' })
  if (!country) throw createError({ statusCode: 400, statusMessage: 'Pays invalide' })

  if (teamId) {
    const { data: team } = await supabase.from('teams').select('id').eq('id', teamId).maybeSingle()
    if (!team) throw createError({ statusCode: 400, statusMessage: 'Équipe introuvable' })
  }

  const origin = getRequestURL(event).origin
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/accept-invite`,
    data: { first_name: firstName, last_name: lastName },
  })
  if (inviteError || !invited?.user) {
    const exists = inviteError && (inviteError.status === 422 || /already/i.test(inviteError.message))
    throw createError({ statusCode: exists ? 409 : 500, statusMessage: exists ? 'Cette adresse a déjà un compte' : 'Invitation impossible' })
  }

  const userId = invited.user.id
  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    first_name: firstName,
    last_name: lastName,
    role,
    team_id: teamId,
    country,
    joined_at: joinedAt ?? new Date().toISOString().slice(0, 10),
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

  return { id: userId }
})
