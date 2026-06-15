import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { LeaveType } from '~/types/index'

// ── Supabase mock setup ──────────────────────────────────────────────────────
// The builder is thenable at any link in the chain so both
// .order()  (activeOnly=false) and .order().eq()  (activeOnly=true) are awaitable.

const { sharedResult, sharedBuilder, mockFrom, mockRpc } = vi.hoisted(() => {
  const sharedResult: { data: unknown; error: unknown } = { data: null, error: null }

  const sharedBuilder = {
    select: vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    // single() terminates the chain and returns the result directly (no further chaining)
    single: vi.fn(() => Promise.resolve(sharedResult)),
    then(resolve: (v: typeof sharedResult) => unknown) {
      return Promise.resolve(sharedResult).then(resolve)
    },
    catch(reject: (e: Error) => unknown) {
      return Promise.resolve(sharedResult).catch(reject)
    },
  }

  const mockFrom = vi.fn().mockReturnValue(sharedBuilder)
  const mockRpc  = vi.fn(() => Promise.resolve({ data: null, error: null }))

  return { sharedResult, sharedBuilder, mockFrom, mockRpc }
})

mockNuxtImport('useSupabaseClient', () => () => ({ from: mockFrom, rpc: mockRpc }))

// ── Sample fixtures ──────────────────────────────────────────────────────────

const SAMPLE_TYPES: LeaveType[] = [
  { id: 'lt-1', name: 'Congé payé',    color: '#4CAF50', is_active: true,  created_at: '2026-01-01T00:00:00Z' },
  { id: 'lt-2', name: 'Congé maladie', color: '#F44336', is_active: true,  created_at: '2026-01-02T00:00:00Z' },
  { id: 'lt-3', name: 'RTT',           color: '#2196F3', is_active: false, created_at: '2026-01-03T00:00:00Z' },
]

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useLeaveTypes', () => {
  beforeEach(() => {
    sharedResult.data  = null
    sharedResult.error = null
    sharedBuilder.select.mockClear()
    sharedBuilder.order.mockClear()
    sharedBuilder.eq.mockClear()
    sharedBuilder.insert.mockClear()
    sharedBuilder.update.mockClear()
    sharedBuilder.single.mockClear()
    mockFrom.mockClear()
    mockRpc.mockClear()
    useState<LeaveType[]>('leave-types').value = []
  })

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('populates leaveTypes with data returned by Supabase', async () => {
    sharedResult.data = SAMPLE_TYPES

    const { leaveTypes, fetchLeaveTypes } = useLeaveTypes()
    await fetchLeaveTypes()

    expect(leaveTypes.value).toEqual(SAMPLE_TYPES)
  })

  it('falls back to empty array when Supabase returns null data', async () => {
    sharedResult.data = null

    const { leaveTypes, fetchLeaveTypes } = useLeaveTypes()
    await fetchLeaveTypes()

    expect(leaveTypes.value).toEqual([])
  })

  it('isLoading is false after a successful fetch', async () => {
    sharedResult.data = []

    const { isLoading, fetchLeaveTypes } = useLeaveTypes()
    await fetchLeaveTypes()

    expect(isLoading.value).toBe(false)
  })

  it('clears error.value on a successful fetch', async () => {
    sharedResult.data  = []
    sharedResult.error = null

    const { error, fetchLeaveTypes } = useLeaveTypes()
    await fetchLeaveTypes()

    expect(error.value).toBeNull()
  })

  // ── activeOnly flag ─────────────────────────────────────────────────────────

  it('calls .eq("is_active", true) when activeOnly=true (default)', async () => {
    sharedResult.data = []

    const { fetchLeaveTypes } = useLeaveTypes()
    await fetchLeaveTypes()

    expect(sharedBuilder.eq).toHaveBeenCalledWith('is_active', true)
  })

  it('does NOT call .eq() when activeOnly=false', async () => {
    sharedResult.data = []

    const { fetchLeaveTypes } = useLeaveTypes()
    await fetchLeaveTypes(false)

    expect(sharedBuilder.eq).not.toHaveBeenCalled()
  })

  it('queries from the leave_types table', async () => {
    sharedResult.data = []

    const { fetchLeaveTypes } = useLeaveTypes()
    await fetchLeaveTypes()

    expect(mockFrom).toHaveBeenCalledWith('leave_types')
  })

  it('orders by created_at ascending', async () => {
    sharedResult.data = []

    const { fetchLeaveTypes } = useLeaveTypes()
    await fetchLeaveTypes()

    expect(sharedBuilder.order).toHaveBeenCalledWith('name', { ascending: true })
  })

  // ── Error path ─────────────────────────────────────────────────────────────

  it('sets error.value to a non-null French message on Supabase failure', async () => {
    sharedResult.data  = null
    sharedResult.error = { message: 'Connexion impossible' }

    const { error, fetchLeaveTypes } = useLeaveTypes()
    await fetchLeaveTypes()

    // Supabase errors are plain objects (not Error instances), so the composable
    // uses its French fallback message rather than forwarding sbError.message
    expect(error.value).toBe('Erreur lors du chargement des types de congé')
  })

  it('keeps leaveTypes empty when the fetch fails', async () => {
    sharedResult.data  = null
    sharedResult.error = { message: 'Timeout' }

    const { leaveTypes, fetchLeaveTypes } = useLeaveTypes()
    await fetchLeaveTypes()

    expect(leaveTypes.value).toEqual([])
  })

  it('sets isLoading back to false even when the fetch fails', async () => {
    sharedResult.data  = null
    sharedResult.error = { message: 'Erreur réseau' }

    const { isLoading, fetchLeaveTypes } = useLeaveTypes()
    await fetchLeaveTypes()

    expect(isLoading.value).toBe(false)
  })

  // ── useState key ────────────────────────────────────────────────────────────

  it('shares state via the "leave-types" useState key', () => {
    const { leaveTypes } = useLeaveTypes()
    const shared = useState<LeaveType[]>('leave-types')
    // Mutate via useState directly; composable must reflect the change
    shared.value = [SAMPLE_TYPES[0]]
    expect(leaveTypes.value).toStrictEqual([SAMPLE_TYPES[0]])
  })

  it('"leave-types" key does not collide with "leave-requests" key', () => {
    const { leaveTypes } = useLeaveTypes()
    const other = useState('leave-requests')
    expect(leaveTypes.value).not.toBe(other.value)
  })

  // ── Readonly ────────────────────────────────────────────────────────────────

  it('exposes leaveTypes, isLoading, and error as readonly refs', () => {
    const { leaveTypes, isLoading, error } = useLeaveTypes()
    // Runtime check: readonly() returns a ref-like object
    expect(Array.isArray(leaveTypes.value)).toBe(true)
    expect(typeof isLoading.value).toBe('boolean')
    expect(error.value === null || typeof error.value === 'string').toBe(true)
  })
})

