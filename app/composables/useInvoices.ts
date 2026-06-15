import type { Invoice, InvoiceStatus } from '~/types/index'

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
      invoices.value = data ?? []
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
      .insert({ ...payload, created_by: user.value?.id ?? null })
    if (sbError) throw sbError
    await fetchInvoices()
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
    if (signError) throw signError
    return data.signedUrl
  }

  return {
    invoices: readonly(invoices),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchInvoices,
    createInvoice,
    updateStatus,
    uploadPdf,
    getSignedUrl,
  }
}
