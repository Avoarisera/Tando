import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { Invoice } from '~/types/index'

// ── Mock setup ───────────────────────────────────────────────────────────────

const {
  fromResult,
  sharedBuilder,
  mockFrom,
  storageUploadResult,
  storageSignResult,
  mockStorageUpload,
  mockStorageCreateSignedUrl,
  mockStorageFrom,
} = vi.hoisted(() => {
  const fromResult: { data: unknown; error: unknown } = { data: null, error: null }

  // Chainable DB query builder — thenable at any step
  const sharedBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    then(resolve: (v: typeof fromResult) => unknown) {
      return Promise.resolve(fromResult).then(resolve)
    },
    catch(reject: (e: Error) => unknown) {
      return Promise.resolve(fromResult).catch(reject)
    },
  }

  const mockFrom = vi.fn().mockReturnValue(sharedBuilder)

  // Storage results
  const storageUploadResult: { data: unknown; error: unknown } = { data: null, error: null }
  const storageSignResult: { data: { signedUrl: string }; error: unknown } = {
    data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/invoices/file.pdf?token=abc' },
    error: null,
  }

  const mockStorageUpload         = vi.fn(() => Promise.resolve(storageUploadResult))
  const mockStorageCreateSignedUrl = vi.fn(() => Promise.resolve(storageSignResult))
  const mockStorageFrom           = vi.fn(() => ({
    upload:          mockStorageUpload,
    createSignedUrl: mockStorageCreateSignedUrl,
  }))

  return {
    fromResult,
    sharedBuilder,
    mockFrom,
    storageUploadResult,
    storageSignResult,
    mockStorageUpload,
    mockStorageCreateSignedUrl,
    mockStorageFrom,
  }
})

mockNuxtImport('useSupabaseClient', () => () => ({
  from:    mockFrom,
  storage: { from: mockStorageFrom },
}))

mockNuxtImport('useSupabaseUser', () => () => ref({ id: 'admin-uuid' }))

// ── Sample fixture ───────────────────────────────────────────────────────────

