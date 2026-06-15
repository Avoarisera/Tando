<script setup lang="ts">
const { loadProfile } = useCurrentUser()

await loadProfile()
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
