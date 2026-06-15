/**
 * E2E tests for RFC-009 — Admin Leave Management
 *
 * REQUIRES:
 *   - supabase start && supabase db reset  (seed applied, clean state)
 *   - yarn dev  (or playwright.config.ts webServer starts it)
 *
 * Seed state assumed (ordered by created_at DESC for admin view):
 *   - Emma (employee1): approved  2026-04-14 → 2026-04-18  (Congé payé, 5 days)
 *   - Eddy (employee2): rejected  2026-03-10 → 2026-03-12  (Congé maladie, 3 days)
 *   - Eddy (employee2): manager_approved  2026-05-05 → 2026-05-07  (RTT, 3 days)
 *   - Emma (employee1): pending   2026-05-12 → 2026-05-16  (Congé payé, 5 days)
 *   Total: 4 requests visible to admin
 *
 * NOTE: Mutation tests T-009-007 and T-009-008 alter DB state permanently.
 *       Run `supabase db reset` to restore clean state between full suite runs.
 */

import { test, expect, type Page } from '@playwright/test'

// ── Accounts ─────────────────────────────────────────────────────────────────

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waitForHydration(page: Page) {
  await page.waitForSelector('html[data-hydrated]', { timeout: 10_000 })
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/login')
  await waitForHydration(page)
  await page.fill('#email', account.email)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(profile|dashboard)/)
  await waitForHydration(page)
}

async function clearSession(page: Page) {
  await page.context().clearCookies()
}

async function goToLeaveRequests(page: Page) {
  await page.goto('/leave-requests')
  await waitForHydration(page)
  await page.waitForLoadState('networkidle')
}

// ── T-009-001: Admin table columns ────────────────────────────────────────────

test.describe('T-009-001 — Admin table structure', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveRequests(page)
  })

  test('T-009-001: admin sees all 4 requests', async ({ page }) => {
    await expect(page.locator('tbody tr')).toHaveCount(4)
  })

  test('T-009-001: all required column headers present', async ({ page }) => {
    await expect(page.locator('th:has-text("Employé")')).toBeVisible()
    await expect(page.locator('th:has-text("Équipe")')).toBeVisible()
    await expect(page.locator('th:has-text("Type")')).toBeVisible()
    await expect(page.locator('th:has-text("Période")')).toBeVisible()
    await expect(page.locator('th:has-text("Durée")')).toBeVisible()
    await expect(page.locator('th:has-text("Statut")')).toBeVisible()
    await expect(page.locator('th:has-text("Actions")')).toBeVisible()
  })

  test('T-009-001: status filter dropdown present with default "Tous les statuts"', async ({ page }) => {
    const select = page.locator('#status-filter')
    await expect(select).toBeVisible()
    await expect(select).toHaveValue('all')
    await expect(page.locator('label[for="status-filter"]')).toHaveText('Filtrer par statut')
  })

  test('T-009-001: filter select has exactly 5 options', async ({ page }) => {
    await expect(page.locator('#status-filter option')).toHaveCount(5)
  })

  test('T-009-001: filter option labels are correct French', async ({ page }) => {
    const labels = await page.locator('#status-filter option').allTextContents()
    expect(labels).toContain('Tous les statuts')
    expect(labels).toContain('En attente')
    expect(labels).toContain('Validé manager')
    expect(labels).toContain('Approuvé')
    expect(labels).toContain('Refusé')
  })
})

// ── T-009-001: Row data rendering ─────────────────────────────────────────────

