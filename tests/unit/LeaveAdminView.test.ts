/**
 * Unit tests for LeaveAdminView.vue (RFC-009)
 *
 * Tests the component's computed logic in isolation:
 *   - filteredRequests: client-side filtering across all 5 status options
 *   - adminConfirmTitle: bypass wording vs standard wording
 *   - canTakeAction: action-button gate for each LeaveStatus value
 *   - Action button rendering: correct rows show/hide buttons
 *
 * The component reads shared state from useState('leave-requests') and
 * useState('current-profile'). We pre-populate both in beforeEach so
 * no Supabase call is made during the test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import LeaveAdminView from '~/components/leave/LeaveAdminView.vue'
import type { LeaveRequestWithRelations, Profile } from '~/types/index'

// ── Supabase no-op mock ──────────────────────────────────────────────────────
// The composables call useSupabaseClient() at initialisation time.
// Provide a chainable no-op so no real HTTP requests are made.
const { noopBuilder, mockFrom, mockRpc } = vi.hoisted(() => {
  const noopBuilder = {
    select: vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then(resolve: (v: { data: null; error: null }) => unknown) {
      return Promise.resolve({ data: null, error: null }).then(resolve)
    },
    catch(reject: (e: Error) => unknown) {
      return Promise.resolve({ data: null, error: null }).catch(reject)
    },
  }
  const mockFrom = vi.fn().mockReturnValue(noopBuilder)
  const mockRpc  = vi.fn().mockResolvedValue({ data: null, error: null })
  return { noopBuilder, mockFrom, mockRpc }
})

mockNuxtImport('useSupabaseClient', () => () => ({
  from: mockFrom,
  rpc:  mockRpc,
}))

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_PROFILE: Profile = {
  id:         'admin-uuid',
  first_name: 'Alice',
  last_name:  'Admin',
  role:       'admin',
  team_id:    null,
  joined_at:  '2024-01-15',
  created_at: '2024-01-15T00:00:00Z',
}

function makeRequest(
  overrides: Partial<LeaveRequestWithRelations> & { status: LeaveRequestWithRelations['status'] }
): LeaveRequestWithRelations {
  return {
    id:                  `req-${overrides.status}`,
    user_id:             'user-1',
    leave_type_id:       'lt-1',
    start_date:          '2026-05-12',
    end_date:            '2026-05-16',
    days_count:          5,
    comment:             null,
    manager_reviewed_by: null,
    manager_reviewed_at: null,
    admin_reviewed_by:   null,
    admin_reviewed_at:   null,
    created_at:          '2026-04-01T10:00:00Z',
    leave_types: { id: 'lt-1', name: 'Congé payé', color: '#4CAF50' },
    profiles: {
      id: 'user-1', first_name: 'Emma', last_name: 'Employée', team_id: 'team-1',
      teams: { name: 'Équipe A' },
    },
    ...overrides,
  }
}

const PENDING_REQUEST          = makeRequest({ status: 'pending',          id: 'req-pending' })
const MANAGER_APPROVED_REQUEST = makeRequest({ status: 'manager_approved', id: 'req-mgr',
  first_name: undefined, // override won't affect top-level
  profiles: { id: 'user-2', first_name: 'Eddy', last_name: 'Employé', team_id: 'team-1', teams: { name: 'Équipe A' } },
} as Partial<LeaveRequestWithRelations> & { status: LeaveRequestWithRelations['status'] })
const APPROVED_REQUEST         = makeRequest({ status: 'approved',         id: 'req-approved' })
const REJECTED_REQUEST         = makeRequest({ status: 'rejected',         id: 'req-rejected' })

const ALL_REQUESTS = [PENDING_REQUEST, MANAGER_APPROVED_REQUEST, APPROVED_REQUEST, REJECTED_REQUEST]

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useState<LeaveRequestWithRelations[]>('leave-requests').value = [...ALL_REQUESTS]
  useState<Profile>('current-profile').value = ADMIN_PROFILE
  mockFrom.mockClear()
  mockRpc.mockClear()
})

// ── filteredRequests ──────────────────────────────────────────────────────────

describe('filteredRequests computed', () => {
  it('"Tous les statuts" shows all 4 requests', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    // "Tous les statuts" is the default — all rows rendered
    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(4)
  })

  it('filter "pending" shows only the pending request', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const select = wrapper.find('select#status-filter')
    await select.setValue('pending')
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(wrapper.text()).toContain('Emma')
  })

  it('filter "manager_approved" shows only the manager_approved request', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const select = wrapper.find('select#status-filter')
    await select.setValue('manager_approved')
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(wrapper.text()).toContain('Eddy')
  })

  it('filter "approved" shows only the approved request', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const select = wrapper.find('select#status-filter')
    await select.setValue('approved')
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(1)
  })

  it('filter "rejected" shows only the rejected request', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const select = wrapper.find('select#status-filter')
    await select.setValue('rejected')
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(1)
  })

  it('switching from filtered back to "all" restores all 4 rows', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const select = wrapper.find('select#status-filter')
    await select.setValue('pending')
    await wrapper.vm.$nextTick()
    await select.setValue('all')
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(4)
  })

  it('filter producing zero results shows AppEmptyState, not a table', async () => {
    useState<LeaveRequestWithRelations[]>('leave-requests').value = [APPROVED_REQUEST]
    const wrapper = await mountSuspended(LeaveAdminView)
    const select = wrapper.find('select#status-filter')
    await select.setValue('pending')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('tbody tr').length).toBe(0)
    expect(wrapper.text()).toContain('Aucune demande')
  })

  it('empty state message differs between filtered and no-data cases', async () => {
    // Filtered to zero
    useState<LeaveRequestWithRelations[]>('leave-requests').value = [APPROVED_REQUEST]
    const wrapper = await mountSuspended(LeaveAdminView)
    await wrapper.find('select#status-filter').setValue('pending')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('ne correspond à ce filtre')

    // Totally empty — reset filter to "all" to see the no-data message
    useState<LeaveRequestWithRelations[]>('leave-requests').value = []
    await wrapper.find('select#status-filter').setValue('all')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('enregistrée')
  })

  it('filtering does not trigger a Supabase call', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    mockFrom.mockClear()
    const select = wrapper.find('select#status-filter')
    await select.setValue('pending')
    await wrapper.vm.$nextTick()
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ── adminConfirmTitle computed ────────────────────────────────────────────────

describe('adminConfirmTitle computed', () => {
  it('approve pending → bypass wording', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    // Click "Approuver" on the pending row (desktop table)
    const approveBtns = wrapper.findAll('button:not([aria-label])').filter(b =>
      b.text().trim() === 'Approuver'
    )
    // The first "Approuver" corresponds to the pending request (first in list)
    await approveBtns[0].trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Approuver directement (sans validation manager) ?')
  })

  it('approve manager_approved → standard wording with employee name', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const approveBtns = wrapper.findAll('button').filter(b => b.text().trim() === 'Approuver')
    // Second "Approuver" corresponds to manager_approved request (Eddy)
    await approveBtns[1].trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Approuver la demande de Eddy Employé ?')
    // Must NOT show bypass wording
    expect(wrapper.text()).not.toContain('sans validation manager')
  })

  it('reject pending → reject wording with employee name', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const rejectBtns = wrapper.findAll('button').filter(b => b.text().trim() === 'Refuser')
    await rejectBtns[0].trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Refuser la demande de Emma Employée ?')
  })

  it('reject manager_approved → reject wording with employee name', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const rejectBtns = wrapper.findAll('button').filter(b => b.text().trim() === 'Refuser')
    await rejectBtns[1].trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Refuser la demande de Eddy Employé ?')
  })

  it('confirm modal shows formatted period as description', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const approveBtns = wrapper.findAll('button').filter(b => b.text().trim() === 'Approuver')
    await approveBtns[0].trigger('click')
    await wrapper.vm.$nextTick()

    // Period formatted as "du DD/MM/YYYY au DD/MM/YYYY"
    expect(wrapper.text()).toContain('du 12/05/2026 au 16/05/2026')
  })
})

// ── canTakeAction ─────────────────────────────────────────────────────────────

describe('canTakeAction — action button visibility per row', () => {
  it('pending row shows both Approuver and Refuser buttons', async () => {
    useState<LeaveRequestWithRelations[]>('leave-requests').value = [PENDING_REQUEST]
    const wrapper = await mountSuspended(LeaveAdminView)
    const btns = wrapper.findAll('button').map(b => b.text().trim())
    expect(btns).toContain('Approuver')
    expect(btns).toContain('Refuser')
  })

  it('manager_approved row shows both Approuver and Refuser buttons', async () => {
    useState<LeaveRequestWithRelations[]>('leave-requests').value = [MANAGER_APPROVED_REQUEST]
    const wrapper = await mountSuspended(LeaveAdminView)
    const btns = wrapper.findAll('button').map(b => b.text().trim())
    expect(btns).toContain('Approuver')
    expect(btns).toContain('Refuser')
  })

  it('approved row shows NO action buttons', async () => {
    useState<LeaveRequestWithRelations[]>('leave-requests').value = [APPROVED_REQUEST]
    const wrapper = await mountSuspended(LeaveAdminView)
    const btns = wrapper.findAll('button').map(b => b.text().trim())
    expect(btns).not.toContain('Approuver')
    expect(btns).not.toContain('Refuser')
  })

  it('rejected row shows NO action buttons', async () => {
    useState<LeaveRequestWithRelations[]>('leave-requests').value = [REJECTED_REQUEST]
    const wrapper = await mountSuspended(LeaveAdminView)
    const btns = wrapper.findAll('button').map(b => b.text().trim())
    expect(btns).not.toContain('Approuver')
    expect(btns).not.toContain('Refuser')
  })

  it('mixed list: only actionable rows have buttons', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    // pending (2 btns) + manager_approved (2 btns) = 4 action buttons across 4 rows
    const actionBtns = wrapper.findAll('button').filter(b =>
      ['Approuver', 'Refuser'].includes(b.text().trim())
    )
    expect(actionBtns.length).toBe(8)
  })
})

// ── Status filter options ─────────────────────────────────────────────────────

describe('Status filter select', () => {
  it('shows exactly 5 options', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const options = wrapper.findAll('select#status-filter option')
    expect(options.length).toBe(5)
  })

  it('option labels are French', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const labels = wrapper.findAll('select#status-filter option').map(o => o.text())
    expect(labels).toContain('Tous les statuts')
    expect(labels).toContain('En attente')
    expect(labels).toContain('Validé manager')
    expect(labels).toContain('Approuvé')
    expect(labels).toContain('Refusé')
  })

  it('default selected option is "Tous les statuts"', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const select = wrapper.find<HTMLSelectElement>('select#status-filter')
    expect((select.element as HTMLSelectElement).value).toBe('all')
  })
})

// ── Cancel modal ──────────────────────────────────────────────────────────────

describe('Confirm modal — cancel', () => {
  it('clicking Annuler closes the modal without calling updateRequestStatus', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const approveBtns = wrapper.findAll('button').filter(b => b.text().trim() === 'Approuver')
    await approveBtns[0].trigger('click')
    await wrapper.vm.$nextTick()

    // Modal is open
    expect(wrapper.text()).toContain('Approuver directement')

    const cancelBtn = wrapper.findAll('button').find(b => b.text().trim() === 'Annuler')
    await cancelBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    // Modal closed, no Supabase call made
    expect(wrapper.text()).not.toContain('Approuver directement')
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe('Confirm modal — error handling', () => {
  const originalThen = noopBuilder.then.bind(noopBuilder)

  beforeEach(() => {
    useState<Array<{ id: string; message: string; type: string }>>('toasts').value = []
    noopBuilder.then = originalThen
  })

  it('approval failure shows the actual DB error message in toast, not the generic fallback', async () => {
    useState<LeaveRequestWithRelations[]>('leave-requests').value = [MANAGER_APPROVED_REQUEST]
    const wrapper = await mountSuspended(LeaveAdminView)

    // Open the confirm modal (modal confirm-label is also "Approuver")
    const approuveBtns = wrapper.findAll('button').filter(b => b.text().trim() === 'Approuver')
    await approuveBtns[0].trigger('click')
    await wrapper.vm.$nextTick()

    // Inject the DB error AFTER mount so it only affects the update call
    noopBuilder.then = (resolve: (v: { data: null; error: { message: string } }) => unknown) =>
      Promise.resolve({ data: null, error: { message: 'Aucun solde trouvé pour cet utilisateur, ce type de congé et cette année' } }).then(resolve)

    // Click the modal's confirm button — it's the last "Approuver" in the DOM
    const allApprouveBtns = wrapper.findAll('button').filter(b => b.text().trim() === 'Approuver')
    await allApprouveBtns.at(-1)!.trigger('click')
    await wrapper.vm.$nextTick()

    const toasts = useState<Array<{ message: string; type: string }>>('toasts').value
    expect(toasts[0]?.type).toBe('error')
    expect(toasts[0]?.message).toBe('Aucun solde trouvé pour cet utilisateur, ce type de congé et cette année')
  })

  it('rejection failure shows the actual DB error message in toast, not the generic fallback', async () => {
    useState<LeaveRequestWithRelations[]>('leave-requests').value = [MANAGER_APPROVED_REQUEST]
    const wrapper = await mountSuspended(LeaveAdminView)

    // Open the confirm modal (modal confirm-label is also "Refuser")
    const refuserBtns = wrapper.findAll('button').filter(b => b.text().trim() === 'Refuser')
    await refuserBtns[0].trigger('click')
    await wrapper.vm.$nextTick()

    noopBuilder.then = (resolve: (v: { data: null; error: { message: string } }) => unknown) =>
      Promise.resolve({ data: null, error: { message: 'Droits insuffisants' } }).then(resolve)

    // Click the modal's confirm button — it's the last "Refuser" in the DOM
    const allRefuserBtns = wrapper.findAll('button').filter(b => b.text().trim() === 'Refuser')
    await allRefuserBtns.at(-1)!.trigger('click')
    await wrapper.vm.$nextTick()

    const toasts = useState<Array<{ message: string; type: string }>>('toasts').value
    expect(toasts[0]?.type).toBe('error')
    expect(toasts[0]?.message).toBe('Droits insuffisants')
  })
})

// ── Rendering ────────────────────────────────────────────────────────────────

describe('Table rendering', () => {
  it('shows employee name and team name', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    expect(wrapper.text()).toContain('Emma Employée')
    expect(wrapper.text()).toContain('Équipe A')
  })

  it('shows leave type name', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    expect(wrapper.text()).toContain('Congé payé')
  })

  it('formats dates as DD/MM/YYYY (not raw ISO)', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    expect(wrapper.text()).toContain('12/05/2026')
    expect(wrapper.text()).not.toContain('2026-05-12')
  })

  it('shows days count', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    expect(wrapper.text()).toContain('5 j')
  })

  it('has a filter label for accessibility', async () => {
    const wrapper = await mountSuspended(LeaveAdminView)
    const label = wrapper.find('label[for="status-filter"]')
    expect(label.exists()).toBe(true)
    expect(label.text()).toBe('Filtrer par statut')
  })
})