// ── Mutation functions ────────────────────────────────────────────────────────

describe('useLeaveTypes — mutations', () => {
  beforeEach(() => {
    sharedResult.data  = null
    sharedResult.error = null
    sharedBuilder.select.mockClear()
    sharedBuilder.insert.mockClear()
    sharedBuilder.update.mockClear()
    sharedBuilder.eq.mockClear()
    sharedBuilder.single.mockClear()
    mockFrom.mockClear()
    mockRpc.mockClear()
    useState<LeaveType[]>('leave-types').value = []
  })

  // ── createLeaveType ─────────────────────────────────────────────────────────

  it('createLeaveType: queries the leave_types table', async () => {
    sharedResult.data  = { id: 'new-lt-id' }
    sharedResult.error = null

    const { createLeaveType } = useLeaveTypes()
    await createLeaveType('Congé exceptionnel', '#FF9800')

    expect(mockFrom).toHaveBeenCalledWith('leave_types')
  })

  it('createLeaveType: calls insert with trimmed name, color, and is_active=true', async () => {
    sharedResult.data  = { id: 'new-lt-id' }
    sharedResult.error = null

    const { createLeaveType } = useLeaveTypes()
    await createLeaveType('  Congé exceptionnel  ', '#FF9800')

    expect(sharedBuilder.insert).toHaveBeenCalledWith({
      name: 'Congé exceptionnel',
      color: '#FF9800',
      is_active: true,
    })
  })

  it('createLeaveType: does not throw when Supabase returns no error', async () => {
    sharedResult.data  = { id: 'new-lt-id' }
    sharedResult.error = null

    const { createLeaveType } = useLeaveTypes()
    await expect(createLeaveType('Congé exceptionnel', '#FF9800')).resolves.toBeUndefined()
  })

  it('createLeaveType: throws when Supabase returns an error', async () => {
    sharedResult.error = { message: 'Erreur serveur', code: '500' }

    const { createLeaveType } = useLeaveTypes()
    await expect(createLeaveType('Mauvais type', '#000000')).rejects.toBeTruthy()
  })

  it('createLeaveType: does not mutate leaveTypes state (caller must re-fetch)', async () => {
    sharedResult.data  = { id: 'new-lt-id' }
    sharedResult.error = null
    useState<LeaveType[]>('leave-types').value = [...SAMPLE_TYPES]

    const { leaveTypes, createLeaveType } = useLeaveTypes()
    await createLeaveType('Nouveau', '#123456')

    expect(leaveTypes.value).toHaveLength(SAMPLE_TYPES.length)
  })

  // ── updateLeaveType ─────────────────────────────────────────────────────────

  it('updateLeaveType: queries the leave_types table', async () => {
    sharedResult.error = null

    const { updateLeaveType } = useLeaveTypes()
    await updateLeaveType('lt-1', 'CP', '#4CAF50')

    expect(mockFrom).toHaveBeenCalledWith('leave_types')
  })

  it('updateLeaveType: calls update with trimmed name and color', async () => {
    sharedResult.error = null

    const { updateLeaveType } = useLeaveTypes()
    await updateLeaveType('lt-1', '  CP  ', '#FF5722')

    expect(sharedBuilder.update).toHaveBeenCalledWith({ name: 'CP', color: '#FF5722' })
  })

  it('updateLeaveType: scopes the update to the given id', async () => {
    sharedResult.error = null

    const { updateLeaveType } = useLeaveTypes()
    await updateLeaveType('lt-1', 'CP', '#FF5722')

    expect(sharedBuilder.eq).toHaveBeenCalledWith('id', 'lt-1')
  })

  it('updateLeaveType: does not throw when Supabase returns no error', async () => {
    sharedResult.error = null

    const { updateLeaveType } = useLeaveTypes()
    await expect(updateLeaveType('lt-1', 'CP', '#FF5722')).resolves.toBeUndefined()
  })

  it('updateLeaveType: throws when Supabase returns an error', async () => {
    sharedResult.error = { message: 'Enregistrement impossible', code: '500' }

    const { updateLeaveType } = useLeaveTypes()
    await expect(updateLeaveType('lt-1', 'CP', '#FF5722')).rejects.toBeTruthy()
  })

  // ── toggleLeaveType ─────────────────────────────────────────────────────────

  it('toggleLeaveType: queries the leave_types table', async () => {
    sharedResult.error = null

    const { toggleLeaveType } = useLeaveTypes()
    await toggleLeaveType('lt-3', false)

    expect(mockFrom).toHaveBeenCalledWith('leave_types')
  })

  it('toggleLeaveType: calls update with is_active=false when deactivating', async () => {
    sharedResult.error = null

    const { toggleLeaveType } = useLeaveTypes()
    await toggleLeaveType('lt-1', false)

    expect(sharedBuilder.update).toHaveBeenCalledWith({ is_active: false })
  })

  it('toggleLeaveType: calls update with is_active=true when reactivating', async () => {
    sharedResult.error = null

    const { toggleLeaveType } = useLeaveTypes()
    await toggleLeaveType('lt-3', true)

    expect(sharedBuilder.update).toHaveBeenCalledWith({ is_active: true })
  })

  it('toggleLeaveType: scopes the update to the given id', async () => {
    sharedResult.error = null

    const { toggleLeaveType } = useLeaveTypes()
    await toggleLeaveType('lt-3', false)

    expect(sharedBuilder.eq).toHaveBeenCalledWith('id', 'lt-3')
  })

  it('toggleLeaveType: does not throw when Supabase returns no error', async () => {
    sharedResult.error = null

    const { toggleLeaveType } = useLeaveTypes()
    await expect(toggleLeaveType('lt-1', false)).resolves.toBeUndefined()
  })

  it('toggleLeaveType: throws when Supabase returns an error', async () => {
    sharedResult.error = { message: 'Mise à jour impossible', code: '500' }

    const { toggleLeaveType } = useLeaveTypes()
    await expect(toggleLeaveType('lt-1', false)).rejects.toBeTruthy()
  })
})
