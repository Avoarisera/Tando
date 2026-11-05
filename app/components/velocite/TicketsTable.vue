<script setup lang="ts">
export interface TicketRow {
  id: string
  identifier: string | null
  title: string | null
  estimate: number | null
  status: string | null
  started_at: string | null
  qa_started_at: string | null
  completed_at: string | null
  updated_at: string
  hasRework?: boolean
  cycle_dev_hours?: number | null
}

const props = defineProps<{ tickets: TicketRow[], isLoading: boolean }>()
const emit = defineEmits<{ 'ticket-click': [id: string] }>()
const { t, locale } = useI18n()
const tag = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

const PAGE_SIZE = 10
const page = ref(1)
watch(() => props.tickets, () => { page.value = 1 })
const totalPages = computed(() => Math.max(1, Math.ceil(props.tickets.length / PAGE_SIZE)))
const paginated = computed(() => props.tickets.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

function linearUrl(identifier: string | null): string {
  return identifier ? `https://linear.app/issue/${identifier}` : '#'
}
</script>

<template>
  <div>
    <div v-if="isLoading" class="wb-card-b"><WbSkeleton variant="table" :count="5" /></div>
    <p v-else-if="tickets.length === 0" class="wb-card-b wb-mut">{{ t('velocityB.tickets.empty') }}</p>
    <template v-else>
      <div class="wb-scroll wb-dt">
        <table>
          <caption class="wb-sr">{{ t('velocityB.tickets.caption') }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ t('velocityB.tickets.ticket') }}</th>
              <th scope="col">{{ t('velocityB.tickets.title') }}</th>
              <th scope="col" class="is-r">{{ t('velocityB.tickets.points') }}</th>
              <th scope="col">{{ t('velocityB.tickets.status') }}</th>
              <th scope="col" class="is-r">{{ t('velocityB.tickets.cycle') }}</th>
              <th scope="col"><span class="wb-sr">{{ t('velocityB.kpi.rework') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tk in paginated" :key="tk.id" class="wb-tk-row" @click="emit('ticket-click', tk.id)">
              <td>
                <a :href="linearUrl(tk.identifier)" target="_blank" rel="noopener noreferrer" class="wb-mono" @click.stop>{{ tk.identifier ?? '—' }}</a>
              </td>
              <td class="wb-tk-title">
                <button type="button" class="wb-tk-open" @click.stop="emit('ticket-click', tk.id)">{{ tk.title ?? '—' }}</button>
              </td>
              <td class="is-r wb-num">{{ tk.estimate ?? '—' }}</td>
              <td><WbBadge tone="success" size="sm">{{ tk.status }}</WbBadge></td>
              <td class="is-r wb-num">{{ velociteDuration(tk.cycle_dev_hours ?? null, tag) }}</td>
              <td>
                <WbBadge v-if="tk.hasRework" tone="danger" icon="undo-2" size="sm">
                  <span :title="t('velocityB.tickets.reworkTip')">{{ t('velocityB.kpi.rework') }}</span>
                </WbBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="totalPages > 1" class="wb-pg small wb-mut2">
        <span class="wb-num">{{ t('velocityB.tickets.page', { n: tickets.length, page, pages: totalPages }) }}</span>
        <div class="wb-row" style="gap: 4px">
          <WbButton variant="ghost" size="sm" icon="chevron-left" :disabled="page === 1" @click="page--">{{ t('velocityB.tickets.prev') }}</WbButton>
          <WbButton variant="ghost" size="sm" icon-right="chevron-right" :disabled="page === totalPages" @click="page++">{{ t('velocityB.tickets.next') }}</WbButton>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wb-tk-row { cursor: pointer; }
.wb-tk-title { max-width: 320px; }
.wb-tk-open { all: unset; cursor: pointer; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.wb-tk-open:focus-visible { outline: 2px solid var(--focus); }
</style>
