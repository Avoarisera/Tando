import { describe, it, expect, beforeEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import InvoiceForm from '~/components/invoice/InvoiceForm.vue'

// InvoiceForm has no composable dependencies — props-driven component.

async function mountForm(props: { isSubmitting?: boolean; error?: string | null } = {}) {
  return mountSuspended(InvoiceForm, {
    props: {
      isSubmitting: props.isSubmitting ?? false,
      error:        props.error        ?? null,
    },
  })
}

async function fillRequired(wrapper: Awaited<ReturnType<typeof mountForm>>, overrides: {
  reference?:    string
  client?:       string
  amount?:       string
  invoiceDate?:  string
} = {}) {
  await wrapper.find('#inv-reference').setValue(overrides.reference    ?? 'FAC-TEST-001')
  await wrapper.find('#inv-client').setValue(overrides.client          ?? 'ACME Corp')
  await wrapper.find('#inv-amount').setValue(overrides.amount          ?? '1500')
  await wrapper.find('#inv-date').setValue(overrides.invoiceDate       ?? '2026-05-18')
}

describe('InvoiceForm', () => {
  // ── Field presence ──────────────────────────────────────────────────────────

  describe('renders all required fields', () => {
    it('has a reference text input', async () => {
      const wrapper = await mountForm()
      expect(wrapper.find('#inv-reference').exists()).toBe(true)
    })

    it('has a client text input', async () => {
      const wrapper = await mountForm()
      expect(wrapper.find('#inv-client').exists()).toBe(true)
    })

    it('has a numeric amount input', async () => {
      const wrapper = await mountForm()
      expect(wrapper.find('#inv-amount').attributes('type')).toBe('number')
    })

    it('has a currency select with EUR as default', async () => {
      const wrapper = await mountForm()
      const select = wrapper.find('#inv-currency')
      expect(select.exists()).toBe(true)
      expect((select.element as HTMLSelectElement).value).toBe('EUR')
    })

    it('has a date input for invoice_date', async () => {
      const wrapper = await mountForm()
      expect(wrapper.find('#inv-date').attributes('type')).toBe('date')
    })

    it('has a date input for due_date (optional)', async () => {
      const wrapper = await mountForm()
      expect(wrapper.find('#inv-due').exists()).toBe(true)
    })

    it('has a textarea for notes (optional)', async () => {
      const wrapper = await mountForm()
      expect(wrapper.find('#inv-notes').exists()).toBe(true)
    })
  })

  // ── Client-side validation ─────────────────────────────────────────────────

  describe('validate() — required fields', () => {
    it('shows "La référence est obligatoire" when reference is empty', async () => {
      const wrapper = await mountForm()
      await wrapper.find('form').trigger('submit')
      expect(wrapper.html()).toContain('La référence est obligatoire')
    })

    it('does not emit submit when reference is empty', async () => {
      const wrapper = await mountForm()
      await wrapper.find('form').trigger('submit')
      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('shows "Le client est obligatoire" when client is empty', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#inv-reference').setValue('FAC-X')
      await wrapper.find('form').trigger('submit')
      expect(wrapper.html()).toContain('Le client est obligatoire')
    })

    it('shows amount > 0 error when amount is 0', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#inv-reference').setValue('FAC-X')
      await wrapper.find('#inv-client').setValue('Test')
      await wrapper.find('#inv-amount').setValue('0')
      await wrapper.find('form').trigger('submit')
      expect(wrapper.html()).toContain('supérieur à 0')
    })

    it('shows amount > 0 error when amount is negative', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#inv-reference').setValue('FAC-X')
      await wrapper.find('#inv-client').setValue('Test')
      await wrapper.find('#inv-amount').setValue('-50')
      await wrapper.find('form').trigger('submit')
      expect(wrapper.html()).toContain('supérieur à 0')
    })

    it('shows "La date de facture est obligatoire" when invoice_date is empty', async () => {
      const wrapper = await mountForm()
      await wrapper.find('#inv-reference').setValue('FAC-X')
      await wrapper.find('#inv-client').setValue('Test')
      await wrapper.find('#inv-amount').setValue('100')
      await wrapper.find('form').trigger('submit')
      expect(wrapper.html()).toContain('La date de facture est obligatoire')
    })
  })

  // ── G1 fix: due_date < invoice_date validation ─────────────────────────────

  describe('validate() — due_date vs invoice_date (G1 fix)', () => {
    it('shows error when due_date is before invoice_date', async () => {
      const wrapper = await mountForm()
      await fillRequired(wrapper, { invoiceDate: '2026-05-18' })
      await wrapper.find('#inv-due').setValue('2026-05-10')
      await wrapper.find('form').trigger('submit')
      expect(wrapper.html()).toContain("La date d'échéance ne peut pas être avant la date de facture")
    })

    it('does not emit submit when due_date is before invoice_date', async () => {
      const wrapper = await mountForm()
      await fillRequired(wrapper, { invoiceDate: '2026-05-18' })
      await wrapper.find('#inv-due').setValue('2026-05-10')
      await wrapper.find('form').trigger('submit')
      expect(wrapper.emitted('submit')).toBeUndefined()
    })

    it('passes when due_date equals invoice_date', async () => {
      const wrapper = await mountForm()
      await fillRequired(wrapper, { invoiceDate: '2026-05-18' })
      await wrapper.find('#inv-due').setValue('2026-05-18')
      await wrapper.find('form').trigger('submit')
      expect(wrapper.html()).not.toContain("La date d'échéance ne peut pas être avant la date de facture")
      expect(wrapper.emitted('submit')).toBeDefined()
    })

    it('passes when due_date is after invoice_date', async () => {
      const wrapper = await mountForm()
      await fillRequired(wrapper, { invoiceDate: '2026-05-18' })
      await wrapper.find('#inv-due').setValue('2026-06-18')
      await wrapper.find('form').trigger('submit')
      expect(wrapper.html()).not.toContain("La date d'échéance ne peut pas être avant la date de facture")
      expect(wrapper.emitted('submit')).toBeDefined()
    })

    it('passes when due_date is empty (field is optional)', async () => {
      const wrapper = await mountForm()
      await fillRequired(wrapper)
      // due_date left empty
      await wrapper.find('form').trigger('submit')
      expect(wrapper.html()).not.toContain("La date d'échéance")
      expect(wrapper.emitted('submit')).toBeDefined()
    })
  })

  // ── Happy path submission ──────────────────────────────────────────────────

  describe('successful submission', () => {
    it('emits submit with the correct payload', async () => {
      const wrapper = await mountForm()
      await fillRequired(wrapper)
      await wrapper.find('form').trigger('submit')

      const [payload] = (wrapper.emitted('submit')![0] as [Record<string, unknown>])
      expect(payload.reference).toBe('FAC-TEST-001')
      expect(payload.client).toBe('ACME Corp')
      expect(payload.amount).toBe(1500)
      expect(payload.currency).toBe('EUR')
      expect(payload.invoice_date).toBe('2026-05-18')
    })

    it('defaults status to "en_attente"', async () => {
      const wrapper = await mountForm()
      await fillRequired(wrapper)
      await wrapper.find('form').trigger('submit')

      const [payload] = (wrapper.emitted('submit')![0] as [Record<string, unknown>])
      expect(payload.status).toBe('en_attente')
    })

    it('sends due_date as null when left empty', async () => {
      const wrapper = await mountForm()
      await fillRequired(wrapper)
      await wrapper.find('form').trigger('submit')

      const [payload] = (wrapper.emitted('submit')![0] as [Record<string, unknown>])
      expect(payload.due_date).toBeNull()
    })

    it('sends notes as null when left empty', async () => {
      const wrapper = await mountForm()
      await fillRequired(wrapper)
      await wrapper.find('form').trigger('submit')

      const [payload] = (wrapper.emitted('submit')![0] as [Record<string, unknown>])
      expect(payload.notes).toBeNull()
    })

    it('trims whitespace from reference and client', async () => {
      const wrapper = await mountForm()
      await fillRequired(wrapper, { reference: '  FAC-X  ', client: '  ACME  ' })
      await wrapper.find('form').trigger('submit')

      const [payload] = (wrapper.emitted('submit')![0] as [Record<string, unknown>])
      expect(payload.reference).toBe('FAC-X')
      expect(payload.client).toBe('ACME')
    })
  })

  // ── Server error display ───────────────────────────────────────────────────

  describe('server error prop', () => {
    it('displays the server error message when error prop is set', async () => {
      const wrapper = await mountForm({ error: 'Cette référence existe déjà' })
      expect(wrapper.html()).toContain('Cette référence existe déjà')
    })

    it('renders server error in a role="alert" element', async () => {
      const wrapper = await mountForm({ error: 'Erreur serveur' })
      const alerts = wrapper.findAll('[role="alert"]')
      const serverAlert = alerts.find(el => el.text().includes('Erreur serveur'))
      expect(serverAlert).toBeDefined()
    })
  })

  // ── isSubmitting state ──────────────────────────────────────────────────────

  describe('isSubmitting prop', () => {
    it('disables the submit button when isSubmitting is true', async () => {
      const wrapper = await mountForm({ isSubmitting: true })
      const submitBtn = wrapper.find('button[type="submit"]')
      expect(submitBtn.attributes('disabled')).toBeDefined()
    })

    it('shows "Enregistrement…" text when isSubmitting is true', async () => {
      const wrapper = await mountForm({ isSubmitting: true })
      expect(wrapper.html()).toContain('Enregistrement')
    })
  })

  // ── Cancel ─────────────────────────────────────────────────────────────────

  describe('cancel button', () => {
    it('emits "cancel" when the cancel button is clicked', async () => {
      const wrapper = await mountForm()
      const cancelBtn = wrapper.find('button[type="button"]')
      await cancelBtn.trigger('click')
      expect(wrapper.emitted('cancel')).toBeDefined()
    })
  })
})
