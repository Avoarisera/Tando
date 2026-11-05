import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import InvoiceStatusBadge from '~/components/invoice/InvoiceStatusBadge.vue'
import type { InvoiceStatus } from '~/types/index'

// Design system tones: pending neutral, sent info, paid success
const CASES: Array<{ status: InvoiceStatus, label: string, tone: string }> = [
  { status: 'en_attente', label: 'En attente', tone: 'wb-t-neutral' },
  { status: 'envoyee',    label: 'Envoyée',    tone: 'wb-t-info' },
  { status: 'payee',      label: 'Payée',      tone: 'wb-t-success' },
]

describe('InvoiceStatusBadge', () => {
  for (const { status, label, tone } of CASES) {
    it(`status "${status}" → "${label}" with ${tone}`, async () => {
      const wrapper = await mountSuspended(InvoiceStatusBadge, { props: { status } })
      expect(wrapper.text()).toBe(label)
      expect(wrapper.find('.wb-badge').classes()).toContain(tone)
    })
  }

  it('shows an icon next to the label (colour is never the only signal)', async () => {
    const wrapper = await mountSuspended(InvoiceStatusBadge, { props: { status: 'payee' } })
    expect(wrapper.find('svg.wb-ic').exists()).toBe(true)
  })
})
