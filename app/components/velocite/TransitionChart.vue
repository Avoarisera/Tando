<script setup lang="ts">
interface TicketRef { id: string, identifier: string | null, title: string | null }

const props = defineProps<{
  transitions: { from_status: string, to_status: string, count: number, tickets: TicketRef[] }[]
  workspaceId: string
}>()
const emit = defineEmits<{ 'ticket-click': [ticketId: string] }>()
const { t } = useI18n()

const expanded = ref<string | null>(null)
const maxCount = computed(() => Math.max(...props.transitions.map(x => x.count), 1))
const key = (x: { from_status: string, to_status: string }) => `${x.from_status}|||${x.to_status}`
function toggle(x: { from_status: string, to_status: string }) {
  expanded.value = expanded.value === key(x) ? null : key(x)
}
</script>

<template>
  <ul class="wb-stack-s wb-tr">
    <li v-for="(x, i) in transitions" :key="i">
      <button type="button" class="wb-tr-row" :aria-expanded="expanded === key(x)" @click="toggle(x)">
        <span class="wb-tr-l small">
          <b>{{ x.from_status }}</b>
          <span class="caption wb-c-danger">{{ t('velocityB.transitions.backTo', { to: x.to_status }) }}</span>
        </span>
        <span class="wb-gauge-t wb-grow"><span class="wb-fill-danger" :style="{ width: `${Math.round((x.count / maxCount) * 100)}%` }" /></span>
        <b class="small wb-num wb-c-danger">{{ x.count }}×</b>
        <WbIcon name="chevron-down" :class="{ 'wb-tr-up': expanded === key(x) }" :size="14" />
      </button>
      <ul v-if="expanded === key(x)" class="wb-tr-tk">
        <li v-for="tk in x.tickets" :key="tk.id">
          <button type="button" class="wb-tr-open small" @click.stop="emit('ticket-click', tk.id)">
            <span class="wb-mono">{{ tk.identifier ?? tk.id.slice(0, 8) }}</span> {{ tk.title ?? '—' }}
          </button>
        </li>
      </ul>
    </li>
  </ul>
</template>

<style scoped>
.wb-tr { list-style: none; margin: 0; padding: 0; }
.wb-tr-row { all: unset; box-sizing: border-box; cursor: pointer; display: flex; gap: var(--space-3); align-items: center; width: 100%; padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); }
.wb-tr-row:hover { background: var(--surface-2); }
.wb-tr-row:focus-visible { outline: 2px solid var(--focus); }
.wb-tr-l { display: flex; flex-direction: column; width: 200px; flex: none; text-align: right; }
.wb-tr-tk { list-style: none; margin: 0 0 var(--space-2) var(--space-4); padding-left: var(--space-4); border-left: 2px solid var(--danger-border); }
.wb-tr-open { all: unset; cursor: pointer; display: block; padding: 2px 0; }
.wb-tr-open:hover { text-decoration: underline; }
.wb-tr-up { transform: rotate(180deg); }
</style>
