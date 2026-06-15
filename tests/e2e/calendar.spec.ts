/**
 * E2E tests for RFC-010 — Calendar (F18 employee, F19 manager, F20 admin)
 *
 * REQUIRES:
 *   - supabase start && supabase db reset  (seed applied, clean state)
 *   - yarn dev  (or playwright.config.ts webServer starts it)
 *
 * Seed state assumed:
 *   - Emma (employee1): approved Congé payé 2026-04-14 → 2026-04-18
 *   - Emma (employee1): pending Congé payé 2026-05-12 → 2026-05-16
 *   - Eddy (employee2): manager_approved RTT 2026-05-05 → 2026-05-07
 *   - Eddy (employee2): rejected Congé maladie 2026-03-10 → 2026-03-12
 *   - All employees are in Équipe A; Marc Manager manages Équipe A
 *
 * Today assumed: 2026-04-27 (outside Emma's approved range → absentToday empty)
 */

import { test, expect, type Page } from '@playwright/test'

// ── Accounts ──────────────────────────────────────────────────────────────────

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

async function goToCalendar(page: Page) {
  await page.goto('/calendar')
  await waitForHydration(page)
  await page.waitForLoadState('networkidle')
}

// French month names ordered by index (0 = January)
const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

async function goToMonth(page: Page, year: number, monthIndex: number) {
  const target = `${MONTHS_FR[monthIndex]} ${year}`
  const heading = page.locator('h2').filter({ hasText: /\d{4}/ }).first()

  for (let i = 0; i < 24; i++) {
    const current = ((await heading.textContent()) ?? '').trim().toLowerCase()
    if (current === target) return

    const parts = current.split(' ')
    const curMonthIdx = MONTHS_FR.indexOf(parts[0] ?? '')
    const curYear = parseInt(parts[1] ?? '0')
    const isBefore = curYear * 12 + curMonthIdx < year * 12 + monthIndex

    if (isBefore) {
      await page.click('button[aria-label="Mois suivant"]')
    } else {
      await page.click('button[aria-label="Mois précédent"]')
    }
    await page.waitForTimeout(150)
  }

  throw new Error(`Could not navigate to ${target}`)
}

// ── F18 — Employee view ───────────────────────────────────────────────────────

test.describe('F18 — Employee view', () => {
  test.beforeEach(async ({ page }) => { await clearSession(page) })

  test('T-010-001: happy path — approved event and legend visible in April', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await goToCalendar(page)
    await goToMonth(page, 2026, 3) // April

    const heading = page.locator('h2').filter({ hasText: /\d{4}/ }).first()
    await expect(heading).toContainText('avril 2026')

    // CalendarEvent.vue sets a title attribute on the desktop grid chip — unique to desktop
    await expect(page.locator('[title*="Emma Employée"]').first()).toBeVisible()

    // Legend spans use text-gray-700; mobile list uses text-gray-500 — select the legend one
    await expect(page.locator('.text-gray-700:has-text("Congé payé")')).toBeVisible()
  })

  test('T-010-003: Emma pending (May 12–16) not visible to Eddy', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee2) // Eddy
    await goToCalendar(page)
    await goToMonth(page, 2026, 4) // May

    // Emma is not Eddy and her pending status ≠ approved → filtered out
    await expect(page.locator('text=Emma')).toHaveCount(0)
  })

  test('T-010-004: prev / next month navigation changes heading', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await goToCalendar(page)

    // Start at current month (April 2026)
    await goToMonth(page, 2026, 3)

    // Navigate to next month
    await page.click('button[aria-label="Mois suivant"]')
    await expect(page.locator('h2').filter({ hasText: /\d{4}/ }).first())
      .toContainText('mai 2026')

    // Navigate back twice → March 2026
    await page.click('button[aria-label="Mois précédent"]')
    await page.click('button[aria-label="Mois précédent"]')
    await expect(page.locator('h2').filter({ hasText: /\d{4}/ }).first())
      .toContainText('mars 2026')
  })
})

// ── F19 — Manager view ────────────────────────────────────────────────────────

test.describe('F19 — Manager view', () => {
  test.beforeEach(async ({ page }) => { await clearSession(page) })

  test('T-010-008: "Absents aujourd\'hui" panel visible; empty outside seed range', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await goToCalendar(page)

    // Panel always visible for manager
    await expect(page.locator('h3:has-text("Absents aujourd\'hui")')).toBeVisible()

    // Today (2026-04-27) is after Emma's approved range (14–18 April)
    await expect(page.locator('text=Aucune absence aujourd\'hui.')).toBeVisible()
  })

  test('T-010-010: manager sees Emma\'s approved event in April', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await goToCalendar(page)
    await goToMonth(page, 2026, 3) // April

    await expect(page.locator('[title*="Emma Employée"]').first()).toBeVisible()
  })
})

// ── F20 — Admin view ──────────────────────────────────────────────────────────

test.describe('F20 — Admin view', () => {
  test.beforeEach(async ({ page }) => { await clearSession(page) })

  test('T-010-012: admin sees Emma\'s approved event in April', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await goToCalendar(page)
    await goToMonth(page, 2026, 3) // April

    await expect(page.locator('[title*="Emma Employée"]').first()).toBeVisible()
  })

  test('T-010-013: team filter selector visible with correct options', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await goToCalendar(page)

    await expect(page.locator('label:has-text("Filtrer par équipe")')).toBeVisible()
    await expect(page.locator('#team-filter')).toBeVisible()
    await expect(page.locator('#team-filter')).toContainText('Toutes les équipes')
    await expect(page.locator('#team-filter')).toContainText('Équipe A')
  })

  test('T-010-014: selecting a team filters events client-side', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await goToCalendar(page)
    await goToMonth(page, 2026, 3) // April

    // Filter to Équipe A — Emma's event should remain visible
    await page.selectOption('#team-filter', { label: 'Équipe A' })
    await expect(page.locator('[title*="Emma Employée"]').first()).toBeVisible()

    // Reset to all teams — still visible
    await page.selectOption('#team-filter', { label: 'Toutes les équipes' })
    await expect(page.locator('[title*="Emma Employée"]').first()).toBeVisible()
  })

  test('T-010-015: "Absents aujourd\'hui" panel absent for admin', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await goToCalendar(page)

    await expect(page.locator('text=Absents aujourd\'hui')).toHaveCount(0)
  })
})

// ── Security ──────────────────────────────────────────────────────────────────

test.describe('Security', () => {
  test('S-010-001: unauthenticated access to /calendar redirects to /login', async ({ page }) => {
    await clearSession(page)
    await page.goto('/calendar')
    await expect(page).toHaveURL('/login')
  })
})
