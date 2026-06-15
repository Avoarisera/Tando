import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { Team } from '~/types/index'

// ── Supabase mock ────────────────────────────────────────────────────────────

const { fromResult, sharedBuilder, mockFrom } = vi.hoisted(() => {
  const fromResult: { data: unknown; error: unknown } = { data: null, error: null }
  const sharedBuilder = {
    select: vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    then(resolve: (v: typeof fromResult) => unknown) {
      return Promise.resolve(fromResult).then(resolve)
    },
    catch(reject: (e: Error) => unknown) {
      return Promise.resolve(fromResult).catch(reject)
    },
  }
  const mockFrom = vi.fn().mockReturnValue(sharedBuilder)
  return { fromResult, sharedBuilder, mockFrom }
})

mockNuxtImport('useSupabaseClient', () => () => ({ from: mockFrom }))

// ── Fixture ───────────────────────────────────────────────────────────────────

const TEAM_A: Team = { id: 'team-a', name: 'Équipe A', created_at: '2026-01-01T00:00:00Z' }

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useTeams', () => {
  beforeEach(() => {
    fromResult.data  = null
    fromResult.error = null
    sharedBuilder.select.mockClear()
    sharedBuilder.order.mockClear()
    mockFrom.mockClear()
    useState<Team[]>('teams').value = []
  })

  describe('fetchTeams()', () => {
    it('populates teams from Supabase on first call', async () => {
      fromResult.data = [TEAM_A]
      const { teams, fetchTeams } = useTeams()
      await fetchTeams()
      expect(teams.value).toHaveLength(1)
      expect(teams.value[0].name).toBe('Équipe A')
    })

    it('isLoading returns to false after success', async () => {
      fromResult.data = [TEAM_A]
      const { isLoading, fetchTeams } = useTeams()
      await fetchTeams()
      expect(isLoading.value).toBe(false)
    })

    it('sets error on Supabase failure', async () => {
      fromResult.error = { message: 'Connexion refusée' }
      const { error, isLoading, fetchTeams } = useTeams()
      await fetchTeams()
      expect(error.value).toBeTruthy()
      expect(isLoading.value).toBe(false)
    })

    // UC-010-15 — idempotence / cache guard
    it('UC-010-15: second call is short-circuited when teams already loaded', async () => {
      fromResult.data = [TEAM_A]
      const { fetchTeams } = useTeams()
      await fetchTeams()                   // first call — hits Supabase
      await fetchTeams()                   // second call — should return immediately
      // Only one network request should have been made
      expect(mockFrom).toHaveBeenCalledTimes(1)
    })

    it('UC-010-15: teams state is unchanged after the second call', async () => {
      fromResult.data = [TEAM_A]
      const { teams, fetchTeams } = useTeams()
      await fetchTeams()
      const after1 = teams.value.length
      fromResult.data = [] // change DB response — second call must NOT use this
      await fetchTeams()
      expect(teams.value).toHaveLength(after1)
    })

    it('falls back to empty array when data is null', async () => {
      fromResult.data = null
      const { teams, fetchTeams } = useTeams()
      await fetchTeams()
      expect(teams.value).toEqual([])
    })
  })

  describe('useState key & readonly', () => {
    it('shares state via the "teams" useState key', () => {
      const { teams } = useTeams()
      const shared = useState<Team[]>('teams')
      shared.value = [TEAM_A]
      expect(teams.value).toStrictEqual([TEAM_A])
    })

    it('exposes teams, isLoading, error as readonly refs', () => {
      const { teams, isLoading, error } = useTeams()
      expect(Array.isArray(teams.value)).toBe(true)
      expect(typeof isLoading.value).toBe('boolean')
      expect(error.value === null || typeof error.value === 'string').toBe(true)
    })
  })
})
