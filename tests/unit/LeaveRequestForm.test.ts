import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import LeaveRequestForm from '~/components/leave/LeaveRequestForm.vue'
import type { LeaveType } from '~/types/index'

// ── Mock useLeaveRequests ────────────────────────────────────────────────────

const { mockCreateRequest } = vi.hoisted(() => ({
  mockCreateRequest: vi.fn<() => Promise<string>>(),
}))

mockNuxtImport('useLeaveRequests', () => () => ({
  requests:            readonly(ref([])),
  isLoading:           readonly(ref(false)),
  error:               readonly(ref(null)),
  fetchRequests:       vi.fn().mockResolvedValue(undefined),
  createRequest:       mockCreateRequest,
  updateRequestStatus: vi.fn().mockResolvedValue(undefined),
}))

// ── Mock useToast ────────────────────────────────────────────────────────────

const { mockToastAdd } = vi.hoisted(() => ({
  mockToastAdd: vi.fn(),
}))

mockNuxtImport('useToast', () => () => ({
  toasts: readonly(ref([])),
  add:    mockToastAdd,
  remove: vi.fn(),
}))

// ── Sample fixtures ──────────────────────────────────────────────────────────

const ACTIVE_TYPES: LeaveType[] = [
  { id: 'lt-1', name: 'Congé payé',    color: '#4CAF50', is_active: true, created_at: '2026-01-01T00:00:00Z' },
  { id: 'lt-2', name: 'Congé maladie', color: '#F44336', is_active: true, created_at: '2026-01-02T00:00:00Z' },
]

const FUTURE_START = '2026-07-01'
const FUTURE_END   = '2026-07-05'
const PAST_DATE    = '2026-01-01'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function mountForm(leaveTypes: LeaveType[] = ACTIVE_TYPES) {
  return mountSuspended(LeaveRequestForm, {
    props: { leaveTypes },
  })
}

