<script setup lang="ts">
const { navItems, isActive } = useNavItems()
const { profile, signOut } = useCurrentUser()
</script>

<template>
  <aside class="flex flex-col w-60 min-h-screen bg-white border-r border-gray-200 flex-shrink-0">
    <div class="h-16 flex items-center px-6 border-b border-gray-200">
      <span class="text-lg font-bold text-brand-primary">WakaBods</span>
    </div>

    <nav class="flex-1 py-4 px-3" aria-label="Navigation principale">
      <ul class="space-y-1">
        <li v-for="item in navItems" :key="item.to">
          <NuxtLink
            :to="item.to"
            class="flex items-center px-3 py-2 rounded-md text-sm transition-colors"
            :class="isActive(item.to)
              ? 'bg-brand-primary/10 text-brand-primary font-semibold border-l-2 border-brand-primary pl-[10px]'
              : 'text-gray-600 hover:bg-gray-100'"
            :aria-current="isActive(item.to) ? 'page' : undefined"
          >
            {{ item.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <div class="p-4 border-t border-gray-200 space-y-3">
      <div v-if="profile" class="px-1 text-sm text-gray-500 truncate">
        {{ profile.first_name }} {{ profile.last_name }}
      </div>
      <AppButton variant="ghost" class="w-full justify-start" @click="signOut">
        Déconnexion
      </AppButton>
    </div>
  </aside>
</template>
