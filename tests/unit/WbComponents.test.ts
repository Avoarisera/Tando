import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import WbButton from '~/components/wb/WbButton.vue'
import WbInput from '~/components/wb/WbInput.vue'
import WbBanner from '~/components/wb/WbBanner.vue'
import WbIcon from '~/components/wb/WbIcon.vue'
import WbCapacityGauge from '~/components/wb/WbCapacityGauge.vue'

describe('WbIcon', () => {
  it('renders the Lucide paths of a known icon', async () => {
    const w = await mountSuspended(WbIcon, { props: { name: 'eye', size: 20 } })
    expect(w.find('svg').attributes('width')).toBe('20')
    expect(w.find('svg').html()).toContain('<path')
  })
  it('renders nothing for an unknown icon', async () => {
    const w = await mountSuspended(WbIcon, { props: { name: 'nope' } })
    expect(w.find('svg').exists()).toBe(false)
  })
})

describe('WbButton', () => {
  it('applies variant, size and block classes', async () => {
    const w = await mountSuspended(WbButton, { props: { variant: 'secondary', size: 'lg', block: true }, slots: { default: 'Go' } })
    const cls = w.find('button').classes()
    expect(cls).toEqual(expect.arrayContaining(['wb-btn', 'wb-btn-secondary', 'wb-btn-lg', 'wb-btn-block']))
    expect(w.text()).toBe('Go')
  })
  it('is disabled and busy while loading', async () => {
    const w = await mountSuspended(WbButton, { props: { loading: true }, slots: { default: 'Go' } })
    expect(w.find('button').attributes('disabled')).toBeDefined()
    expect(w.find('button').attributes('aria-busy')).toBe('true')
    expect(w.find('.wb-spin').exists()).toBe(true)
  })
  it('keeps an accessible name when icon-only', async () => {
    const w = await mountSuspended(WbButton, { props: { iconOnly: true, icon: 'eye' }, slots: { default: 'Show' } })
    expect(w.find('.wb-sr').text()).toBe('Show')
  })
})

describe('WbInput', () => {
  it('links the label to the input and updates v-model', async () => {
    const w = await mountSuspended(WbInput, { props: { id: 'mail', label: 'E-mail', modelValue: '' } })
    expect(w.find('label').attributes('for')).toBe('mail')
    await w.find('input').setValue('a@b.eu')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['a@b.eu'])
  })
  it('shows the error and marks the input invalid', async () => {
    const w = await mountSuspended(WbInput, { props: { id: 'pw', label: 'Mot de passe', error: 'Trop court' } })
    expect(w.find('.wb-field').classes()).toContain('is-err')
    expect(w.find('input').attributes('aria-invalid')).toBe('true')
    expect(w.find('input').attributes('aria-describedby')).toBe('pw-h')
    expect(w.text()).toContain('Trop court')
  })
})

describe('WbBanner', () => {
  it('uses role alert for danger and status otherwise', async () => {
    const d = await mountSuspended(WbBanner, { props: { tone: 'danger' }, slots: { default: 'Oups' } })
    expect(d.find('[role="alert"]').exists()).toBe(true)
    const i = await mountSuspended(WbBanner, { props: { tone: 'info' }, slots: { default: 'Info' } })
    expect(i.find('[role="status"]').exists()).toBe(true)
  })
})

describe('WbCapacityGauge', () => {
  it('fills to 80 % at max and caps at 125 %', async () => {
    const full = await mountSuspended(WbCapacityGauge, { props: { value: 4, max: 4, label: 'Force' } })
    expect(full.find('.wb-gauge-t span').attributes('style')).toContain('width: 80%')
    const over = await mountSuspended(WbCapacityGauge, { props: { value: 10, max: 4, label: 'Charge', state: 'over' } })
    expect(over.find('.wb-gauge-t span').attributes('style')).toContain('width: 100%')
    expect(over.find('.wb-fill-danger').exists()).toBe(true)
  })
})
