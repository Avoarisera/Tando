<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const { profile, loadProfile, signOut } = useCurrentUser()
const { role, sections, tabItems, isActive } = useNavItems()
const { current: pageHeader } = usePageHeader()
const { toReview, fetchAll: fetchApprovals } = useApprovals()
const { isOpen: leavePanelOpen, detailId, close: closeLeavePanel, closeDetail } = useLeavePanel()

await loadProfile()

// No profile means no valid session (e.g. expired cookie): go back to the login
// page instead of rendering a half-empty private page with the wrong menu (TND-01).
if (!profile.value) {
  await navigateTo('/login')
}

// Sidebar badge: requests waiting for this manager or admin
onMounted(() => { if (role.value !== 'employee') fetchApprovals() })
const counts = computed(() => ({ approvals: toReview.value.length }))

const userName = computed(() => [profile.value?.first_name, profile.value?.last_name].filter(Boolean).join(' '))
const title = computed(() => {
  if (pageHeader.value?.title) return pageHeader.value.title
  const key = route.meta.titleKey
  return typeof key === 'string' ? t(key) : ''
})
useHead({ title: () => (title.value ? `${title.value} · WakaBods` : 'WakaBods') })

// Offline banner (design T-03): follows the browser's connection state
const offline = ref(false)
function syncOnline() { offline.value = !navigator.onLine }
onMounted(() => {
  syncOnline()
  window.addEventListener('online', syncOnline)
  window.addEventListener('offline', syncOnline)
})
onBeforeUnmount(() => {
  window.removeEventListener('online', syncOnline)
  window.removeEventListener('offline', syncOnline)
})

// Collapsed sidebar is remembered between visits
const collapsed = useCookie<boolean>('wb_nav_collapsed', { default: () => false, sameSite: 'lax' })

// Admin drawer (under 768 px): focus moves in on open, back to the menu button on close
const drawerOpen = ref(false)
const drawerRef = ref<HTMLElement | null>(null)
watch(() => route.path, () => {
  drawerOpen.value = false
  closeLeavePanel()
  closeDetail()
})

function openDrawer() {
  drawerOpen.value = true
  nextTick(() => drawerRef.value?.querySelector<HTMLElement>('.wb-side-g a[href]')?.focus())
}
function closeDrawer() {
  drawerOpen.value = false
  nextTick(() => document.querySelector<HTMLElement>('.wb-only-m-admin')?.focus())
}
function onDrawerKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeDrawer()
    return
  }
  if (e.key !== 'Tab' || !drawerRef.value) return
  const items = Array.from(drawerRef.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
  const first = items.at(0)
  const last = items.at(-1)
  if (!first || !last) return
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  }
  else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <div class="wb-app wb-app-page">
    <div class="wb-app-in">
      <!-- The column carries the sidebar colour down long pages; the sidebar itself stays in view -->
      <div class="wb-side-col">
        <WbSidebar :sections="sections" :is-active="isActive" :collapsed="collapsed" :counts="counts" @toggle="collapsed = !collapsed" />
      </div>
      <div class="wb-app-m">
        <WbHeader
          :title="title"
          :crumbs="pageHeader?.crumbs"
          :role="role"
          :user-name="userName"
          :menu-open="drawerOpen"
          @open-menu="openDrawer"
          @sign-out="signOut"
        />
        <div v-if="offline" class="wb-offline small" role="status"><WbIcon name="wifi-off" :size="16" />{{ t('common.offline') }}</div>
        <main class="wb-main">
          <slot />
        </main>
        <WbTabBar v-if="role !== 'admin'" :items="tabItems" :is-active="isActive" />
      </div>
    </div>

    <LeaveRequestPanel v-if="leavePanelOpen && role !== 'admin'" />
    <LeaveDetailPanel v-if="detailId" />

    <div
      v-if="drawerOpen"
      ref="drawerRef"
      class="wb-drawer"
      role="dialog"
      aria-modal="true"
      :aria-label="t('nav.menu')"
      @keydown="onDrawerKey"
    >
      <div class="wb-scrim" @click="closeDrawer" />
      <WbSidebar :sections="sections" :is-active="isActive" :counts="counts" drawer />
      <WbButton class="wb-drawer-x" variant="secondary" icon="x" icon-only @click="closeDrawer">{{ t('nav.closeMenu') }}</WbButton>
    </div>
  </div>
  <AppToastContainer />
</template>

<style scoped>
.wb-app-page { min-height: 100dvh; }
.wb-side-col { flex: none; background: var(--surface-nav); }
.wb-side-col > .wb-side { position: sticky; top: 0; height: 100dvh; overflow-y: auto; }
.wb-app-page .wb-head { position: sticky; top: 0; }
.wb-drawer { position: fixed; inset: 0; z-index: 50; display: flex; }
.wb-drawer .wb-scrim { position: fixed; }
.wb-drawer :deep(.wb-side) { position: relative; z-index: 1; }
.wb-drawer-x { position: relative; z-index: 1; margin: var(--space-3); align-self: flex-start; }
</style>
