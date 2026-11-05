// Pages for managers (their own team) and admins (everyone) — TND-26
export default defineNuxtRouteMiddleware(async () => {
  const { profile, loadProfile } = useCurrentUser()
  await loadProfile()
  if (!profile.value || (profile.value.role !== 'admin' && profile.value.role !== 'manager')) {
    throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
  }
})
