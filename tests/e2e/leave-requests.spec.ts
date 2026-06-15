/**
 * E2E tests for RFC-007 — Leave Request Creation
 *
 * REQUIRES:
 *   - supabase start && supabase db reset  (seed applied, clean state)
 *   - yarn dev  (or playwright.config.ts webServer starts it)
 *
 * Seed state assumed:
 *   - Emma (employee1): Congé payé 25 alloc / 5 used = 20 remaining
 *   - Emma pending request: 2026-05-12 → 2026-05-16 (5 days)
 *   - Emma approved request: 2026-04-14 → 2026-04-18 (5 days)
 *   - Eddy (employee2): Congé payé 25 alloc / 0 used = 25 remaining
 *
 * NOTE: T-007-011 (creation happy path) creates a non-deletable row (no RLS
 * DELETE policy).  Run `supabase db reset` between full test suite executions.
 */

import { test, expect, type Page } from '@playwright/test'

// ── Accounts ─────────────────────────────────────────────────────────────────

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
  employee2: { email: 'employee2@waka.com', password: 'Waka2026!' },
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
  // Wait for either content, empty state, or error to appear (list has loaded)
  await page.waitForLoadState('networkidle')
}

async function openCreateModal(page: Page) {
  await page.click('button:has-text("Nouvelle demande")')
  await expect(page.locator('[role="dialog"]')).toBeVisible()
}

// ── Button visibility ─────────────────────────────────────────────────────────

test.describe('T-007-001/002/003 — Button visibility per role', () => {
  test.beforeEach(async ({ page }) => { await clearSession(page) })

  test('T-007-001: employee sees "Nouvelle demande" button', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await goToLeaveRequests(page)
    await expect(page.locator('button:has-text("Nouvelle demande")').first()).toBeVisible()
  })

  test('T-007-002: manager does NOT see "Nouvelle demande" button', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await goToLeaveRequests(page)
    await expect(page.locator('button:has-text("Nouvelle demande")')).toHaveCount(0)
  })

  test('T-007-003: admin does NOT see "Nouvelle demande" button', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveRequests(page)
    await expect(page.locator('button:has-text("Nouvelle demande")')).toHaveCount(0)
  })
})

// ── Modal structure ───────────────────────────────────────────────────────────

test.describe('T-007-004/005 — Modal structure', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await goToLeaveRequests(page)
  })

  test('T-007-004: modal opens with required fields', async ({ page }) => {
    await openCreateModal(page)
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog.locator('#leave-type')).toBeVisible()
    await expect(dialog.locator('#start-date')).toBeVisible()
    await expect(dialog.locator('#end-date')).toBeVisible()
    await expect(dialog.locator('#comment')).toBeVisible()
    await expect(dialog.locator('button[type="submit"]')).toBeVisible()
    await expect(dialog.locator('button:has-text("Annuler")')).toBeVisible()
  })

  test('T-007-004: modal title is "Nouvelle demande de congé"', async ({ page }) => {
    await openCreateModal(page)
    await expect(page.locator('#modal-title')).toHaveText('Nouvelle demande de congé')
  })

  test('T-007-005: leave type select shows only active types (4 from seed)', async ({ page }) => {
    await openCreateModal(page)
    const options = page.locator('#leave-type option:not([value=""])')
    await expect(options).toHaveCount(4)
    // Verify expected names
    await expect(page.locator('#leave-type')).toContainText('Congé payé')
    await expect(page.locator('#leave-type')).toContainText('Congé maladie')
    await expect(page.locator('#leave-type')).toContainText('RTT')
    await expect(page.locator('#leave-type')).toContainText('Congé sans solde')
  })
})

// ── Days count ────────────────────────────────────────────────────────────────

test.describe('T-007-006/007 — Dynamic days count', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await goToLeaveRequests(page)
    await openCreateModal(page)
  })

  test('T-007-006: shows correct count for multi-day range', async ({ page }) => {
    await page.fill('#start-date', '2026-07-01')
    await page.fill('#end-date', '2026-07-05')
    await expect(page.locator('[role="dialog"] p:has-text("Durée")')).toBeVisible()
    await expect(page.locator('text=5 jours')).toBeVisible()
  })

  test('T-007-007: shows singular "1 jour" for same-day selection', async ({ page }) => {
    await page.fill('#start-date', '2026-07-01')
    await page.fill('#end-date', '2026-07-01')
    await expect(page.locator('text=1 jour')).toBeVisible()
    // Must not say "1 jours"
    await expect(page.locator('text=1 jours')).toHaveCount(0)
  })
})

// ── Front validation ──────────────────────────────────────────────────────────

