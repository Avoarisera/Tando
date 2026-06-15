import { describe, it, expect, afterEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AppConfirmModal from '~/components/app/AppConfirmModal.vue'

const DEFAULT_PROPS = {
  title: 'Confirmer ?',
  description: 'Cette action est irréversible.',
}

describe('AppConfirmModal', () => {
  let wrapper: Awaited<ReturnType<typeof mountSuspended>>

  afterEach(() => {
    wrapper?.unmount() // removes AppModal's global keydown listener
  })

  // --- Rendering ---

  it('renders title and description from props', async () => {
    wrapper = await mountSuspended(AppConfirmModal, { props: DEFAULT_PROPS })
    expect(wrapper.text()).toContain('Confirmer ?')
    expect(wrapper.text()).toContain('Cette action est irréversible.')
  })

  it('defaults button labels to "Confirmer" and "Annuler"', async () => {
    wrapper = await mountSuspended(AppConfirmModal, { props: DEFAULT_PROPS })
    expect(wrapper.text()).toContain('Confirmer')
    expect(wrapper.text()).toContain('Annuler')
  })

  it('overrides button labels via confirmLabel and cancelLabel props', async () => {
    wrapper = await mountSuspended(AppConfirmModal, {
      props: { ...DEFAULT_PROPS, confirmLabel: 'Approuver', cancelLabel: 'Non merci' },
    })
    expect(wrapper.text()).toContain('Approuver')
    expect(wrapper.text()).toContain('Non merci')
  })

  // --- Confirm action ---

  it('clicking "Confirmer" emits "confirm"', async () => {
    wrapper = await mountSuspended(AppConfirmModal, { props: DEFAULT_PROPS })
    const confirmBtn = wrapper.findAll('button').find(b => b.text().includes('Confirmer'))!
    await confirmBtn.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('clicking "Confirmer" shows spinner and "En cours…" text', async () => {
    wrapper = await mountSuspended(AppConfirmModal, { props: DEFAULT_PROPS })
    const confirmBtn = wrapper.findAll('button').find(b => b.text().includes('Confirmer'))!
    await confirmBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.animate-spin').exists()).toBe(true)
    expect(wrapper.text()).toContain('En cours…')
  })

  it('confirm button is disabled after clicking "Confirmer"', async () => {
    wrapper = await mountSuspended(AppConfirmModal, { props: DEFAULT_PROPS })
    const confirmBtn = wrapper.findAll('button').find(b => b.text().includes('Confirmer'))!
    await confirmBtn.trigger('click')
    await wrapper.vm.$nextTick()
    const spinnerBtn = wrapper.findAll('button').find(b => b.text().includes('En cours'))!
    expect(spinnerBtn.attributes('disabled')).toBeDefined()
  })

  // --- Cancel action ---

  it('clicking "Annuler" emits "cancel"', async () => {
    wrapper = await mountSuspended(AppConfirmModal, { props: DEFAULT_PROPS })
    const cancelBtn = wrapper.findAll('button').find(b => b.text().includes('Annuler'))!
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('isConfirming resets to false when "Annuler" is clicked after "Confirmer"', async () => {
    wrapper = await mountSuspended(AppConfirmModal, { props: DEFAULT_PROPS })

    const confirmBtn = wrapper.findAll('button').find(b => b.text().includes('Confirmer'))!
    await confirmBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.animate-spin').exists()).toBe(true)

    const cancelBtn = wrapper.findAll('button').find(b => b.text().includes('Annuler'))!
    await cancelBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.animate-spin').exists()).toBe(false)
    expect(wrapper.text()).toContain('Confirmer')
  })

  // --- Escape key (wired via AppModal @close → handleCancel) ---

  it('pressing Escape emits "cancel"', async () => {
    wrapper = await mountSuspended(AppConfirmModal, { props: DEFAULT_PROPS })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('pressing Escape after "Confirmer" also resets spinner', async () => {
    wrapper = await mountSuspended(AppConfirmModal, { props: DEFAULT_PROPS })
    const confirmBtn = wrapper.findAll('button').find(b => b.text().includes('Confirmer'))!
    await confirmBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.animate-spin').exists()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.animate-spin').exists()).toBe(false)
  })
})
