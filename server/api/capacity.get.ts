import { capacityOf, type CapacityLeave } from '../utils/capacity'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 92

interface LeaveRow extends CapacityLeave {
  user_id: string
  leave_types: { name: string } | null
}

/**
 * Capacity of a Linear team over a period (admin only, R8-H): working days of
 * each dev minus their approved leave. Devs are matched to WakaBods accounts by
 * e-mail; the service role is needed to read auth e-mails and everyone's leave.
 */
export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireAdmin(event)
  const { workspaceId, teamId, from, to } = getQuery(event)

  if (typeof workspaceId !== 'string' || typeof teamId !== 'string' || !workspaceId || !teamId) {
    throw createError({ statusCode: 400, statusMessage: 'workspaceId et teamId requis' })
  }
  if (typeof from !== 'string' || typeof to !== 'string' || !ISO.test(from) || !ISO.test(to) || to < from) {
    throw createError({ statusCode: 400, statusMessage: 'Période invalide' })
  }
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
  if (span > MAX_DAYS) {
    throw createError({ statusCode: 400, statusMessage: `Période limitée à ${MAX_DAYS} jours` })
  }

  // Same ownership rule as the other Vélocité routes: the workspace belongs to this admin
  const { data: ws } = await supabase.from('workspaces').select('id').eq('id', workspaceId).eq('user_id', user.id).maybeSingle()
  if (!ws) throw createError({ statusCode: 404, statusMessage: 'Workspace introuvable' })

  // Devs of the team = assignees of its issues
  const { data: issues, error: issuesError } = await supabase
    .from('linear_issues').select('assignee_id').eq('workspace_id', workspaceId).eq('team_id', teamId).not('assignee_id', 'is', null)
  if (issuesError) throw createError({ statusCode: 500, statusMessage: issuesError.message })
  const devIds = [...new Set((issues ?? []).map(i => i.assignee_id as string))]
  if (!devIds.length) return { from, to, devs: [] }

  const { data: linearUsers, error: luError } = await supabase
    .from('linear_users').select('id, email, display_name').eq('workspace_id', workspaceId).in('id', devIds)
  if (luError) throw createError({ statusCode: 500, statusMessage: luError.message })

  // e-mail → WakaBods account (paginated listing of auth users)
  const byEmail = new Map<string, string>()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    for (const u of data.users) if (u.email) byEmail.set(u.email.toLowerCase(), u.id)
    if (data.users.length < 200) break
  }

  const matched = (linearUsers ?? []).map(lu => ({ lu, profileId: lu.email ? byEmail.get(lu.email.toLowerCase()) : undefined }))
  const profileIds = matched.map(m => m.profileId).filter((x): x is string => !!x)

  const [{ data: profiles }, { data: leaves }] = await Promise.all([
    profileIds.length
      ? supabase.from('profiles').select('id, first_name, last_name, country').in('id', profileIds)
      : Promise.resolve({ data: [] as { id: string, first_name: string, last_name: string, country: string | null }[] }),
    profileIds.length
      ? supabase.from('leave_requests')
          .select('user_id, start_date, end_date, start_half, end_half, leave_types (name)')
          .in('user_id', profileIds).in('status', ['approved', 'cancel_requested'])
          .lte('start_date', to).gte('end_date', from)
      : Promise.resolve({ data: [] as LeaveRow[] }),
  ])

  const countries = [...new Set((profiles ?? []).map(p => p.country ?? 'FR').concat('FR'))]
  const { data: holidayRows } = await supabase.from('public_holidays').select('country, day').in('country', countries).gte('day', from).lte('day', to)
  const holidaysOf = (country: string) => new Set((holidayRows ?? []).filter(h => h.country === country).map(h => h.day as string))

  const devs = matched.map(({ lu, profileId }) => {
    const profile = (profiles ?? []).find(p => p.id === profileId)
    const name = profile ? `${profile.first_name} ${profile.last_name}` : (lu.display_name ?? lu.email ?? lu.id)
    const holidays = holidaysOf(profile?.country ?? 'FR')
    const own = ((leaves ?? []) as unknown as LeaveRow[]).filter(l => l.user_id === profileId)
    const cap = capacityOf(from, to, holidays, own)
    return {
      id: lu.id,
      name,
      linked: !!profile,
      ...cap,
      absences: own.map(l => ({ start: l.start_date, end: l.end_date, type: l.leave_types?.name ?? '' })),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  return { from, to, devs }
})