test.describe('T-009-001 — Row data rendering', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveRequests(page)
  })

  test('T-009-001: shows employee names and team', async ({ page }) => {
    const body = page.locator('tbody')
    await expect(body).toContainText('Emma Employée')
    await expect(body).toContainText('Eddy Employé')
    await expect(body).toContainText('Équipe A')
  })

  test('T-009-001: shows leave type names', async ({ page }) => {
    const body = page.locator('tbody')
    await expect(body).toContainText('Congé payé')
    await expect(body).toContainText('RTT')
    await expect(body).toContainText('Congé maladie')
  })

  test('T-009-001: dates formatted as DD/MM/YYYY (not raw ISO)', async ({ page }) => {
    const body = page.locator('tbody')
    await expect(body).toContainText('12/05/2026')
    await expect(body).toContainText('14/04/2026')
    await expect(body).not.toContainText('2026-05-12')
    await expect(body).not.toContainText('2026-04-14')
  })

  test('T-009-001: shows days count with "j" suffix', async ({ page }) => {
    const body = page.locator('tbody')
    await expect(body).toContainText('5 j')
    await expect(body).toContainText('3 j')
  })
})

// ── T-009-002/003/004/005/006: Status filter ──────────────────────────────────

test.describe('T-009-002–006 — Status filter behaviour', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveRequests(page)
  })

  test('T-009-002: filter "En attente" shows 1 row (Emma pending)', async ({ page }) => {
    await page.selectOption('#status-filter', 'pending')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody')).toContainText('Emma Employée')
  })

  test('T-009-003: filter "Validé manager" shows 1 row (Eddy RTT)', async ({ page }) => {
    await page.selectOption('#status-filter', 'manager_approved')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody')).toContainText('Eddy Employé')
  })

  test('T-009-004: filter "Approuvé" shows 1 row (Emma approved)', async ({ page }) => {
    await page.selectOption('#status-filter', 'approved')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody')).toContainText('Emma Employée')
  })

  test('T-009-005: filter "Refusé" shows 1 row (Eddy rejected)', async ({ page }) => {
    await page.selectOption('#status-filter', 'rejected')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody')).toContainText('Eddy Employé')
  })

  test('T-009-006: switching back to "Tous les statuts" restores all 4 rows', async ({ page }) => {
    await page.selectOption('#status-filter', 'pending')
    await expect(page.locator('tbody tr')).toHaveCount(1)

    await page.selectOption('#status-filter', 'all')
    await expect(page.locator('tbody tr')).toHaveCount(4)
  })

  test('T-009-002: filtering is client-side (no Supabase call on filter change)', async ({ page }) => {
    let callCount = 0
    page.on('request', req => {
      if (req.url().includes('rest/v1/leave_requests')) callCount++
    })

    await page.selectOption('#status-filter', 'pending')
    await page.waitForTimeout(400)

    expect(callCount).toBe(0)
  })
})

// ── T-009-010: Action button matrix ───────────────────────────────────────────

test.describe('T-009-010 — Action button visibility per status', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveRequests(page)
  })

  test('T-009-010: pending row shows Approuver + Refuser buttons', async ({ page }) => {
    await page.selectOption('#status-filter', 'pending')
    const btns = page.locator('tbody').getByRole('button')
    await expect(btns.filter({ hasText: 'Approuver' })).toBeVisible()
    await expect(btns.filter({ hasText: 'Refuser' })).toBeVisible()
  })

  test('T-009-010: manager_approved row shows Approuver + Refuser buttons', async ({ page }) => {
    await page.selectOption('#status-filter', 'manager_approved')
    const btns = page.locator('tbody').getByRole('button')
    await expect(btns.filter({ hasText: 'Approuver' })).toBeVisible()
    await expect(btns.filter({ hasText: 'Refuser' })).toBeVisible()
  })

  test('T-009-010: approved row shows NO action buttons', async ({ page }) => {
    await page.selectOption('#status-filter', 'approved')
    const btns = page.locator('tbody').getByRole('button')
    await expect(btns.filter({ hasText: 'Approuver' })).toHaveCount(0)
    await expect(btns.filter({ hasText: 'Refuser' })).toHaveCount(0)
  })

  test('T-009-010: rejected row shows NO action buttons', async ({ page }) => {
    await page.selectOption('#status-filter', 'rejected')
    const btns = page.locator('tbody').getByRole('button')
    await expect(btns.filter({ hasText: 'Approuver' })).toHaveCount(0)
    await expect(btns.filter({ hasText: 'Refuser' })).toHaveCount(0)
  })

  test('T-009-010: all 4 rows — exactly 4 action buttons (2 per actionable row)', async ({ page }) => {
    const allActionBtns = page.locator('tbody button').filter({
      hasText: /Approuver|Refuser/,
    })
    await expect(allActionBtns).toHaveCount(4)
  })
})