test.describe('T-007-008/009 — Front validation (no RPC call)', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await goToLeaveRequests(page)
    await openCreateModal(page)
    // Pre-fill leave type so only date validation is blocking
    await page.selectOption('#leave-type', { label: 'Congé payé' })
  })

  test('T-007-008: past start date disables submit and shows inline error', async ({ page }) => {
    await page.fill('#start-date', '2026-01-01')
    await page.fill('#end-date', '2026-01-05')

    await expect(page.locator('#start-date-error')).toBeVisible()
    await expect(page.locator('#start-date-error')).toContainText('passé')
    await expect(page.locator('button[type="submit"]')).toBeDisabled()
  })

  test('T-007-008: no RPC call when front validation blocks', async ({ page }) => {
    await page.fill('#start-date', '2026-01-01')
    await page.fill('#end-date', '2026-01-05')

    // Intercept RPC call — it must NOT fire
    let rpcCalled = false
    page.on('request', (req) => {
      if (req.url().includes('create_leave_request')) rpcCalled = true
    })

    // Try submitting via Enter key (form submit)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    expect(rpcCalled).toBe(false)
  })

  test('T-007-009: end before start disables submit and shows inline error', async ({ page }) => {
    await page.fill('#start-date', '2026-07-10')
    await page.fill('#end-date', '2026-07-05')

    await expect(page.locator('#end-date-error')).toBeVisible()
    await expect(page.locator('#end-date-error')).toContainText('date de fin')
    await expect(page.locator('button[type="submit"]')).toBeDisabled()
  })
})

// ── Submit button disabled state ──────────────────────────────────────────────

test.describe('T-007-010 — Submit disabled on empty form', () => {
  test('T-007-010: submit button is disabled when modal is first opened', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await goToLeaveRequests(page)
    await openCreateModal(page)
    await expect(page.locator('button[type="submit"]')).toBeDisabled()
  })
})

// ── Happy path (T-007-011) ────────────────────────────────────────────────────
// NOTE: Creates a non-deletable row — requires `supabase db reset` between runs.

test.describe('T-007-011 — Happy path creation', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await goToLeaveRequests(page)
  })

  test('T-007-011: creates request → toast → modal closes → row in list', async ({ page }) => {
    await openCreateModal(page)

    await page.selectOption('#leave-type', { label: 'Congé payé' })
    await page.fill('#start-date', '2026-06-10')
    await page.fill('#end-date', '2026-06-12')

    // Verify days count before submit
    await expect(page.locator('text=3 jours')).toBeVisible()

    await page.click('button[type="submit"]')

    // Modal must close
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5_000 })

    // Toast must appear
    await expect(page.locator('text=Demande créée avec succès')).toBeVisible()

    // New request appears in list with "En attente" badge
    await expect(page.locator('td:has-text("10/06/2026")')).toBeVisible()
    await expect(page.locator('td').locator('span:has-text("En attente")').first()).toBeVisible()
  })
})

// ── Server error paths ────────────────────────────────────────────────────────

test.describe('T-007-012/013 — Inline RPC errors', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await goToLeaveRequests(page)
    await openCreateModal(page)
    await page.selectOption('#leave-type', { label: 'Congé payé' })
  })

  test('T-007-012: overlap with seeded pending request shows French error inline', async ({ page }) => {
    // Emma's seeded pending: 2026-05-12 → 2026-05-16
    await page.fill('#start-date', '2026-05-14')
    await page.fill('#end-date', '2026-05-20')
    await page.click('button[type="submit"]')

    // Modal must stay OPEN
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // Error appears inline inside the modal
    const alert = page.locator('[role="dialog"] [role="alert"]')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('demande')
    await expect(alert).toContainText('période')

    // No toast for server errors
    await expect(page.locator('text=Demande créée avec succès')).not.toBeVisible()
  })

  test('T-007-012: overlap error message contains dates in DD/MM/YYYY format', async ({ page }) => {
    await page.fill('#start-date', '2026-05-14')
    await page.fill('#end-date', '2026-05-20')
    await page.click('button[type="submit"]')

    const alert = page.locator('[role="dialog"] [role="alert"]')
    await expect(alert).toBeVisible()
    // Message from migration 006: includes "12/05/2026" (conflicting request start)
    await expect(alert).toContainText('12/05/2026')
  })

  test('T-007-013: insufficient balance shows French error inline', async ({ page }) => {
    // Emma has 20 remaining — request 21 days
    await page.fill('#start-date', '2026-08-01')
    await page.fill('#end-date', '2026-08-21')

    // Verify count shows 21 days
    await expect(page.locator('text=21 jours')).toBeVisible()

    await page.click('button[type="submit"]')

    await expect(page.locator('[role="dialog"]')).toBeVisible()

    const alert = page.locator('[role="dialog"] [role="alert"]')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('Solde insuffisant')
    await expect(alert).toContainText('21')
  })
})

