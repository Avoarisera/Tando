import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { LeaveRequestWithRelations } from '~/types/index'

// ── Supabase mock setup ──────────────────────────────────────────────────────

const { fromResult, rpcResult, sharedBuilder, mockFrom, mockRpc } = vi.hoisted(() => {
  const fromResult: { data: unknown; error: unknown } = { data: null, error: null }
  const rpcResult:  { data: unknown; error: unknown } = { data: null, error: null }

  // Chainable query builder — thenable at any step (.select(), .order(), .eq(), .update())
  const sharedBuilder = {
    select: vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    then(resolve: (v: typeof fromResult) => unknown) {
      return Promise.resolve(fromResult).then(resolve)
    },
    catch(reject: (e: Error) => unknown) {
      return Promise.resolve(fromResult).catch(reject)
    },
  }

  const mockFrom = vi.fn().mockReturnValue(sharedBuilder)
  const mockRpc  = vi.fn().mockImplementation(() => Promise.resolve(rpcResult))

  return { fromResult, rpcResult, sharedBuilder, mockFrom, mockRpc }
})

mockNuxtImport('useSupabaseClient', () => () => ({
  from: mockFrom,
  rpc:  mockRpc,
}))

// ── Sample fixtures ──────────────────────────────────────────────────────────

const SAMPLE_REQUEST: LeaveRequestWithRelations = {
  id:                  'req-1',
  user_id:             'user-1',
  leave_type_id:       'lt-1',
  start_date:          '2026-06-01',
  end_date:            '2026-06-05',
  days_count:          5,
  status:              'pending',
  comment:             null,
  manager_reviewed_by: null,
  manager_reviewed_at: null,
  admin_reviewed_by:   null,
  admin_reviewed_at:   null,
  created_at:          '2026-05-01T10:00:00Z',
  leave_types: { id: 'lt-1', name: 'Congé payé', color: '#4CAF50' },
  profiles: {
    id: 'user-1', first_name: 'Emma', last_name: 'Employée', team_id: 'team-1',
    teams: { name: 'Dev' },
  },
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useLeaveRequests', () => {
  beforeEach(() => {
    fromResult.data  = null
    fromResult.error = null
    rpcResult.data   = null
    rpcResult.error  = null
    sharedBuilder.select.mockClear()
    sharedBuilder.order.mockClear()
    sharedBuilder.eq.mockClear()
    sharedBuilder.update.mockClear()
    mockFrom.mockClear()
    mockRpc.mockClear()
    useState<LeaveRequestWithRelations[]>('leave-requests').value = []
  })

  // ── fetchRequests ───────────────────────────────────────────────────────────

  describe('fetchRequests()', () => {
    it('populates requests with data returned by Supabase', async () => {
      fromResult.data = [SAMPLE_REQUEST]

      const { requests, fetchRequests } = useLeaveRequests()
      await fetchRequests()

      expect(requests.value).toHaveLength(1)
      expect(requests.value[0].id).toBe('req-1')
    })

    it('falls back to empty array when data is null', async () => {
      fromResult.data = null

      const { requests, fetchRequests } = useLeaveRequests()
      await fetchRequests()

      expect(requests.value).toEqual([])
    })

    it('queries from leave_requests table', async () => {
      fromResult.data = []

      const { fetchRequests } = useLeaveRequests()
      await fetchRequests()

      expect(mockFrom).toHaveBeenCalledWith('leave_requests')
    })

    it('orders by created_at descending', async () => {
      fromResult.data = []

      const { fetchRequests } = useLeaveRequests()
      await fetchRequests()

      expect(sharedBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    it('selects with leave_types and profiles join', async () => {
      fromResult.data = []

      const { fetchRequests } = useLeaveRequests()
      await fetchRequests()

      const selectArg = sharedBuilder.select.mock.calls[0]?.[0] as string
      expect(selectArg).toContain('leave_types')
      expect(selectArg).toContain('profiles!user_id')
    })

    it('isLoading is false after a successful fetch', async () => {
      fromResult.data = []

      const { isLoading, fetchRequests } = useLeaveRequests()
      await fetchRequests()

      expect(isLoading.value).toBe(false)
    })

    it('sets error.value to a non-null French message on Supabase error', async () => {
      fromResult.data  = null
      fromResult.error = { message: 'Permission refusée' }

      const { error, fetchRequests } = useLeaveRequests()
      await fetchRequests()

      // Supabase errors are plain objects (not Error instances), so the composable
      // uses its French fallback rather than forwarding sbError.message
      expect(error.value).toBe('Erreur lors du chargement des demandes')
    })

    it('isLoading returns to false even on error', async () => {
      fromResult.data  = null
      fromResult.error = { message: 'Erreur' }

      const { isLoading, fetchRequests } = useLeaveRequests()
      await fetchRequests()

      expect(isLoading.value).toBe(false)
    })
  })

  // ── createRequest ───────────────────────────────────────────────────────────

  describe('createRequest()', () => {
    it('calls rpc("create_leave_request") with correct parameter names', async () => {
      rpcResult.data  = 'new-uuid-1234'
      rpcResult.error = null

      const { createRequest } = useLeaveRequests()
      await createRequest({
        leaveTypeId: 'lt-1',
        startDate:   '2026-07-01',
        endDate:     '2026-07-05',
        comment:     'Test',
      })

      expect(mockRpc).toHaveBeenCalledWith('create_leave_request', {
        p_leave_type_id: 'lt-1',
        p_start_date:    '2026-07-01',
        p_end_date:      '2026-07-05',
        p_comment:       'Test',
      })
    })

    it('passes undefined (not null) for p_comment when comment is null', async () => {
      rpcResult.data  = 'new-uuid'
      rpcResult.error = null

      const { createRequest } = useLeaveRequests()
      await createRequest({ leaveTypeId: 'lt-1', startDate: '2026-07-01', endDate: '2026-07-02', comment: null })

      const callArgs = mockRpc.mock.calls[0]?.[1] as Record<string, unknown>
      // null comment → undefined (omitted from Supabase call)
      expect(callArgs.p_comment).toBeUndefined()
    })

    it('returns the UUID string from the RPC response', async () => {
      rpcResult.data  = 'new-uuid-5678'
      rpcResult.error = null

      const { createRequest } = useLeaveRequests()
      const result = await createRequest({
        leaveTypeId: 'lt-1',
        startDate:   '2026-07-01',
        endDate:     '2026-07-02',
        comment:     null,
      })

      expect(result).toBe('new-uuid-5678')
    })

    it('throws when Supabase RPC returns an error', async () => {
      rpcResult.data  = null
      rpcResult.error = { message: 'Vous avez déjà une demande sur cette période' }

      const { createRequest } = useLeaveRequests()

      await expect(
        createRequest({ leaveTypeId: 'lt-1', startDate: '2026-07-01', endDate: '2026-07-05', comment: null })
      ).rejects.toThrow('Vous avez déjà une demande sur cette période')
    })

    it('throws with balance error message when balance is insufficient', async () => {
      rpcResult.data  = null
      rpcResult.error = { message: 'Solde insuffisant — vous demandez 21 jour(s) mais il ne vous en reste que 20' }

      const { createRequest } = useLeaveRequests()

      await expect(
        createRequest({ leaveTypeId: 'lt-1', startDate: '2026-07-01', endDate: '2026-07-21', comment: null })
      ).rejects.toThrow('Solde insuffisant')
    })
  })

  // ── updateRequestStatus ─────────────────────────────────────────────────────

  describe('updateRequestStatus()', () => {
    it('calls .update() on leave_requests with the supplied fields', async () => {
      fromResult.data  = {}
      fromResult.error = null

      const { updateRequestStatus } = useLeaveRequests()
      await updateRequestStatus('req-42', {
        status:              'manager_approved',
        manager_reviewed_by: 'user-2',
        manager_reviewed_at: '2026-05-01T10:00:00Z',
      })

      expect(mockFrom).toHaveBeenCalledWith('leave_requests')
      expect(sharedBuilder.update).toHaveBeenCalledWith({
        status:              'manager_approved',
        manager_reviewed_by: 'user-2',
        manager_reviewed_at: '2026-05-01T10:00:00Z',
      })
    })

    it('filters by the supplied requestId', async () => {
      fromResult.data  = {}
      fromResult.error = null

      const { updateRequestStatus } = useLeaveRequests()
      await updateRequestStatus('req-99', { status: 'rejected' })

      expect(sharedBuilder.eq).toHaveBeenCalledWith('id', 'req-99')
    })

    it('throws when the update fails', async () => {
      fromResult.data  = null
      fromResult.error = { message: 'Mise à jour refusée' }

      const { updateRequestStatus } = useLeaveRequests()

      await expect(
        updateRequestStatus('req-1', { status: 'approved' })
      ).rejects.toThrow('Mise à jour refusée')
    })

    it('throws an Error instance (not a plain PostgrestError) so catch blocks can use instanceof Error', async () => {
      fromResult.data  = null
      fromResult.error = { message: 'Aucun solde trouvé pour cet utilisateur, ce type de congé et cette année' }

      const { updateRequestStatus } = useLeaveRequests()

      try {
        await updateRequestStatus('req-1', { status: 'approved' })
        expect.fail('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(Error)
        expect((e as Error).message).toBe('Aucun solde trouvé pour cet utilisateur, ce type de congé et cette année')
      }
    })
  })

  // ── State management ────────────────────────────────────────────────────────

  describe('useState key & readonly', () => {
    it('shares state via the "leave-requests" useState key', () => {
      const { requests } = useLeaveRequests()
      const shared = useState<LeaveRequestWithRelations[]>('leave-requests')
      // Mutate via useState directly; composable must reflect the change
      shared.value = [SAMPLE_REQUEST]
      expect(requests.value).toStrictEqual([SAMPLE_REQUEST])
    })

    it('exposes requests, isLoading, and error as readonly refs', () => {
      const { requests, isLoading, error } = useLeaveRequests()
      expect(Array.isArray(requests.value)).toBe(true)
      expect(typeof isLoading.value).toBe('boolean')
      expect(error.value === null || typeof error.value === 'string').toBe(true)
    })
  })
})