// ── T-009-011: Confirm modal — cancel ─────────────────────────────────────────

test.describe('T-009-011 — Confirm modal cancel', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveRequests(page)
  })

  test('T-009-011: cancel approve modal — no Supabase mutation', async ({ page }) => {
    let mutationCalled = false
    page.on('request', req => {
      if (req.method() === 'PATCH' && req.url().includes('leave_requests')) {
        mutationCalled = true
      }
    })

    await page.selectOption('#status-filter', 'pending')
    await page.locator('tbody button:has-text("Approuver")').click()

    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await page.locator('[role="dialog"] button:has-text("Annuler")').click()

    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    expect(mutationCalled).toBe(false)
  })

  test('T-009-011: cancel reject modal — no Supabase mutation', async ({ page }) => {
    let mutationCalled = false
    page.on('request', req => {
      if (req.method() === 'PATCH' && req.url().includes('leave_requests')) {
        mutationCalled = true
      }
    })

    await page.selectOption('#status-filter', 'pending')
    await page.locator('tbody button:has-text("Refuser")').click()

    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await page.locator('[role="dialog"] button:has-text("Annuler")').click()

    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    expect(mutationCalled).toBe(false)
  })
})

// ── Confirm modal wording ─────────────────────────────────────────────────────

test.describe('Confirm modal wording', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveRequests(page)
  })

  test('approve pending → bypass wording shown', async ({ page }) => {
    await page.selectOption('#status-filter', 'pending')
    await page.locator('tbody button:has-text("Approuver")').click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('sans validation manager')
    await expect(dialog).toContainText('Approuver directement')

    await page.locator('[role="dialog"] button:has-text("Annuler")').click()
  })

  test('approve manager_approved → standard wording with employee name', async ({ page }) => {
    await page.selectOption('#status-filter', 'manager_approved')
    await page.locator('tbody button:has-text("Approuver")').click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Approuver la demande de Eddy Employé ?')
    await expect(dialog).not.toContainText('sans validation manager')

    await page.locator('[role="dialog"] button:has-text("Annuler")').click()
  })

  test('reject pending → reject wording with employee name', async ({ page }) => {
    await page.selectOption('#status-filter', 'pending')
    await page.locator('tbody button:has-text("Refuser")').click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Refuser la demande de Emma Employée ?')

    await page.locator('[role="dialog"] button:has-text("Annuler")').click()
  })

  test('approve modal shows formatted period description', async ({ page }) => {
    await page.selectOption('#status-filter', 'pending')
    await page.locator('tbody button:has-text("Approuver")').click()

    // Emma pending: 2026-05-12 → 2026-05-16
    await expect(page.locator('[role="dialog"]')).toContainText('du 12/05/2026 au 16/05/2026')

    await page.locator('[role="dialog"] button:has-text("Annuler")').click()
  })
})

// ── Security ──────────────────────────────────────────────────────────────────

