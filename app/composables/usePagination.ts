import type { ComputedRef, Ref } from 'vue'

/**
 * Client-side pagination for a list shown in a table.
 * The page goes back into range when the list shrinks (filter, delete).
 */
export function usePagination<T>(source: Readonly<Ref<readonly T[]>> | ComputedRef<readonly T[]>, size = 20) {
  const page = ref(1)
  const pageSize = ref(size)
  const total = computed(() => source.value.length)
  const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
  const items = computed(() => source.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
  const from = computed(() => (total.value ? (page.value - 1) * pageSize.value + 1 : 0))
  const to = computed(() => Math.min(page.value * pageSize.value, total.value))

  watch(pages, (n) => { if (page.value > n) page.value = n })

  /** Shows the page that holds the item at `index` (e.g. a row just added) */
  function showIndex(index: number) {
    if (index >= 0) page.value = Math.floor(index / pageSize.value) + 1
  }

  return { page, pageSize, total, pages, items, from, to, showIndex }
}
