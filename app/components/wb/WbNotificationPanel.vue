<script setup lang="ts">
import type { AppNotification, NotificationKind } from '~/composables/useNotifications'

const props = defineProps<{ items: readonly AppNotification[], role: string }>()
const emit = defineEmits<{ close: [], open: [n: AppNotification], readAll: [] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const panel = ref<HTMLElement | null>(null)

const STYLE: Record<NotificationKind, [string, string]> = {
  request_submitted: ['circle-check-big', 'warning'],
  manager_approved: ['check', 'info'],
  approved: ['circle-check', 'success'],
  rejected: ['circle-x', 'danger'],
  cancel_requested: ['undo-2', 'indigo'],
  cancel_approved: ['ban', 'neutral'],
  cancel_refused: ['circle-alert', 'warning'],
  application_received: ['user-plus', 'info'],
  interview_scheduled: ['calendar-days', 'indigo'],
  review_requested: ['file-text', 'warning'],
  review_shared: ['circle-check', 'success'],
}

function text(n: AppNotification) {
  const d = n.data
  const period = d.start_date && d.end_date ? formatPeriod(d.start_date, d.end_date, tag.value) : ''
  if (n.kind === 'review_requested') return d.role === 'manager' ? t('r8a.notif.review_manager', { who: d.who ?? '', cycle: d.cycle ?? '' }) : t('r8a.notif.review_self', { cycle: d.cycle ?? '' })
  return t(`r8a.notif.${n.kind}`, { cycle: d.cycle ?? '', who: `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim(), type: d.type ?? '', period, job: d.job ?? '', when: d.starts_at ? new Intl.DateTimeFormat(tag.value, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d.starts_at)) : '' })
}

const today = todayIso()
const yesterday = addDays(today, -1)
const groups = computed(() => {
  const map = new Map<string, AppNotification[]>()
  for (const n of props.items) {
    const day = new Date(n.created_at)
    const iso = isoDate(day.getFullYear(), day.getMonth() + 1, day.getDate())
    map.set(iso, [...(map.get(iso) ?? []), n])
  }
  return [...map].map(([day, items]) => ({
    day,
    label: day === today ? t('r8a.notif.today') : day === yesterday ? t('r8a.notif.yesterday') : fmtDate(day, tag.value, { weekday: 'long', day: 'numeric', month: 'long' }),
    items,
  }))
})
const time = (iso: string) => new Intl.DateTimeFormat(tag.value, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
function onDoc(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (panel.value && !panel.value.contains(target) && !target.closest('.wb-bell')) emit('close')
}
onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.addEventListener('click', onDoc)
  nextTick(() => panel.value?.querySelector<HTMLElement>('button')?.focus())
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('click', onDoc)
})
</script>

<template>
  <div class="wb-ov wb-ov-n wb-np-ov">
    <div ref="panel" class="wb-np" role="dialog" :aria-label="t('r8a.notif.title')">
      <header>
        <h2 class="h2">{{ t('r8a.notif.title') }}</h2>
        <WbButton variant="ghost" size="sm" :disabled="!items.some(n => !n.read_at)" @click="emit('readAll')">{{ t('r8a.notif.readAll') }}</WbButton>
      </header>
      <p v-if="!items.length" class="wb-np-empty small wb-mut">{{ t('r8a.notif.empty') }}</p>
      <section v-for="g in groups" :key="g.day">
        <h3 class="caption wb-mut">{{ g.label }}</h3>
        <ul>
          <li v-for="n in g.items" :key="n.id" :class="{ 'is-un': !n.read_at }" :data-kind="n.kind">
            <span :class="['wb-np-i', `wb-t-${STYLE[n.kind][1]}`]"><WbIcon :name="STYLE[n.kind][0]" :size="16" /></span>
            <button type="button" class="wb-np-b wb-grow" @click="emit('open', n)">
              <span class="small">{{ text(n) }}</span>
              <span v-if="n.kind === 'rejected' && n.data.comment" class="caption2 wb-mut2">« {{ n.data.comment }} »</span>
              <span class="caption2 wb-mut">{{ time(n.created_at) }}</span>
            </button>
          </li>
        </ul>
      </section>
      <footer><NuxtLink class="small" to="/profile" @click="emit('close')">{{ t('r8a.notif.prefs') }}</NuxtLink></footer>
    </div>
  </div>
</template>

<style scoped>
.wb-np-ov { position: fixed; z-index: 55; }
.wb-np { max-height: calc(100dvh - 80px); overflow-y: auto; }
.wb-np-empty { padding: var(--space-5); }
.wb-np-b { all: unset; cursor: pointer; display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: var(--space-1) 0; border-radius: var(--radius-sm); }
.wb-np-b:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.wb-np section:last-of-type { padding-bottom: var(--space-3); }
@media (max-width: 767px) {
  .wb-np-ov { padding: 0; }
  .wb-np { width: 100%; max-height: 100dvh; min-height: 100dvh; border-radius: 0; }
}
</style>