test.describe('Security', () => {
  test('S-009-001: unauthenticated access redirects to /login', async ({ page }) => {
    await clearSession(page)
    await page.goto('/leave-requests')
    await expect(page).toHaveURL('/login')
  })

  test('S-009-002: employee sees own view — no admin table', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await goToLeaveRequests(page)

    // Employee view shows own requests, no admin filter
    await expect(page.locator('#status-filter')).toHaveCount(0)
    await expect(page.locator('th:has-text("Équipe")')).toHaveCount(0)
  })

  test('S-009-003: manager sees manager view — no admin filter', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.manager)
    await goToLeaveRequests(page)

    // Manager view has sections like "À valider" but no status filter
    await expect(page.locator('#status-filter')).toHaveCount(0)
    await expect(page.locator('h2:has-text("À valider")')).toBeVisible()
  })
})

// ── UI states ─────────────────────────────────────────────────────────────────

test.describe('UI states — loading / error / empty / content', () => {
  test('loading: skeletons visible during slow fetch', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    await page.route('**/rest/v1/leave_requests**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })

    await page.goto('/leave-requests')
    await waitForHydration(page)

    await expect(page.locator('.animate-pulse').first()).toBeVisible()
    await expect(page.locator('.animate-pulse').first()).not.toBeVisible({ timeout: 5_000 })
  })

  test('error: AppErrorBanner with retry when Supabase fails', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    await page.route('**/rest/v1/leave_requests**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: '500', details: null, hint: null, message: 'Erreur serveur simulée' }),
      })
    )

    await page.goto('/leave-requests')
    await waitForHydration(page)

    await expect(page.locator('button:has-text("Réessayer")')).toBeVisible({ timeout: 5_000 })
  })

  test('empty (no data): AppEmptyState with "enregistrée" message', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    await page.route('**/rest/v1/leave_requests**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )

    await page.goto('/leave-requests')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Aucune demande', { exact: true })).toBeVisible()
    await expect(page.locator('text=enregistrée')).toBeVisible()
    // No filter dropdown when there's no data to show
    await expect(page.locator('tbody tr')).toHaveCount(0)
  })

  test('empty (filtered): message says "ne correspond à ce filtre"', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    await page.route('**/rest/v1/leave_requests**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )

    await page.goto('/leave-requests')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')

    // Change filter — empty state message should update
    await page.selectOption('#status-filter', 'pending')

    await expect(page.locator('text=ne correspond à ce filtre')).toBeVisible()
    await expect(page.locator('text=enregistrée')).not.toBeVisible()
  })
})

// ── T-009-007/008: Mutation tests ─────────────────────────────────────────────
// NOTE: These tests alter DB state permanently.
// Run `supabase db reset` after executing to restore clean seed state.

test.describe('Mutation tests — require supabase db reset after', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveRequests(page)
  })

  test('T-009-007: bypass-approve Emma pending → toast + status changes to approved', async ({ page }) => {
    await page.selectOption('#status-filter', 'pending')
    await expect(page.locator('tbody tr')).toHaveCount(1)

    await page.locator('tbody button:has-text("Approuver")').click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toContainText('sans validation manager')

    // Confirm the action
    await dialog.locator('button:has-text("Approuver")').click()

    // Toast appears
    await expect(page.locator('text=Demande approuvée — solde mis à jour')).toBeVisible({ timeout: 8_000 })

    // After fetch refresh: Emma's request no longer shows in "pending" filter
    await expect(page.getByText('Aucune demande', { exact: true })).toBeVisible({ timeout: 8_000 })
  })

  test('T-009-008: reject Eddy manager_approved → toast + status changes to rejected', async ({ page }) => {
    await page.selectOption('#status-filter', 'manager_approved')
    await expect(page.locator('tbody tr')).toHaveCount(1)

    await page.locator('tbody button:has-text("Refuser")').click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toContainText('Refuser la demande de Eddy Employé ?')

    // Confirm the action
    await dialog.locator('button:has-text("Refuser")').click()

    // Toast appears
    await expect(page.locator('text=Demande refusée')).toBeVisible({ timeout: 8_000 })

    // After fetch refresh: no more manager_approved requests
    await expect(page.getByText('Aucune demande', { exact: true })).toBeVisible({ timeout: 8_000 })
  })
})
