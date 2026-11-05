<script setup lang="ts">
/**
 * Footer shared by every data table: result count on the left,
 * page navigation on the right when there is more than one page.
 */
const props = withDefaults(defineProps<{
  total: number
  pageSize?: number
  label?: string
}>(), { pageSize: 20, label: undefined })
const page = defineModel<number>('page', { default: 1 })
const { t } = useI18n()

const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const from = computed(() => (props.total ? (page.value - 1) * props.pageSize + 1 : 0))
const to = computed(() => Math.min(page.value * props.pageSize, props.total))

const countText = computed(() => (pages.value > 1
  ? t('table.range', { from: from.value, to: to.value, n: props.total }, props.total)
  : t('table.count', { n: props.total }, props.total)))

// 1 … 4 5 6 … 12 — always the first, last and two around the current page
const items = computed<(number | 'gap')[]>(() => {
  const n = pages.value
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1)
  const p = page.value
  const set = [...new Set([1, n, p - 1, p, p + 1].filter(x => x >= 1 && x <= n))].sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  set.forEach((x, i) => {
    if (i && x - set[i - 1]! > 1) out.push('gap')
    out.push(x)
  })
  return out
})

function go(p: number) {
  page.value = Math.min(Math.max(1, p), pages.value)
}
</script>

<template>
  <div class="wb-tf small">
    <span class="wb-mut2 wb-num wb-tf-count" aria-live="polite">{{ countText }}</span>
    <nav v-if="pages > 1" class="wb-tf-nav" :aria-label="label ?? t('table.pagination')">
      <WbButton variant="ghost" size="sm" icon="chevron-left" icon-only :disabled="page <= 1" @click="go(page - 1)">{{ t('table.prev') }}</WbButton>
      <template v-for="(it, i) in items" :key="i">
        <span v-if="it === 'gap'" class="wb-tf-gap" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          :class="['wb-tf-p wb-num', { 'is-on': it === page }]"
          :aria-current="it === page ? 'page' : undefined"
          :aria-label="t('table.page', { n: it })"
          @click="go(it)"
        >{{ it }}</button>
      </template>
      <WbButton variant="ghost" size="sm" icon="chevron-right" icon-only :disabled="page >= pages" @click="go(page + 1)">{{ t('table.next') }}</WbButton>
    </nav>
  </div>
</template>

<style scoped>
.wb-tf { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); flex-wrap: wrap; padding: var(--space-2) var(--space-4); border-top: 1px solid var(--border); background: var(--surface); min-height: 48px; }
.wb-tf-nav { display: flex; align-items: center; gap: 2px; }
.wb-tf-nav :deep(.wb-btn) { margin: 0; flex: none; }
.wb-tf-p { all: unset; box-sizing: border-box; display: inline-grid; place-items: center; min-width: 32px; height: 32px; padding: 0 6px; border-radius: var(--radius-md); color: var(--ink-2); font-weight: 550; cursor: pointer; }
.wb-tf-p:hover { background: var(--surface-2); }
.wb-tf-p:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.wb-tf-p.is-on { background: var(--brand-tint); color: var(--brand-text); font-weight: 650; }
.wb-tf-gap { min-width: 20px; text-align: center; color: var(--ink-3); }
@container wbapp (max-width: 767px) {
  .wb-tf { justify-content: center; padding: var(--space-2) var(--space-3); }
  .wb-tf-p { min-width: 40px; height: 40px; }
}
</style>