async function fillValidForm(
  wrapper: Awaited<ReturnType<typeof mountForm>>,
  opts: { start?: string; end?: string; typeId?: string } = {}
) {
  await wrapper.find('#leave-type').setValue(opts.typeId ?? ACTIVE_TYPES[0].id)
  await wrapper.find('#start-date').setValue(opts.start ?? FUTURE_START)
  await wrapper.find('#end-date').setValue(opts.end ?? FUTURE_END)
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LeaveRequestForm', () => {
  beforeEach(() => {
    mockCreateRequest.mockReset()
    mockToastAdd.mockReset()
    mockCreateRequest.mockResolvedValue('new-uuid')
  })

  // ── daysCount computed ─────────────────────────────────────────────────────

  describe('daysCount computed', () => {
    it('shows "Durée : 5 jours" for a 5-day range', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#start-date').setValue('2026-07-01')
      await wrapper.find('#end-date').setValue('2026-07-05')
      expect(wrapper.text()).toContain('5 jours')
    })

    it('shows singular "1 jour" for a same-day selection', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#start-date').setValue('2026-07-01')
      await wrapper.find('#end-date').setValue('2026-07-01')
      expect(wrapper.text()).toContain('1 jour')
      expect(wrapper.text()).not.toContain('1 jours')
    })

    it('shows nothing when end date is not set', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#start-date').setValue('2026-07-01')
      expect(wrapper.text()).not.toContain('Durée')
    })

    it('shows nothing when start date is not set', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#end-date').setValue('2026-07-05')
      expect(wrapper.text()).not.toContain('Durée')
    })

    it('shows nothing when end is before start (0 days guard)', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#start-date').setValue('2026-07-05')
      await wrapper.find('#end-date').setValue('2026-07-01')
      expect(wrapper.text()).not.toContain('Durée')
    })
  })

  // ── front validation: startDateError ──────────────────────────────────────

  describe('start date validation', () => {
    it('shows inline error when start date is in the past', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#start-date').setValue(PAST_DATE)
      expect(wrapper.find('#start-date-error').exists()).toBe(true)
      expect(wrapper.find('#start-date-error').text()).toContain('passé')
    })

    it('does NOT show start date error when date is today or future', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#start-date').setValue(FUTURE_START)
      expect(wrapper.find('#start-date-error').exists()).toBe(false)
    })

    it('start date input has aria-describedby pointing to error element', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#start-date').setValue(PAST_DATE)
      expect(wrapper.find('#start-date').attributes('aria-describedby')).toBe('start-date-error')
    })

    it('start date input has :min="today" attribute', async () => {
      const wrapper = await mountForm()
      const minAttr = wrapper.find('#start-date').attributes('min')
      // min must be a date string in YYYY-MM-DD format
      expect(minAttr).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  // ── front validation: endDateError ────────────────────────────────────────

  describe('end date validation', () => {
    it('shows inline error when end date is before start date', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#start-date').setValue(FUTURE_START)
      await wrapper.find('#end-date').setValue(PAST_DATE)
      expect(wrapper.find('#end-date-error').exists()).toBe(true)
      expect(wrapper.find('#end-date-error').text()).toContain('date de fin')
    })

    it('does NOT show end date error when end equals start', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#start-date').setValue(FUTURE_START)
      await wrapper.find('#end-date').setValue(FUTURE_START)
      expect(wrapper.find('#end-date-error').exists()).toBe(false)
    })

    it('end date input :min is set to startDate when start is filled', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#start-date').setValue(FUTURE_START)
      const minAttr = wrapper.find('#end-date').attributes('min')
      expect(minAttr).toBe(FUTURE_START)
    })
  })

  // ── isValid → submit button state ──────────────────────────────────────────

  describe('submit button disabled state', () => {
    it('is disabled when the form is empty', async () => {
      const wrapper = await mountForm()
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    })

    it('is disabled when only leave type is selected', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#leave-type').setValue(ACTIVE_TYPES[0].id)
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    })

    it('is disabled when start date is in the past', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#leave-type').setValue(ACTIVE_TYPES[0].id)
      await wrapper.find('#start-date').setValue(PAST_DATE)
      await wrapper.find('#end-date').setValue(FUTURE_END)
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    })

    it('is disabled when end is before start', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#leave-type').setValue(ACTIVE_TYPES[0].id)
      await wrapper.find('#start-date').setValue(FUTURE_END)
      await wrapper.find('#end-date').setValue(FUTURE_START)
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    })

    it('is enabled when all fields are valid', async () => {
      const wrapper = await mountForm()
      await fillValidForm(wrapper)
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
    })

    it('is disabled when leaveTypes prop is empty (no types available)', async () => {
      const wrapper = await mountForm([])
      // Even with dates filled, no types → isValid = false
      await wrapper.find('#start-date').setValue(FUTURE_START)
      await wrapper.find('#end-date').setValue(FUTURE_END)
      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    })
  })

  // ── empty types message ────────────────────────────────────────────────────

  it('shows "Aucun type de congé disponible" when leaveTypes is empty', async () => {
    const wrapper = await mountForm([])
    expect(wrapper.text()).toContain('Aucun type de congé disponible')
  })

  it('disables the select element when leaveTypes is empty', async () => {
    const wrapper = await mountForm([])
    expect(wrapper.find('#leave-type').attributes('disabled')).toBeDefined()
  })

  // ── comment field ──────────────────────────────────────────────────────────

  it('textarea has maxlength=500', async () => {
    const wrapper = await mountForm()
    expect(wrapper.find('#comment').attributes('maxlength')).toBe('500')
  })

  it('character counter shows current length / 500', async () => {
    const wrapper = await mountForm()
    await wrapper.find('#comment').setValue('Hello')
    expect(wrapper.text()).toContain('5/500')
  })

  // ── success path ────────────────────────────────────────────────────────────

  describe('successful submission', () => {
    it('calls createRequest with correct params', async () => {
      const wrapper = await mountForm()
      await fillValidForm(wrapper)
      await wrapper.find('form').trigger('submit')

      expect(mockCreateRequest).toHaveBeenCalledWith({
        leaveTypeId: ACTIVE_TYPES[0].id,
        startDate:   FUTURE_START,
        endDate:     FUTURE_END,
        comment:     null,
      })
    })

    it('calls createRequest with comment string when filled', async () => {
      const wrapper = await mountForm()
      await fillValidForm(wrapper)
      await wrapper.find('#comment').setValue('Vacances planifiées')
      await wrapper.find('form').trigger('submit')

      expect(mockCreateRequest).toHaveBeenCalledWith(
        expect.objectContaining({ comment: 'Vacances planifiées' })
      )
    })

    it('adds a success toast after successful submission', async () => {
      const wrapper = await mountForm()
      await fillValidForm(wrapper)
      await wrapper.find('form').trigger('submit')
      await nextTick()

      expect(mockToastAdd).toHaveBeenCalledWith('Demande créée avec succès')
    })

    it('emits "created" event after successful submission', async () => {
      const wrapper = await mountForm()
      await fillValidForm(wrapper)
      await wrapper.find('form').trigger('submit')
      await nextTick()

      expect(wrapper.emitted('created')).toHaveLength(1)
    })

    it('does NOT show formError after successful submission', async () => {
      const wrapper = await mountForm()
      await fillValidForm(wrapper)
      await wrapper.find('form').trigger('submit')
      await nextTick()

      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })
  })

  // ── error path (RPC errors stay inline) ───────────────────────────────────

  describe('server error handling', () => {
    it('displays formError inline when createRequest throws', async () => {
      mockCreateRequest.mockRejectedValue(
        new Error('Vous avez déjà une demande du 12/05/2026 au 16/05/2026 sur cette période')
      )

      const wrapper = await mountForm()
      await fillValidForm(wrapper)
      await wrapper.find('form').trigger('submit')
      await nextTick()

      const alert = wrapper.find('[role="alert"]')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain('Vous avez déjà une demande')
    })

    it('does NOT emit "created" when createRequest throws', async () => {
      mockCreateRequest.mockRejectedValue(new Error('Solde insuffisant'))

      const wrapper = await mountForm()
      await fillValidForm(wrapper)
      await wrapper.find('form').trigger('submit')
      await nextTick()

      expect(wrapper.emitted('created')).toBeFalsy()
    })

    it('does NOT call toast.add when createRequest throws (inline only)', async () => {
      mockCreateRequest.mockRejectedValue(new Error('Erreur serveur'))

      const wrapper = await mountForm()
      await fillValidForm(wrapper)
      await wrapper.find('form').trigger('submit')
      await nextTick()

      expect(mockToastAdd).not.toHaveBeenCalled()
    })

    it('formError has role="alert" for screen readers', async () => {
      mockCreateRequest.mockRejectedValue(new Error('Solde insuffisant'))

      const wrapper = await mountForm()
      await fillValidForm(wrapper)
      await wrapper.find('form').trigger('submit')
      await nextTick()

      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })
  })

  // ── cancel button ──────────────────────────────────────────────────────────

  it('emits "close" when Annuler is clicked', async () => {
    const wrapper = await mountForm()
    await wrapper.find('button[type="button"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('does NOT call createRequest when Annuler is clicked', async () => {
    const wrapper = await mountForm()
    await wrapper.find('button[type="button"]').trigger('click')
    expect(mockCreateRequest).not.toHaveBeenCalled()
  })
})
