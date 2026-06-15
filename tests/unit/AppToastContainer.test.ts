import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AppToastContainer from '~/components/app/AppToastContainer.vue'

type ToastState = Array<{ id: string; message: string; type: 'success' | 'error' }>

describe('AppToastContainer', () => {
  let wrapper: Awaited<ReturnType<typeof mountSuspended>>

  beforeEach(() => {
    vi.useFakeTimers()
    useState<ToastState>('toasts').value = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    // Unmounting removes Teleport content from document.body
    wrapper?.unmount()
  })

  // AppToastContainer uses <Teleport to="body">, so rendered content lives in
  // document.body — not inside the wrapper. Query the DOM directly.

  it('renders no toast cards when state is empty', async () => {
    wrapper = await mountSuspended(AppToastContainer)
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0)
  })

  it('renders one toast card per toast in state', async () => {
    useState<ToastState>('toasts').value = [
      { id: 'a', message: 'Toast 1', type: 'success' },
      { id: 'b', message: 'Toast 2', type: 'error' },
    ]
    wrapper = await mountSuspended(AppToastContainer)
    await wrapper.vm.$nextTick()
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(2)
  })

  it('renders message text from state', async () => {
    useState<ToastState>('toasts').value = [
      { id: 'x', message: 'Visible message', type: 'success' },
    ]
    wrapper = await mountSuspended(AppToastContainer)
    await wrapper.vm.$nextTick()
    const alert = document.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Visible message')
  })

  it('dismiss button click removes the toast from state', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'dismiss-test' })
    const { add } = useToast()
    add('À fermer', 'error')

    wrapper = await mountSuspended(AppToastContainer)
    await wrapper.vm.$nextTick()
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1)

    const btn = document.querySelector('button[aria-label="Fermer la notification"]') as HTMLElement
    btn.click()
    await wrapper.vm.$nextTick()
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0)
  })

  it('container has fixed bottom-right positioning classes in document.body', async () => {
    wrapper = await mountSuspended(AppToastContainer)
    const container = document.querySelector('.fixed.bottom-4.right-4')
    expect(container).not.toBeNull()
    expect(container?.classList.contains('bottom-4')).toBe(true)
    expect(container?.classList.contains('right-4')).toBe(true)
  })

  // NOTE: TransitionGroup CSS animation tests (opacity/transform states) are intentionally
  // skipped — happy-dom does not compute CSS. The <style> block is verified by static analysis.
})
