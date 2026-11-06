export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  const publicRoutes = ['/login', '/forgot-password', '/reset-password', '/accept-invite']

  // the careers page is public (TND-30)
  const isPublic = publicRoutes.includes(to.path) || to.path === '/carrieres' || to.path.startsWith('/carrieres/')
  if (!user.value && !isPublic) {
    return navigateTo('/login')
  }

  if (user.value && to.path === '/login') {
    const { isAdmin, loadProfile } = useCurrentUser()
    await loadProfile()
    return navigateTo(isAdmin.value ? '/dashboard' : '/')
  }
})
