<script setup lang="ts">
const { profile, loadProfile } = useCurrentUser()

await loadProfile()

// No profile means no valid session (e.g. expired cookie): go back to the login
// page instead of rendering a half-empty private page with the wrong menu (TND-01).
if (!profile.value) {
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex min-h-screen bg-gray-50">
    <AppSidebar class="hidden lg:flex" />
    <div class="flex-1 flex flex-col min-w-0">
      <AppMobileDrawer />
      <main class="flex-1 p-6">
        <slot />
      </main>
    </div>
  </div>
  <AppToastContainer />
</template>
