<script setup lang="ts">
import type { ProblematicTicket, BlockedTicket } from '~/composables/useTeamInsights'
import type { WbBadgeTone } from '~/components/wb/WbBadge.vue'

const props = defineProps<{ problematic: ProblematicTicket[], blocked: BlockedTicket[], workspaceId: string }>()
const { t } = useI18n()

function ticketLink(id: string): string {
  return `/velocite/issues/${id}?workspaceId=${props.workspaceId}`
}
function stuckTone(days: number): WbBadgeTone {
  if (days >= 14) return 'danger'
  if (days >= 7) return 'warning'
  return 'neutral'
}
function overrunTone(stuck: number, expected: number): WbBadgeTone {
  const ratio = stuck / Math.max(expected, 1)
  if (ratio >= 3) return 'danger'
  if (ratio >= 2) return 'warning'
  return 'neutral'
}
</script>

<template>
  <div class="wb-grid wb-cols-2">
    <WbCard :title="t('velocityB.insights.blockedTitle')" :subtitle="t('velocityB.insights.blockedHint')">
      <WbEmptyState v-if="blocked.length === 0" art="sun" :title="t('velocityB.insights.noBlocked')" />
      <template v-else>
        <ul class="wb-list">
          <li v-for="tk in blocked.slice(0, 8)" :key="tk.id" class="small">
            <WbBadge :tone="stuckTone(tk.stuck_days)" size="sm"><span class="wb-num">{{ t('velocityB.insights.days', { n: tk.stuck_days }) }}</span></WbBadge>
            <span class="wb-grow wb-ins-t">
              <NuxtLink :to="ticketLink(tk.id)"><span class="wb-mono">{{ tk.identifier ?? '?' }}</span> {{ tk.title ?? t('velocityB.insights.untitled') }}</NuxtLink>
              <span class="caption wb-mut">{{ tk.assignee_name ?? t('velocityB.insights.unassigned') }} · {{ tk.status }}</span>
            </span>
          </li>
        </ul>
        <p v-if="blocked.length > 8" class="caption wb-mut">{{ t('velocityB.insights.moreBlocked', { n: blocked.length - 8 }) }}</p>
      </template>
    </WbCard>

    <WbCard :title="t('velocityB.insights.overrunTitle')" :subtitle="t('velocityB.insights.overrunHint')">
      <p v-if="problematic.length === 0" class="wb-mut">{{ t('velocityB.insights.noOverrun') }}</p>
      <template v-else>
        <ul class="wb-list">
          <li v-for="tk in problematic.slice(0, 8)" :key="tk.id" class="small">
            <WbBadge :tone="overrunTone(tk.stuck_days, tk.expected_days)" size="sm">
              <span class="wb-num" :title="t('velocityB.insights.overrunTip', { now: tk.stuck_days, expected: tk.expected_days, pts: tk.estimate ?? '?' })">
                {{ t('velocityB.insights.daysOf', { n: tk.stuck_days, of: tk.expected_days }) }}
              </span>
            </WbBadge>
            <span class="wb-grow wb-ins-t">
              <NuxtLink :to="ticketLink(tk.id)"><span class="wb-mono">{{ tk.identifier ?? '?' }}</span> {{ tk.title ?? t('velocityB.insights.untitled') }}</NuxtLink>
              <span class="caption wb-mut">
                {{ tk.assignee_name ?? t('velocityB.insights.unassigned') }} · {{ tk.status }} ·
                {{ tk.estimate != null ? t('velocityB.insights.pts', { n: tk.estimate }) : t('velocityB.insights.noEstimate') }}
              </span>
            </span>
          </li>
        </ul>
        <p v-if="problematic.length > 8" class="caption wb-mut">{{ t('velocityB.insights.moreOverrun', { n: problematic.length - 8 }) }}</p>
      </template>
    </WbCard>
  </div>
</template>

<style scoped>
.wb-ins-t { display: flex; flex-direction: column; min-width: 0; }
.wb-ins-t a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
