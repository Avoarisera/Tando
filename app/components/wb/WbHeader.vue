<script setup lang="ts">
import type { Crumb } from '~/composables/usePageHeader'
import type { AppNotification } from '~/composables/useNotifications'

const props = defineProps<{ title?: string, crumbs?: Crumb[], role: string, userName: string, menuOpen?: boolean }>()
defineEmits<{ openMenu: [], signOut: [] }>()
const { t } = useI18n()
const { open } = useLeavePanel()
const { items, unread, markRead, startPolling } = useNotifications()
startPolling()
const notifOpen = ref(false)
// Quick light / dark switch next to the bell (the profile keeps the "Système" choice)
const { choice: themeChoice, resolved: theme } = useTheme()
function toggleTheme() { themeChoice.value = theme.value === 'dark' ? 'light' : 'dark' }
const route = useRoute()
watch(() => route.fullPath, () => { notifOpen.value = false })

function openNotification(n: AppNotification) {
  notifOpen.value = false
  if (!n.read_at) markRead([n.id])
  if ((n.kind === 'review_requested' || n.kind === 'review_shared') && n.data.packet_id) {
    navigateTo(`/mes-evaluations/${n.data.packet_id}`)
    return
  }
  if (n.kind === 'review_peer_requested' && n.data.packet_id) { navigateTo(`/mes-evaluations/collegue/${n.data.packet_id}`); return }
  if (n.kind === 'review_peers_proposed' && n.data.packet_id) { navigateTo(`/mes-evaluations/${n.data.packet_id}`); return }
  if (n.kind === 'review_reminder') { navigateTo('/mes-evaluations'); return }
  if ((n.kind === 'application_received' || n.kind === 'interview_scheduled') && n.data.opening_id) {
    navigateTo({ path: `/recrutement/${n.data.opening_id}`, query: n.data.application_id ? { a: n.data.application_id } : {} })
    return
  }
  const toApprovals = ['request_submitted', 'cancel_requested'].includes(n.kind)
    || (n.kind === 'manager_approved' && props.role === 'admin')
  if (toApprovals) navigateTo('/approvals')
  else navigateTo({ path: '/leave-requests', query: { tab: n.kind === 'rejected' || n.kind === 'cancel_approved' ? 'refused' : n.kind === 'manager_approved' ? 'pending' : 'upcoming' } })
}
</script>

<template>
  <header class="wb-head">
    <WbButton
      v-if="role === 'admin'"
      class="wb-only-m-admin"
      data-role="admin"
      variant="ghost"
      icon="menu"
      icon-only
      aria-haspopup="dialog"
      :aria-expanded="menuOpen"
      @click="$emit('openMenu')"
    >
      {{ t('nav.menu') }}
    </WbButton>
    <div class="wb-head-t">
      <WbBreadcrumbs v-if="crumbs?.length" :items="crumbs" />
      <h1 v-else class="h2 wb-head-title">{{ title }}</h1>
    </div>
    <div class="wb-head-a">
      <WbButton v-if="role !== 'admin'" class="wb-hide-m" icon="plus" aria-haspopup="dialog" @click="open()">{{ t('nav.leave') }}</WbButton>
      <button
        type="button"
        class="wb-theme-t"
        data-action="toggle-theme"
        :aria-label="theme === 'dark' ? t('header.toLight') : t('header.toDark')"
        :title="theme === 'dark' ? t('header.toLight') : t('header.toDark')"
        @click="toggleTheme"
      >
        <WbIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="20" />
      </button>
      <button
        type="button"
        class="wb-bell"
        :aria-label="t('r8a.notif.bell', { n: unread }, unread)"
        aria-haspopup="dialog"
        :aria-expanded="notifOpen"
        @click="notifOpen = !notifOpen"
      >
        <WbIcon name="bell" :size="20" />
        <span v-if="unread > 0" class="wb-num">{{ unread > 99 ? '99+' : unread }}</span>
      </button>
      <WbUserMenu :name="userName" @sign-out="$emit('signOut')" />
    </div>
    <WbNotificationPanel
      v-if="notifOpen"
      :items="items"
      :role="role"
      @close="notifOpen = false"
      @open="openNotification"
      @read-all="markRead()"
    />
  </header>
</template>

<style scoped>
.wb-bell { border: 0; background: none; cursor: pointer; }
.wb-theme-t { border: 0; background: none; cursor: pointer; display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: var(--radius-md); color: var(--ink-2); }
.wb-theme-t:hover { background: var(--surface-2); color: var(--ink); }
.wb-theme-t:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.wb-head-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
