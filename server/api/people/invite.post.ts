import { siteUrl } from '../../utils/site-url'
import { requireAdmin } from '../../utils/require-admin'
import { invitePerson } from '../../utils/invite-person'

interface InviteBody {
  email?: unknown
  first_name?: unknown
  last_name?: unknown
  role?: unknown
  team_id?: unknown
  country?: unknown
  joined_at?: unknown
  is_hr?: unknown
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

  const userId = await invitePerson(supabase, siteUrl(event), {
    email, firstName, lastName, role, teamId, country, joinedAt, isHr: body?.is_hr === true,
  })

  return { id: userId }
})
