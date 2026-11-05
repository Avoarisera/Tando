import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AppToast from '~/components/app/AppToast.vue'

describe('AppToast', () => {
  // --- Rendering ---

  it('renders the message text', async () => {
    const wrapper = await mountSuspended(AppToast, {
      props: { id: 'id-1', message: 'Demande approuvée', type: 'success' },
    })
    expect(wrapper.text()).toContain('Demande approuvée')
  })

  // --- Accessibility ---

  it('root element has role="alert"', async () => {
    const wrapper = await mountSuspended(AppToast, {
      props: { id: 'id-1', message: 'Test', type: 'success' },
    })
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  it('success toast has aria-live="polite"', async () => {
    const wrapper = await mountSuspended(AppToast, {
      props: { id: 'id-1', message: 'OK', type: 'success' },
    })
    expect(wrapper.find('[role="alert"]').attributes('aria-live')).toBe('polite')
  })

  it('error toast has aria-live="assertive"', async () => {
    const wrapper = await mountSuspended(AppToast, {
      props: { id: 'id-2', message: 'Erreur', type: 'error' },
    })
    expect(wrapper.find('[role="alert"]').attributes('aria-live')).toBe('assertive')
  })

  it('dismiss button has aria-label="Fermer la notification"', async () => {
    const wrapper = await mountSuspended(AppToast, {
      props: { id: 'id-1', message: 'OK', type: 'success' },
    })
    expect(wrapper.find('button[aria-label="Fermer la notification"]').exists()).toBe(true)
  })

  // --- Styling by type ---

  it('success toast uses the design-system toast with the success icon', async () => {
    const wrapper = await mountSuspended(AppToast, {
      props: { id: 'id-1', message: 'OK', type: 'success' },
    })
    const root = wrapper.find('[role="alert"]')
    expect(root.classes()).toEqual(expect.arrayContaining(['wb-toast', 'is-success']))
    expect(root.find('svg.wb-ic').exists()).toBe(true)
  })

  it('error toast uses the danger tone', async () => {
    const wrapper = await mountSuspended(AppToast, {
      props: { id: 'id-2', message: 'Erreur', type: 'error' },
    })
    expect(wrapper.find('[role="alert"]').classes()).toEqual(expect.arrayContaining(['wb-toast', 'is-danger']))
  })

  // --- Dismiss emit ---

  it('clicking the dismiss button emits "dismiss" with the toast id', async () => {
    const wrapper = await mountSuspended(AppToast, {
      props: { id: 'toast-abc', message: 'OK', type: 'success' },
    })
    await wrapper.find('button[aria-label="Fermer la notification"]').trigger('click')
    const emitted = wrapper.emitted('dismiss')
    expect(emitted).toHaveLength(1)
    expect(emitted![0]).toEqual(['toast-abc'])
  })

  it('dismiss emit carries the exact id prop, not a generated value', async () => {
    const wrapper = await mountSuspended(AppToast, {
      props: { id: 'my-specific-id', message: 'Msg', type: 'error' },
    })
    await wrapper.find('button[aria-label="Fermer la notification"]').trigger('click')
    expect(wrapper.emitted('dismiss')![0]).toEqual(['my-specific-id'])
  })
})
