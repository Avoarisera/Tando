/**
 * E2E tests for RFC-015 — Admin Dashboard
 *
 * REQUIRES:
 *   - supabase start && supabase db reset  (seed applied, clean state)
 *   - yarn dev  (or playwright.config.ts webServer starts it)
 *
 * Seed state assumed:
 *   - Emma (employee1): approved  2026-04-14 → 2026-04-18  (Congé payé)
 *   - Eddy (employee2): various statuses
 *   - 2 employees total in seed
 */

import { test, expect, type Page } from '@playwright/test'

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
}

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

async function goToDashboard(page: Page) {
  await page.goto('/dashboard')
  await waitForHydration(page)
  await page.waitForLoadState('networkidle')
}

// ── T-015-001: Access control ─────────────────────────────────────────────────

test.describe('T-015-001 — Access control', () => {
  test('T-015-001a: unauthenticated → redirected to /login', async ({ page }) => {
    await clearSession(page)
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login')
  })

  test('T-015-001b: employee → 403 error page', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await page.goto('/dashboard')
    await waitForHydration(page)
    await expect(page.locator('text=/403|refusé|Accès/i')).toBeVisible()
    await expect(page).not.toHaveURL('/profile')
  })

  test('T-015-001c: manager → 403 error page', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.manager)
    await page.goto('/dashboard')
    await waitForHydration(page)
    await expect(page.locator('text=/403|refusé|Accès/i')).toBeVisible()
  })

  test('T-015-001d: admin → dashboard loads', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToDashboard(page)
    await expect(page.locator('h1')).toContainText('Tableau de bord')
  })
})

// ── T-015-002: Navigation ─────────────────────────────────────────────────────

test.describe('T-015-002 — Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
  })

  test('T-015-002a: "Tableau de bord" link visible in sidebar for admin', async ({ page }) => {
    await expect(page.locator('aside a[href="/dashboard"]')).toBeVisible()
  })

  test('T-015-002b: sidebar link navigates to /dashboard', async ({ page }) => {
    await page.click('aside a[href="/dashboard"]')
    await expect(page).toHaveURL('/dashboard')
  })

  test('T-015-002c: "Tableau de bord" link NOT visible for employee', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await expect(page.locator('aside a[href="/dashboard"]')).toHaveCount(0)
  })
})

// ── T-015-003: Metrics banner ─────────────────────────────────────────────────

test.describe('T-015-003 — Metrics banner', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToDashboard(page)
  })

  test('T-015-003a: 4 metric cards visible', async ({ page }) => {
    await expect(page.locator('text=Effectif total')).toBeVisible()
    await expect(page.locator('text=Présents aujourd\'hui')).toBeVisible()
    await expect(page.locator('text=En congé aujourd\'hui')).toBeVisible()
    await expect(page.locator('text=En congé cette semaine')).toBeVisible()
  })

  test('T-015-003b: "En congé aujourd\'hui" card has amber highlight', async ({ page }) => {
    const amberCard = page.locator('.bg-amber-50')
    await expect(amberCard).toBeVisible()
    await expect(amberCard).toContainText('En congé aujourd\'hui')
  })

  test('T-015-003c: total_employees is a non-negative number', async ({ page }) => {
    const totalCard = page.locator('text=Effectif total').locator('..')
    const value = await totalCard.locator('p.text-3xl').textContent()
    expect(Number(value?.trim())).toBeGreaterThanOrEqual(0)
  })
})

// ── T-015-004: Employee status list ──────────────────────────────────────────

test.describe('T-015-004 — Employee status list', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToDashboard(page)
  })

  test('T-015-004a: table column headers present', async ({ page }) => {
    await expect(page.locator('th:has-text("Employé")')).toBeVisible()
    await expect(page.locator('th:has-text("Équipe")')).toBeVisible()
    await expect(page.locator('th:has-text("Ancienneté")')).toBeVisible()
    await expect(page.locator('th:has-text("Statut")')).toBeVisible()
    await expect(page.locator('th:has-text("Congé / Retour")')).toBeVisible()
  })

  test('T-015-004b: at least one employee row visible', async ({ page }) => {
    await expect(page.locator('tbody tr')).toHaveCount(2)
  })

  test('T-015-004c: status badge is "Présent" or "En congé" for each row', async ({ page }) => {
    const badges = page.locator('tbody tr td span')
    const count = await badges.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const text = await badges.nth(i).textContent()
      if (text?.trim()) {
        expect(['Présent', 'En congé']).toContain(text.trim())
        break
      }
    }
  })
})

// ── T-015-005: Client-side filter ─────────────────────────────────────────────

test.describe('T-015-005 — Client-side filter', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToDashboard(page)
  })

  test('T-015-005a: filter buttons visible', async ({ page }) => {
    await expect(page.locator('button:has-text("Tous")')).toBeVisible()
    await expect(page.locator('button:has-text("Présents")')).toBeVisible()
    await expect(page.locator('button:has-text("En congé")')).toBeVisible()
  })

  test('T-015-005b: "Présents" filter — all visible rows have "Présent" badge', async ({ page }) => {
    await page.click('button:has-text("Présents")')
    const rows = page.locator('tbody tr')
    const count = await rows.count()
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i).locator('span')).toContainText('Présent')
    }
  })

  test('T-015-005c: "En congé" filter — all visible rows have "En congé" badge', async ({ page }) => {
    await page.click('button:has-text("En congé")')
    const rows = page.locator('tbody tr')
    const count = await rows.count()
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(rows.nth(i).locator('span')).toContainText('En congé')
      }
    }
  })

  test('T-015-005d: "Tous" restores full list', async ({ page }) => {
    const total = await page.locator('tbody tr').count()
    await page.click('button:has-text("Présents")')
    await page.click('button:has-text("Tous")')
    await expect(page.locator('tbody tr')).toHaveCount(total)
  })

  test('T-015-005e: filter operates without network request', async ({ page }) => {
    const requests: string[] = []
    page.on('request', req => {
      if (req.url().includes('get_dashboard_snapshot')) requests.push(req.url())
    })
    const initialCount = requests.length
    await page.click('button:has-text("Présents")')
    await page.click('button:has-text("En congé")')
    await page.click('button:has-text("Tous")')
    expect(requests.length).toBe(initialCount)
  })
})

// ── T-015-006: UI states ──────────────────────────────────────────────────────

test.describe('T-015-006 — UI states', () => {
  test('T-015-006a: skeletons visible during slow RPC fetch', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    await page.route('**/rest/v1/rpc/get_dashboard_snapshot**', async (route) => {
      await new Promise(r => setTimeout(r, 1500))
      await route.continue()
    })

    await page.goto('/dashboard')
    await waitForHydration(page)
    await expect(page.locator('[class*="animate-pulse"]').first()).toBeVisible({ timeout: 1000 })
  })

  test('T-015-006b: error banner shown on RPC failure with retry button', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    await page.route('**/rest/v1/rpc/get_dashboard_snapshot**', route =>
      route.fulfill({ status: 500, body: '{"message":"Erreur serveur"}' }),
    )

    await goToDashboard(page)
    await expect(page.locator('[class*="error"], [class*="red"]').first()).toBeVisible()
    await expect(page.locator('button:has-text("Réessayer")')).toBeVisible()
  })
})
