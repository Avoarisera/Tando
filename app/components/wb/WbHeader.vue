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
const route = useRoute()
watch(() => route.fullPath, () => { notifOpen.value = false })

function openNotification(n: AppNotification) {
  notifOpen.value = false
  if (!n.read_at) markRead([n.id])
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
.wb-head-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
