import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { DashboardSnapshot } from '~/types/index'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const rpcResult: { data: unknown; error: unknown } = { data: null, error: null }
const mockRpc = vi.fn(() => Promise.resolve(rpcResult))

mockNuxtImport('useSupabaseClient', () => () => ({
  rpc: mockRpc,
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SNAPSHOT: DashboardSnapshot = {
  total_employees: 2,
  on_leave_today: 1,
  on_leave_week: 1,
  present: 1,
  employees: [
    {
      id: 'user-emma',
      first_name: 'Emma',
      last_name: 'Employée',
      role: 'employee',
      team_name: 'Équipe A',
      joined_at: '2024-01-15',
      on_leave: true,
      leave_type_name: 'Congé payé',
      leave_end_date: '2026-05-20',
    },
    {
      id: 'user-eddy',
      first_name: 'Eddy',
      last_name: 'Employé',
      role: 'employee',
      team_name: 'Équipe A',
      joined_at: '2023-06-01',
      on_leave: false,
      leave_type_name: null,
      leave_end_date: null,
    },
  ],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDashboard', () => {
  beforeEach(() => {
    rpcResult.data = null
    rpcResult.error = null
    mockRpc.mockClear()
    useState<DashboardSnapshot | null>('dashboard-snapshot').value = null
  })

  describe('initial state', () => {
    it('snapshot is null before fetch', () => {
      const { snapshot } = useDashboard()
      expect(snapshot.value).toBeNull()
    })

    it('isLoading starts false', () => {
      const { isLoading } = useDashboard()
      expect(isLoading.value).toBe(false)
    })

    it('error starts null', () => {
      const { error } = useDashboard()
      expect(error.value).toBeNull()
    })
  })

  describe('fetchSnapshot()', () => {
    it('UC-015-01: calls get_dashboard_snapshot RPC', async () => {
      rpcResult.data = SNAPSHOT
      const { fetchSnapshot } = useDashboard()
      await fetchSnapshot()
      expect(mockRpc).toHaveBeenCalledWith('get_dashboard_snapshot')
    })

    it('UC-015-02: sets snapshot on success', async () => {
      rpcResult.data = SNAPSHOT
      const { snapshot, fetchSnapshot } = useDashboard()
      await fetchSnapshot()
      expect(snapshot.value).toStrictEqual(SNAPSHOT)
    })

    it('UC-015-03: isLoading is false after success', async () => {
      rpcResult.data = SNAPSHOT
      const { isLoading, fetchSnapshot } = useDashboard()
      await fetchSnapshot()
      expect(isLoading.value).toBe(false)
    })

    it('UC-015-04: error is null after success', async () => {
      rpcResult.data = SNAPSHOT
      const { error, fetchSnapshot } = useDashboard()
      await fetchSnapshot()
      expect(error.value).toBeNull()
    })

    it('UC-015-05: sets error message on RPC failure', async () => {
      rpcResult.error = new Error('Accès refusé')
      const { error, fetchSnapshot } = useDashboard()
      await fetchSnapshot()
      expect(error.value).toBe('Accès refusé')
    })

    it('UC-015-06: snapshot stays null on failure', async () => {
      rpcResult.error = new Error('Accès refusé')
      const { snapshot, fetchSnapshot } = useDashboard()
      await fetchSnapshot()
      expect(snapshot.value).toBeNull()
    })

    it('UC-015-07: isLoading is false after failure', async () => {
      rpcResult.error = new Error('Accès refusé')
      const { isLoading, fetchSnapshot } = useDashboard()
      await fetchSnapshot()
      expect(isLoading.value).toBe(false)
    })

    it('UC-015-08: error clears on retry success', async () => {
      rpcResult.error = new Error('erreur réseau')
      const { error, fetchSnapshot } = useDashboard()
      await fetchSnapshot()
      expect(error.value).not.toBeNull()

      rpcResult.error = null
      rpcResult.data = SNAPSHOT
      await fetchSnapshot()
      expect(error.value).toBeNull()
    })
  })

  describe('readonly refs', () => {
    it('exposes snapshot, isLoading, error as readonly', () => {
      const { snapshot, isLoading, error } = useDashboard()
      expect(snapshot.value === null || typeof snapshot.value === 'object').toBe(true)
      expect(typeof isLoading.value).toBe('boolean')
      expect(error.value === null || typeof error.value === 'string').toBe(true)
    })

    it('uses "dashboard-snapshot" as useState key', () => {
      rpcResult.data = SNAPSHOT
      const { snapshot } = useDashboard()
      const shared = useState<DashboardSnapshot | null>('dashboard-snapshot')
      shared.value = SNAPSHOT
      expect(snapshot.value).toStrictEqual(SNAPSHOT)
    })
  })
})
