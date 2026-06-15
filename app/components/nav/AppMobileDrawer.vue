<script setup lang="ts">
const route = useRoute()
const { navItems, isActive } = useNavItems()
const { profile, signOut } = useCurrentUser()

const isOpen = ref(false)
const drawerRef = ref<HTMLElement | null>(null)
const hamburgerRef = ref<HTMLButtonElement | null>(null)

watch(() => route.path, () => { isOpen.value = false })

function open() {
  isOpen.value = true
  nextTick(() => {
    const first = drawerRef.value?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    first?.focus()
  })
}

function close() {
  isOpen.value = false
  nextTick(() => hamburgerRef.value?.focus())
}

function trapFocus(event: KeyboardEvent) {
  if (!isOpen.value || !drawerRef.value) return
  const focusable = Array.from(
    drawerRef.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  )
  if (focusable.length === 0) return
  const first = focusable.at(0)!
  const last = focusable.at(-1)!
  if (event.key === 'Tab') {
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  } else if (event.key === 'Escape') {
    close()
  }
}

onMounted(() => document.addEventListener('keydown', trapFocus))
onUnmounted(() => document.removeEventListener('keydown', trapFocus))
</script>

<template>
  <div class="lg:hidden flex items-center h-14 px-4 bg-white border-b border-gray-200 flex-shrink-0">
    <button
      ref="hamburgerRef"
      aria-label="Ouvrir le menu"
      class="p-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
      @click="open"
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <span class="ml-3 text-base font-bold text-brand-primary">WakaBods</span>
  </div>

  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 bg-black/30 z-40"
        aria-hidden="true"
        @click="close"
      />
    </Transition>

    <Transition
      enter-active-class="transition-transform duration-200"
      enter-from-class="-translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200"
      leave-from-class="translate-x-0"
      leave-to-class="-translate-x-full"
    >
      <div
        v-if="isOpen"
        ref="drawerRef"
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        class="fixed top-0 left-0 h-full w-72 bg-white z-50 shadow-xl flex flex-col"
      >
        <div class="h-14 flex items-center justify-between px-4 border-b border-gray-200">
          <span class="text-base font-bold text-brand-primary">WakaBods</span>
          <button
            class="p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Fermer le menu"
            @click="close"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav class="flex-1 py-4 px-3 overflow-y-auto" aria-label="Navigation principale">
          <ul class="space-y-1">
            <li v-for="item in navItems" :key="item.to">
              <NuxtLink
                :to="item.to"
                class="flex items-center px-3 py-2.5 rounded-md text-sm transition-colors"
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
      </div>
    </Transition>
  </Teleport>
</template>
