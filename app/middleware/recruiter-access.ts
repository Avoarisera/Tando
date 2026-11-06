// Recruitment (TND-30): admins, HR access, and managers (RLS shows them only the openings they recruit for)
export default defineNuxtRouteMiddleware(async () => {
  const { profile, loadProfile } = useCurrentUser()
  await loadProfile()
  const p = profile.value
  if (!p || !(p.role === 'admin' || p.role === 'manager' || p.is_hr)) {
    throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
  }
})