const SAMPLE_INVOICE: Invoice = {
  id:           'inv-1',
  reference:    'FAC-2026-001',
  client:       'ACME Corp',
  amount:       1500,
  currency:     'EUR',
  invoice_date: '2026-02-01',
  due_date:     '2026-03-01',
  notes:        null,
  status:       'en_attente',
  pdf_path:     null,
  created_by:   'admin-uuid',
  created_at:   '2026-02-01T10:00:00Z',
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useInvoices', () => {
  beforeEach(() => {
    fromResult.data  = null
    fromResult.error = null
    storageUploadResult.data  = null
    storageUploadResult.error = null
    storageSignResult.data  = { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/invoices/file.pdf?token=abc' }
    storageSignResult.error = null
    sharedBuilder.select.mockClear()
    sharedBuilder.insert.mockClear()
    sharedBuilder.update.mockClear()
    sharedBuilder.eq.mockClear()
    sharedBuilder.order.mockClear()
    mockFrom.mockClear()
    mockStorageFrom.mockClear()
    mockStorageUpload.mockClear()
    mockStorageCreateSignedUrl.mockClear()
    useState<Invoice[]>('invoices').value = []
  })

  // ── fetchInvoices ───────────────────────────────────────────────────────────

  describe('fetchInvoices()', () => {
    it('populates invoices with data returned by Supabase', async () => {
      fromResult.data = [SAMPLE_INVOICE]

      const { invoices, fetchInvoices } = useInvoices()
      await fetchInvoices()

      expect(invoices.value).toHaveLength(1)
      expect(invoices.value[0].id).toBe('inv-1')
    })

    it('falls back to empty array when data is null', async () => {
      fromResult.data = null

      const { invoices, fetchInvoices } = useInvoices()
      await fetchInvoices()

      expect(invoices.value).toEqual([])
    })

    it('queries from the invoices table', async () => {
      fromResult.data = []

      const { fetchInvoices } = useInvoices()
      await fetchInvoices()

      expect(mockFrom).toHaveBeenCalledWith('invoices')
    })

    it('orders by created_at descending', async () => {
      fromResult.data = []

      const { fetchInvoices } = useInvoices()
      await fetchInvoices()

      expect(sharedBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    it('isLoading is false after a successful fetch', async () => {
      fromResult.data = []

      const { isLoading, fetchInvoices } = useInvoices()
      await fetchInvoices()

      expect(isLoading.value).toBe(false)
    })

    it('sets error.value on Supabase error', async () => {
      fromResult.data  = null
      fromResult.error = { message: 'Permission refusée' }

      const { error, fetchInvoices } = useInvoices()
      await fetchInvoices()

      expect(error.value).not.toBeNull()
    })

    it('isLoading returns to false even on error', async () => {
      fromResult.data  = null
      fromResult.error = { message: 'Erreur' }

      const { isLoading, fetchInvoices } = useInvoices()
      await fetchInvoices()

      expect(isLoading.value).toBe(false)
    })

    it('clears error before a new fetch', async () => {
      fromResult.data  = null
      fromResult.error = { message: 'Première erreur' }

      const { error, fetchInvoices } = useInvoices()
      await fetchInvoices()
      expect(error.value).not.toBeNull()

      fromResult.data  = []
      fromResult.error = null
      await fetchInvoices()

      expect(error.value).toBeNull()
    })
  })

  // ── createInvoice ───────────────────────────────────────────────────────────

  describe('createInvoice()', () => {
    it('inserts into the invoices table', async () => {
      fromResult.error = null
      fromResult.data  = []

      const { createInvoice } = useInvoices()
      await createInvoice({
        reference:    'FAC-X',
        client:       'Test Corp',
        amount:       500,
        currency:     'EUR',
        invoice_date: '2026-05-01',
        due_date:     null,
        notes:        null,
        status:       'en_attente',
      })

      expect(mockFrom).toHaveBeenCalledWith('invoices')
      expect(sharedBuilder.insert).toHaveBeenCalled()
    })

    it('sets created_by to the current user id', async () => {
      fromResult.error = null
      fromResult.data  = []

      const { createInvoice } = useInvoices()
      await createInvoice({
        reference:    'FAC-X',
        client:       'Test Corp',
        amount:       500,
        currency:     'EUR',
        invoice_date: '2026-05-01',
        due_date:     null,
        notes:        null,
        status:       'en_attente',
      })

      const insertArg = sharedBuilder.insert.mock.calls[0]?.[0] as Record<string, unknown>
      expect(insertArg.created_by).toBe('admin-uuid')
    })

    it('re-fetches invoices after successful insert', async () => {
      fromResult.error = null
      fromResult.data  = [SAMPLE_INVOICE]

      const { invoices, createInvoice } = useInvoices()
      await createInvoice({
        reference:    'FAC-X',
        client:       'Test Corp',
        amount:       500,
        currency:     'EUR',
        invoice_date: '2026-05-01',
        due_date:     null,
        notes:        null,
        status:       'en_attente',
      })

      expect(invoices.value).toHaveLength(1)
    })

    it('throws when Supabase returns an error (e.g. duplicate reference)', async () => {
      fromResult.data  = null
      fromResult.error = { message: 'duplicate key value violates unique constraint' }

      const { createInvoice } = useInvoices()

      await expect(
        createInvoice({
          reference:    'FAC-2026-001',
          client:       'Test',
          amount:       100,
          currency:     'EUR',
          invoice_date: '2026-05-01',
          due_date:     null,
          notes:        null,
          status:       'en_attente',
        }),
      ).rejects.toThrow()
    })
  })

  // ── updateStatus ────────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('calls .update() with the new status and filters by id', async () => {
      fromResult.error = null

      const { updateStatus } = useInvoices()
      await updateStatus('inv-1', 'envoyee')

      expect(mockFrom).toHaveBeenCalledWith('invoices')
      expect(sharedBuilder.update).toHaveBeenCalledWith({ status: 'envoyee' })
      expect(sharedBuilder.eq).toHaveBeenCalledWith('id', 'inv-1')
    })

    it('updates the local invoices array after successful DB update', async () => {
      fromResult.error = null
      useState<Invoice[]>('invoices').value = [{ ...SAMPLE_INVOICE, status: 'en_attente' }]

      const { invoices, updateStatus } = useInvoices()
      await updateStatus('inv-1', 'envoyee')

      expect(invoices.value[0].status).toBe('envoyee')
    })

    it('does NOT mutate local state when the DB update fails (no optimistic update)', async () => {
      fromResult.error = { message: 'Réseau indisponible' }
      useState<Invoice[]>('invoices').value = [{ ...SAMPLE_INVOICE, status: 'en_attente' }]

      const { invoices, updateStatus } = useInvoices()

      await expect(updateStatus('inv-1', 'envoyee')).rejects.toThrow()

      // Badge must stay at the old value — no rollback needed because state was never mutated
      expect(invoices.value[0].status).toBe('en_attente')
    })

    it('throws when Supabase returns an error', async () => {
      fromResult.error = { message: 'Mise à jour refusée' }

      const { updateStatus } = useInvoices()

      await expect(updateStatus('inv-1', 'payee')).rejects.toThrow('Mise à jour refusée')
    })
  })

  // ── uploadPdf ───────────────────────────────────────────────────────────────

  describe('uploadPdf()', () => {
    it('uploads to the invoices Storage bucket', async () => {
      storageUploadResult.error = null
      fromResult.error          = null

      const file = new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' })
      const { uploadPdf } = useInvoices()
      await uploadPdf('inv-1', file)

      expect(mockStorageFrom).toHaveBeenCalledWith('invoices')
      expect(mockStorageUpload).toHaveBeenCalled()
    })

    it('constructs storage path as {invoiceId}/{sanitizedFilename}', async () => {
      storageUploadResult.error = null
      fromResult.error          = null

      const file = new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' })
      const { uploadPdf } = useInvoices()
      await uploadPdf('inv-1', file)

      const [path] = mockStorageUpload.mock.calls[0] as [string, ...unknown[]]
      expect(path).toBe('inv-1/invoice.pdf')
    })

    it('sanitizes unsafe characters in the filename', async () => {
      storageUploadResult.error = null
      fromResult.error          = null

      const file = new File(['%PDF-1.4'], 'facture 2026!.pdf', { type: 'application/pdf' })
      const { uploadPdf } = useInvoices()
      await uploadPdf('inv-1', file)

      const [path] = mockStorageUpload.mock.calls[0] as [string, ...unknown[]]
      expect(path).toBe('inv-1/facture_2026_.pdf')
      expect(path).not.toMatch(/[ !]/)
    })

    it('sets contentType application/pdf and upsert:true', async () => {
      storageUploadResult.error = null
      fromResult.error          = null

      const file = new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' })
      const { uploadPdf } = useInvoices()
      await uploadPdf('inv-1', file)

      const [, , options] = mockStorageUpload.mock.calls[0] as [string, unknown, { contentType: string; upsert: boolean }]
      expect(options.contentType).toBe('application/pdf')
      expect(options.upsert).toBe(true)
    })

    it('updates pdf_path in the invoices table after upload', async () => {
      storageUploadResult.error = null
      fromResult.error          = null

      const file = new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' })
      const { uploadPdf } = useInvoices()
      await uploadPdf('inv-1', file)

      expect(sharedBuilder.update).toHaveBeenCalledWith({ pdf_path: 'inv-1/invoice.pdf' })
      expect(sharedBuilder.eq).toHaveBeenCalledWith('id', 'inv-1')
    })

    it('updates local invoices array with the new pdf_path', async () => {
      storageUploadResult.error = null
      fromResult.error          = null
      useState<Invoice[]>('invoices').value = [{ ...SAMPLE_INVOICE, pdf_path: null }]

      const file = new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' })
      const { invoices, uploadPdf } = useInvoices()
      await uploadPdf('inv-1', file)

      expect(invoices.value[0].pdf_path).toBe('inv-1/invoice.pdf')
    })

    it('throws and does not update DB when Storage upload fails', async () => {
      storageUploadResult.error = { message: 'Fichier trop volumineux' }
      fromResult.error          = null

      const file = new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' })
      const { uploadPdf } = useInvoices()

      await expect(uploadPdf('inv-1', file)).rejects.toThrow('Fichier trop volumineux')
      expect(sharedBuilder.update).not.toHaveBeenCalled()
    })
  })

  // ── getSignedUrl ────────────────────────────────────────────────────────────

  describe('getSignedUrl()', () => {
    it('returns the signed URL from Supabase Storage', async () => {
      storageSignResult.data  = { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/invoices/inv-1/file.pdf?token=xyz' }
      storageSignResult.error = null

      const { getSignedUrl } = useInvoices()
      const url = await getSignedUrl('inv-1/file.pdf')

      expect(url).toBe('https://example.supabase.co/storage/v1/object/sign/invoices/inv-1/file.pdf?token=xyz')
    })

    it('calls createSignedUrl on the invoices bucket with a 60-second TTL', async () => {
      storageSignResult.error = null

      const { getSignedUrl } = useInvoices()
      await getSignedUrl('inv-1/file.pdf')

      expect(mockStorageFrom).toHaveBeenCalledWith('invoices')
      expect(mockStorageCreateSignedUrl).toHaveBeenCalledWith('inv-1/file.pdf', 60)
    })

    it('generates a fresh URL on each call (never caches)', async () => {
      storageSignResult.error = null

      const { getSignedUrl } = useInvoices()
      await getSignedUrl('inv-1/file.pdf')
      await getSignedUrl('inv-1/file.pdf')

      expect(mockStorageCreateSignedUrl).toHaveBeenCalledTimes(2)
    })

    it('throws when Supabase Storage returns an error', async () => {
      storageSignResult.data  = { signedUrl: '' }
      storageSignResult.error = { message: 'Object not found' }

      const { getSignedUrl } = useInvoices()

      await expect(getSignedUrl('inv-1/nonexistent.pdf')).rejects.toThrow('Object not found')
    })
  })

  // ── useState key & readonly ─────────────────────────────────────────────────

  describe('useState key & readonly', () => {
    it('shares state via the "invoices" useState key', () => {
      const { invoices } = useInvoices()
      const shared = useState<Invoice[]>('invoices')
      shared.value = [SAMPLE_INVOICE]
      expect(invoices.value).toStrictEqual([SAMPLE_INVOICE])
    })

    it('exposes invoices, isLoading, and error as readonly refs', () => {
      const { invoices, isLoading, error } = useInvoices()
      expect(Array.isArray(invoices.value)).toBe(true)
      expect(typeof isLoading.value).toBe('boolean')
      expect(error.value === null || typeof error.value === 'string').toBe(true)
    })
  })
})
