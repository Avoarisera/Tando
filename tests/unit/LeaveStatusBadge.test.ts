import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import LeaveStatusBadge from '~/components/leave/LeaveStatusBadge.vue'
import type { LeaveStatus } from '~/types/index'

const STATUS_CASES: Array<{
  status: LeaveStatus
  expectedLabel: string
  expectedBgClass: string
  expectedTextClass: string
}> = [
  { status: 'pending',          expectedLabel: 'En attente',     expectedBgClass: 'bg-gray-100',  expectedTextClass: 'text-gray-700' },
  { status: 'manager_approved', expectedLabel: 'Validé manager', expectedBgClass: 'bg-amber-100', expectedTextClass: 'text-amber-700' },
  { status: 'approved',         expectedLabel: 'Approuvé',        expectedBgClass: 'bg-green-100', expectedTextClass: 'text-green-700' },
  { status: 'rejected',         expectedLabel: 'Refusé',          expectedBgClass: 'bg-red-100',   expectedTextClass: 'text-red-700' },
]

describe('LeaveStatusBadge', () => {
  describe('renders correct label for each status', () => {
    for (const { status, expectedLabel } of STATUS_CASES) {
      it(`status "${status}" → label "${expectedLabel}"`, async () => {
        const wrapper = await mountSuspended(LeaveStatusBadge, { props: { status } })
        expect(wrapper.find('span').text()).toBe(expectedLabel)
      })
    }
  })

  describe('applies correct Tailwind classes for each status', () => {
    for (const { status, expectedBgClass, expectedTextClass } of STATUS_CASES) {
      it(`status "${status}" → bg="${expectedBgClass}" text="${expectedTextClass}"`, async () => {
        const wrapper = await mountSuspended(LeaveStatusBadge, { props: { status } })
        const span = wrapper.find('span')
        expect(span.classes()).toContain(expectedBgClass)
        expect(span.classes()).toContain(expectedTextClass)
      })
    }
  })

  describe('accessibility', () => {
    it('has a title attribute equal to the label text (not color-only indication)', async () => {
      const wrapper = await mountSuspended(LeaveStatusBadge, { props: { status: 'pending' } })
      expect(wrapper.find('span').attributes('title')).toBe('En attente')
    })

    it('has aria-label equal to the label text', async () => {
      const wrapper = await mountSuspended(LeaveStatusBadge, { props: { status: 'approved' } })
      expect(wrapper.find('span').attributes('aria-label')).toBe('Approuvé')
    })

    it('title and aria-label are consistent for all statuses', async () => {
      for (const { status } of STATUS_CASES) {
        const wrapper = await mountSuspended(LeaveStatusBadge, { props: { status } })
        const span = wrapper.find('span')
        expect(span.attributes('title')).toBe(span.attributes('aria-label'))
      }
    })
  })

  describe('layout', () => {
    it('renders a single inline-flex span element', async () => {
      const wrapper = await mountSuspended(LeaveStatusBadge, { props: { status: 'pending' } })
      expect(wrapper.find('span').classes()).toContain('inline-flex')
    })

    it('applies rounded-full for pill shape', async () => {
      const wrapper = await mountSuspended(LeaveStatusBadge, { props: { status: 'pending' } })
      expect(wrapper.find('span').classes()).toContain('rounded-full')
    })

    it('text is font-medium', async () => {
      const wrapper = await mountSuspended(LeaveStatusBadge, { props: { status: 'pending' } })
      expect(wrapper.find('span').classes()).toContain('font-medium')
    })
  })
})