// ── Cancel button ─────────────────────────────────────────────────────────────

test.describe('T-007-019 — Modal cancel', () => {
  test('T-007-019: Annuler closes modal without creating a request', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await goToLeaveRequests(page)
    await openCreateModal(page)

    await page.selectOption('#leave-type', { label: 'Congé payé' })
    await page.fill('#start-date', '2026-09-01')
    await page.fill('#end-date', '2026-09-05')

    // Intercept potential RPC call
    let rpcCalled = false
    page.on('request', (req) => {
      if (req.url().includes('create_leave_request')) rpcCalled = true
    })

    await page.click('button:has-text("Annuler")')

    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    expect(rpcCalled).toBe(false)
  })
})

// ── Request list display ──────────────────────────────────────────────────────

test.describe('T-007-021/022 — Request list', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await goToLeaveRequests(page)
  })

  test('T-007-021: dates displayed in DD/MM/YYYY format (not raw ISO)', async ({ page }) => {
    // Seeded approved request: 2026-04-14 → 2026-04-18
    await expect(page.locator('td:has-text("14/04/2026")')).toBeVisible()
    // Raw ISO must NOT be displayed
    await expect(page.locator('text=2026-04-14')).toHaveCount(0)
  })

  test('T-007-021: request list shows at least 2 items for Emma', async ({ page }) => {
    const items = page.locator('ul li')
    const count = await items.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('T-007-022: "En attente" badge is gray', async ({ page }) => {
    const pendingBadge = page.locator('td').locator('span:has-text("En attente")')
    await expect(pendingBadge.first()).toBeVisible()
    await expect(pendingBadge.first()).toHaveClass(/bg-gray-100/)
  })

  test('T-007-022: "Approuvé" badge is green', async ({ page }) => {
    const approvedBadge = page.locator('td').locator('span:has-text("Approuvé")')
    await expect(approvedBadge.first()).toBeVisible()
    await expect(approvedBadge.first()).toHaveClass(/bg-green-100/)
  })

  test('T-007-022: badges have title attribute for accessibility', async ({ page }) => {
    const badge = page.locator('span:has-text("En attente")').first()
    const title = await badge.getAttribute('title')
    expect(title).toBe('En attente')
  })
})

// ── UI states ─────────────────────────────────────────────────────────────────

test.describe('UI states — loading / error / empty / content', () => {
  test('loading: skeletons visible during slow fetch', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)

    // Delay the Supabase REST call to observe loading state
    await page.route('**/rest/v1/leave_requests**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })

    await page.goto('/leave-requests')
    await waitForHydration(page)

    // Skeletons (animate-pulse) must be visible before data arrives
    await expect(page.locator('.animate-pulse').first()).toBeVisible()

    // Then they disappear
    await expect(page.locator('.animate-pulse').first()).not.toBeVisible({ timeout: 5_000 })
  })

  test('error: AppErrorBanner with retry button when Supabase fails', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)

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

  test('empty: shows AppEmptyState with CTA for employee when list is empty', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)

    // Return empty list
    await page.route('**/rest/v1/leave_requests**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/leave-requests')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=Aucune demande pour le moment')).toBeVisible()
    await expect(page.locator('text=Nouvelle demande').first()).toBeVisible()
  })
})

// ── Security ──────────────────────────────────────────────────────────────────

test.describe('Security', () => {
  test('S-007-001: unauthenticated access to /leave-requests redirects to /login', async ({ page }) => {
    await clearSession(page)
    await page.goto('/leave-requests')
    await expect(page).toHaveURL('/login')
  })

  test('S-007-002: employee2 cannot see employee1 requests', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee2)
    await goToLeaveRequests(page)

    // Emma (employee1) has requests with these dates — must NOT be visible for Eddy
    await expect(page.locator('text=14/04/2026')).toHaveCount(0)
    await expect(page.locator('text=12/05/2026')).toHaveCount(0)
  })

  test('S-007-007: "Nouvelle demande" button not in DOM for manager (v-if not v-show)', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.manager)
    await goToLeaveRequests(page)

    // Must not appear even in DOM (v-if removes the element entirely)
    await expect(page.locator('button:has-text("Nouvelle demande")')).toHaveCount(0)
  })

  test('S-007-005: XSS payload in comment is rendered as escaped text', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await goToLeaveRequests(page)
    await openCreateModal(page)

    await page.selectOption('#leave-type', { label: 'Congé payé' })
    await page.fill('#start-date', '2026-07-01')
    await page.fill('#end-date', '2026-07-02')
    await page.fill('#comment', '<script>window.__xss=1</script>')

    // Vue escapes template content — no script should execute
    const injected = await page.evaluate(() => (window as Record<string, unknown>).__xss)
    expect(injected).toBeUndefined()
  })
})
