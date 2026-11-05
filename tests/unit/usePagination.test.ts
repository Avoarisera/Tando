import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import WbTableFooter from '~/components/wb/WbTableFooter.vue'

describe('usePagination', () => {
  it('slices the list and gives the range', () => {
    const list = ref(Array.from({ length: 45 }, (_, i) => i))
    const p = usePagination(list, 20)
    expect(p.pages.value).toBe(3)
    expect(p.items.value).toHaveLength(20)
    p.page.value = 3
    expect(p.items.value).toEqual([40, 41, 42, 43, 44])
    expect([p.from.value, p.to.value]).toEqual([41, 45])
  })

  it('goes back into range when the list shrinks', async () => {
    const list = ref(Array.from({ length: 45 }, (_, i) => i))
    const p = usePagination(list, 20)
    p.page.value = 3
    list.value = list.value.slice(0, 10)
    await nextTick()
    expect(p.page.value).toBe(1)
  })

  it('jumps to the page holding an index', () => {
    const p = usePagination(ref(Array.from({ length: 45 }, (_, i) => i)), 20)
    p.showIndex(41)
    expect(p.page.value).toBe(3)
    p.showIndex(-1)
    expect(p.page.value).toBe(3)
  })
})

describe('WbTableFooter', () => {
  it('shows only the count on a single page', async () => {
    const w = await mountSuspended(WbTableFooter, { props: { total: 5, page: 1, pageSize: 20 } })
    expect(w.text()).toContain('5 résultats')
    expect(w.find('nav').exists()).toBe(false)
  })

  it('shows the range and pages, and emits the chosen page', async () => {
    const w = await mountSuspended(WbTableFooter, { props: { total: 45, page: 1, pageSize: 20 } })
    expect(w.text()).toContain('1–20 sur 45 résultats')
    const btns = w.findAll('nav button')
    expect(btns[0]!.attributes('disabled')).toBeDefined()
    expect(w.find('[aria-current="page"]').text()).toBe('1')
    await w.findAll('.wb-tf-p')[2]!.trigger('click')
    expect(w.emitted('update:page')?.[0]).toEqual([3])
  })
})
