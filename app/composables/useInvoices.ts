import type { Invoice, InvoiceStatus } from '~/types/index'
import type { InvoiceLineInput } from '~/utils/invoice-totals'

export interface CompanyInfo {
  legal_name: string
  address: string
  vat_number: string
  iban: string
  bic: string
  invoice_footer: string
}

export function useInvoices() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const invoices = useState<Invoice[]>('invoices', () => [])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchInvoices() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: sbError } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
      if (sbError) throw sbError
      invoices.value = (data ?? []) as Invoice[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur lors du chargement des factures'
    } finally {
      isLoading.value = false
    }
  }

  async function createInvoice(
    payload: Omit<Invoice, 'id' | 'created_at' | 'created_by' | 'pdf_path'>,
  ): Promise<void> {
    const { error: sbError } = await supabase
      .from('invoices')
      .insert({ ...payload, created_by: (user.value?.sub as string | undefined) ?? null })
    if (sbError) throw sbError
    await fetchInvoices()
  }

  /**
   * Editor flow (R8-G): reserve the next reference unless one is typed, then
   * save the invoice and its lines. Returns the saved invoice.
   */
  async function createInvoiceWithLines(
    payload: Omit<Invoice, 'id' | 'created_at' | 'created_by' | 'pdf_path' | 'reference'> & { reference: string | null },
    lines: readonly InvoiceLineInput[],
  ): Promise<Invoice> {
    const manual = payload.reference?.trim() || null
    // Automatic numbering may meet references typed by hand earlier: on a
    // duplicate (23505), take the next number, up to 50 times.
    let inv: Invoice | null = null
    for (let attempt = 0; attempt < (manual ? 1 : 50) && !inv; attempt++) {
      let reference = manual
      if (!reference) {
        const { data, error: refError } = await supabase.rpc('claim_invoice_reference')
        if (refError) throw refError
        reference = data as string
      }
      const { data, error: insError } = await supabase
        .from('invoices')
        .insert({ ...payload, reference, created_by: (user.value?.sub as string | undefined) ?? null })
        .select('*')
        .single()
      if (insError && !(insError.code === '23505' && !manual)) throw insError
      if (data) inv = data as Invoice
    }
    if (!inv) throw new Error('Impossible d’attribuer un numéro de facture libre')
    const { error: linesError } = await supabase.from('invoice_lines').insert(
      lines.map((l, i) => ({ invoice_id: inv.id, position: i, description: l.description.trim(), quantity: l.quantity, unit_price: l.unit_price, vat_rate: l.vat_rate })),
    )
    if (linesError) throw linesError
    invoices.value = [inv, ...invoices.value]
    return inv
  }

  async function fetchCompany(): Promise<CompanyInfo> {
    const { data, error: sbError } = await supabase
      .from('company_settings')
      .select('legal_name, address, vat_number, iban, bic, invoice_footer')
      .maybeSingle()
    if (sbError) throw sbError
    return data ?? { legal_name: '', address: '', vat_number: '', iban: '', bic: '', invoice_footer: '' }
  }

  async function updateStatus(id: string, status: InvoiceStatus): Promise<void> {
    const { error: sbError } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', id)
    if (sbError) throw sbError
    const idx = invoices.value.findIndex(i => i.id === id)
    if (idx !== -1) {
      invoices.value = invoices.value.map((inv, i) =>
        i === idx ? { ...inv, status } : inv,
      )
    }
  }

  async function uploadPdf(invoiceId: string, file: File): Promise<void> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${invoiceId}/${safeName}`
    const { error: upError } = await supabase.storage
      .from('invoices')
      .upload(path, file, { contentType: 'application/pdf', upsert: true })
    if (upError) throw upError
    const { error: dbError } = await supabase
      .from('invoices')
      .update({ pdf_path: path })
      .eq('id', invoiceId)
    if (dbError) throw dbError
    const idx = invoices.value.findIndex(i => i.id === invoiceId)
    if (idx !== -1) {
      invoices.value = invoices.value.map((inv, i) =>
        i === idx ? { ...inv, pdf_path: path } : inv,
      )
    }
  }

  async function getSignedUrl(path: string): Promise<string> {
    const { data, error: signError } = await supabase.storage
      .from('invoices')
      .createSignedUrl(path, 60)
    if (signError) {
      // The row points to a file that is not in the bucket (TND-16)
      if (/not found/i.test(signError.message)) {
        throw new Error('Fichier PDF introuvable — utilisez « Remplacer » pour le joindre à nouveau')
      }
      throw signError
    }
    return data.signedUrl
  }

  return {
    invoices: readonly(invoices),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchInvoices,
    createInvoice,
    createInvoiceWithLines,
    fetchCompany,
    updateStatus,
    uploadPdf,
    getSignedUrl,
  }
}
