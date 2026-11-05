// Vélocité: admins, and managers (they only see the Linear teams linked to their team — TND-26)
export default defineNuxtRouteMiddleware(async () => {
  const { profile, loadProfile } = useCurrentUser()
  await loadProfile()
  if (!profile.value || (profile.value.role !== 'admin' && profile.value.role !== 'manager')) {
    throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })
  }
})
