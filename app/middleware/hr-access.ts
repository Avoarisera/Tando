// HR pages (TND-29): admins and people with HR access
export default defineNuxtRouteMiddleware(async () => {
  const { profile, loadProfile } = useCurrentUser()
  await loadProfile()
  const p = profile.value
  if (!p || !(p.role === 'admin' || p.is_hr)) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
})
