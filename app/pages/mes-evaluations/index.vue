<script setup lang="ts">
import type { MyPacket } from '~/composables/useReviews'

// My reviews (TND-29): what I have to fill in (my self review, my team's reviews
// as a manager) and the files shared with me.
definePageMeta({ titleKey: 'nav.reviews', layout: 'private' })
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))
const { myPackets } = useReviews()
const items = ref<MyPacket[] | null>(null)
const error = ref<string | null>(null)
async function load() {
  error.value = null
  try { items.value = await myPackets() }
  catch (e) { error.value = errorMessage(e) }
}
onMounted(load)

const todo = computed(() => (items.value ?? []).filter(p => p.cycle_status === 'active' && !p.shared_at && (p.my_role === 'self' ? !p.self_submitted : !p.manager_submitted)))
const waiting = computed(() => (items.value ?? []).filter(p => !p.shared_at && !todo.value.includes(p)))
const shared = computed(() => (items.value ?? []).filter(p => p.shared_at))
const due = (p: MyPacket) => (p.my_role === 'self' ? p.self_due : p.manager_due)
const late = (d: string | null) => !!d && d < todayIso()
</script>

<template>
  <div class="wb-page wb-stack">
    <WbErrorState v-if="error" :message="error" @retry="load" />
    <WbSkeleton v-else-if="!items" variant="metric" :count="2" />
    <div v-else-if="!items.length" class="wb-card">
      <WbEmptyState art="inbox" :title="t('tnd29.mine.emptyTitle')">{{ t('tnd29.mine.emptyText') }}</WbEmptyState>
    </div>
    <template v-else>
      <section v-if="todo.length" class="wb-stack-s">
        <h2 class="h3">{{ t('tnd29.mine.todo', { n: todo.length }, todo.length) }}</h2>
        <ul class="wb-me-list">
          <li v-for="p in todo" :key="p.id + p.my_role">
            <NuxtLink :to="`/mes-evaluations/${p.id}`" class="wb-card wb-me-c is-todo" :data-packet="p.my_role === 'self' ? 'self' : p.employee_name">
              <WbAvatar :name="p.employee_name" :size="36" />
              <div class="wb-grow">
                <b class="small">{{ p.my_role === 'self' ? t('tnd29.mine.selfTitle') : t('tnd29.mine.managerTitle', { who: p.employee_name }) }}</b>
                <p class="caption wb-mut2">{{ p.cycle_name }}<template v-if="due(p)"> · <span :class="{ 'wb-c-danger': late(due(p)) }">{{ t('tnd29.list.due', { date: fmtShort(due(p)!, tag) }) }}</span></template></p>
              </div>
              <WbButton size="sm" tabindex="-1">{{ t('tnd29.mine.fill') }}</WbButton>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section v-if="waiting.length" class="wb-stack-s">
        <h2 class="h3">{{ t('tnd29.mine.waiting') }}</h2>
        <ul class="wb-me-list">
          <li v-for="p in waiting" :key="p.id + p.my_role">
            <NuxtLink :to="`/mes-evaluations/${p.id}`" class="wb-card wb-me-c">
              <WbAvatar :name="p.employee_name" :size="32" />
              <div class="wb-grow">
                <b class="small">{{ p.my_role === 'self' ? t('tnd29.mine.selfTitle') : p.employee_name }}</b>
                <p class="caption wb-mut2">{{ p.cycle_name }} · {{ t('tnd29.mine.sent') }}</p>
              </div>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section v-if="shared.length" class="wb-stack-s">
        <h2 class="h3">{{ t('tnd29.mine.shared') }}</h2>
        <ul class="wb-me-list">
          <li v-for="p in shared" :key="p.id + p.my_role">
            <NuxtLink :to="`/mes-evaluations/${p.id}`" class="wb-card wb-me-c">
              <WbAvatar :name="p.employee_name" :size="32" />
              <div class="wb-grow">
                <b class="small">{{ p.my_role === 'self' ? p.cycle_name : `${p.employee_name} · ${p.cycle_name}` }}</b>
                <p class="caption wb-mut2">{{ formatPeriod(p.period_start, p.period_end, tag) }}</p>
              </div>
              <WbBadge v-if="p.my_role === 'self' && !p.acknowledged_at" tone="warning" size="sm">{{ t('tnd29.mine.toAck') }}</WbBadge>
              <WbBadge v-else-if="p.acknowledged_at" tone="success" size="sm">{{ t('tnd29.mine.acked') }}</WbBadge>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.wb-stack-s h2 { margin: 0; }
.wb-me-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: var(--space-3); }
.wb-me-c { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); color: inherit; text-decoration: none; }
.wb-me-c:hover { border-color: var(--brand); }
.wb-me-c.is-todo { border-color: var(--brand); }
.wb-me-c p { margin: 0; }
.wb-me-c :deep(.wb-btn) { margin: 0; pointer-events: none; }
</style>
