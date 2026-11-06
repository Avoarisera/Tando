// Recruitment (TND-30): admins, HR access and managers (RLS shows a hiring manager their
// openings), plus any employee invited to an interview (they see those candidates only).
export default defineNuxtRouteMiddleware(async () => {
  const { profile, loadProfile } = useCurrentUser()
  await loadProfile()
  const p = profile.value
  if (!p) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
  if (p.role === 'admin' || p.role === 'manager' || p.is_hr) return
  const supabase = useSupabaseClient()
  const { count } = await supabase.from('interview_participants').select('interview_id', { count: 'exact', head: true }).eq('profile_id', p.id)
  if (!count) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
})
