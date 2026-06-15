import { describe, it, expect, afterEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AppModal from '~/components/app/AppModal.vue'

describe('AppModal', () => {
  let wrapper: Awaited<ReturnType<typeof mountSuspended>>

  afterEach(() => {
    wrapper?.unmount() // removes global keydown listener added in onMounted
  })

  // --- Rendering ---

  it('renders title in h2#modal-title', async () => {
    wrapper = await mountSuspended(AppModal, { props: { title: 'Titre du modal' } })
    expect(wrapper.find('#modal-title').text()).toBe('Titre du modal')
  })

  it('defaults inner panel to max-w-lg when maxWidth is not provided', async () => {
    wrapper = await mountSuspended(AppModal, { props: { title: 'Test' } })
    expect(wrapper.find('[role="dialog"]').classes()).toContain('max-w-lg')
  })

  it('applies custom maxWidth class to the dialog panel', async () => {
    wrapper = await mountSuspended(AppModal, { props: { title: 'Test', maxWidth: 'max-w-2xl' } })
    expect(wrapper.find('[role="dialog"]').classes()).toContain('max-w-2xl')
  })

  it('renders slot content inside the panel', async () => {
    wrapper = await mountSuspended(AppModal, {
      props: { title: 'With Slot' },
      slots: { default: '<p id="slot-content">Mon contenu</p>' },
    })
    expect(wrapper.find('#slot-content').exists()).toBe(true)
    expect(wrapper.find('#slot-content').text()).toBe('Mon contenu')
  })

  // --- Accessibility ---

  it('dialog panel has role="dialog", aria-modal="true", aria-labelledby="modal-title"', async () => {
    wrapper = await mountSuspended(AppModal, { props: { title: 'Accessible' } })
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBe('modal-title')
  })

  it('close button has aria-label="Fermer"', async () => {
    wrapper = await mountSuspended(AppModal, { props: { title: 'Test' } })
    expect(wrapper.find('button[aria-label="Fermer"]').exists()).toBe(true)
  })

  // --- Close button emit ---

  it('clicking the ✕ close button emits "close"', async () => {
    wrapper = await mountSuspended(AppModal, { props: { title: 'Test' } })
    await wrapper.find('button[aria-label="Fermer"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  // --- Escape key ---

  it('pressing Escape emits "close" via the document keydown listener', async () => {
    wrapper = await mountSuspended(AppModal, { props: { title: 'Test' } })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('pressing a non-Escape key does not emit "close"', async () => {
    wrapper = await mountSuspended(AppModal, { props: { title: 'Test' } })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  // --- Backdrop click (click.self) ---

  it('clicking the backdrop overlay emits "close"', async () => {
    wrapper = await mountSuspended(AppModal, { props: { title: 'Test' } })
    // The backdrop is the root div (.fixed.inset-0); @click.self fires when target === element
    await wrapper.find('.fixed.inset-0').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('clicking inside the dialog panel does not emit "close" (click.self guard)', async () => {
    wrapper = await mountSuspended(AppModal, { props: { title: 'Test' } })
    // Event target is the panel, not the backdrop → @click.self on backdrop does not fire
    await wrapper.find('[role="dialog"]').trigger('click')
    expect(wrapper.emitted('close')).toBeFalsy()
  })
})
