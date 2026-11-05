/**
 * E2E tests — Mes congés and the "Poser un congé" panel (refonte, lot R3)
 *
 * REQUIRES: supabase start && supabase db reset (seed included), app running.
 * Seed: Emma (employee1) has 25 days of Congé payé in the current year, the
 * other types at 0. Dates are relative to today so the suite does not rot.
 */

import { test, expect, type Page } from '@playwright/test'

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
  employee2: { email: 'employee2@waka.com', password: 'Waka2026!' },
}

const PANEL = '.wb-panel[role="dialog"]'
const HEADER_LEAVE = 'header.wb-head button:has-text("Poser un congé")'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Next weekday at least `minDays` ahead (shown by the two-month picker) */
function weekdayAhead(minDays: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + minDays)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d
}

/** Requests must stay in the current year (balances are per year) */
function sameYear(...dates: Date[]) {
  return dates.every(d => d.getFullYear() === new Date().getFullYear())
}

async function waitForHydration(page: Page) {
  await page.waitForSelector('html[data-hydrated]')
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.context().clearCookies()
  await page.goto('/login')
  await waitForHydration(page)
  await page.fill('#email', account.email)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard)?$/)
  await waitForHydration(page)
}

async function openPanel(page: Page) {
  await page.locator(HEADER_LEAVE).click()
  await expect(page.locator(PANEL)).toBeVisible()
  // types and balances loaded: a type is preselected
  await expect(page.locator(`${PANEL} .wb-rc.is-on`)).toHaveCount(1)
}

/** First pickable day on or after `min` (earlier runs may have booked some days) */
async function firstFreeDay(page: Page, min: Date): Promise<string | null> {
  const dates = await page.locator(`${PANEL} .wb-rp-d:not([disabled])`).evaluateAll(
    (els, m) => els.map(e => e.getAttribute('data-date') ?? '').filter(d => d >= m), iso(min))
  return dates[0] ?? null
}

async function pickRange(page: Page, a: Date, b: Date) {
  await page.locator(`${PANEL} .wb-rp-d[data-date="${iso(a)}"]`).click()
  await page.locator(`${PANEL} .wb-rp-d[data-date="${iso(b)}"]`).click()
}

// ============================================================
// Entry points per role
// ============================================================
test.describe('R3 — "Poser un congé" per role', () => {
  test('T-R3-001: employee and manager get the header button, admin does not', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await expect(page.locator(HEADER_LEAVE)).toBeVisible()
    await signIn(page, ACCOUNTS.manager)
    await expect(page.locator(HEADER_LEAVE)).toBeVisible()
    await signIn(page, ACCOUNTS.admin)
    await expect(page.locator(HEADER_LEAVE)).toHaveCount(0)
  })

  test('T-R3-002: admin visiting /leave-requests lands on /approvals', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await page.goto('/leave-requests')
    await expect(page).toHaveURL('/approvals')
  })
})

// ============================================================
// Panel
// ============================================================
test.describe('R3 — Request panel', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await openPanel(page)
  })

  test('T-R3-010: lists the active types with their remaining days, Congé payé preselected', async ({ page }) => {
    const cards = page.locator(`${PANEL} .wb-rc`)
    await expect(cards).not.toHaveCount(0)
    await expect(page.locator(`${PANEL} .wb-rc.is-on`)).toContainText('Congé payé')
    await expect(page.locator(`${PANEL} .wb-rc.is-on`)).toContainText(/\d+ j restants?/)
  })

  test('T-R3-011: submit is disabled until dates are picked', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Envoyer la demande' })).toBeDisabled()
    await expect(page.locator(`${PANEL} .wb-req-sum`)).toContainText('Choisissez vos dates')
  })

  test('T-R3-012: past days and weekends cannot be picked', async ({ page }) => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const cell = page.locator(`${PANEL} .wb-rp-d[data-date="${iso(yesterday)}"]`)
    if (await cell.count()) await expect(cell).toBeDisabled()
    const sat = new Date()
    while (sat.getDay() !== 6) sat.setDate(sat.getDate() + 1)
    await expect(page.locator(`${PANEL} .wb-rp-d[data-date="${iso(sat)}"]`)).toBeDisabled()
  })

  test('T-R3-013: shows the day count and the balance after the request', async ({ page }) => {
    const a = weekdayAhead(10)
    test.skip(!sameYear(a), 'end of year: no balance for next year in the seed')
    await pickRange(page, a, a)
    await expect(page.locator(`${PANEL} .wb-req-sum`)).toContainText('1 jour')
    await expect(page.locator(`${PANEL} .wb-req-sum`)).toContainText('Solde après cette demande')
    await expect(page.getByRole('button', { name: 'Envoyer la demande' })).toBeEnabled()
  })

  test('T-R3-014: a type without days left blocks the request with a danger banner', async ({ page }) => {
    const a = weekdayAhead(10)
    test.skip(!sameYear(a), 'end of year')
    await page.locator(`${PANEL} .wb-rc`, { hasText: 'RTT' }).click()
    await pickRange(page, a, a)
    await expect(page.locator(`${PANEL} .wb-banner.wb-t-danger`)).toContainText('Solde insuffisant.')
    await expect(page.getByRole('button', { name: 'Envoyer la demande' })).toBeDisabled()
  })

  test('T-R3-015: the comment counter follows the text', async ({ page }) => {
    await page.locator(`${PANEL} textarea`).fill('Une semaine en famille')
    await expect(page.locator(`${PANEL} .wb-hint .wb-num`)).toHaveText('22 / 500')
  })

  test('T-R3-016: Escape and the close button close the panel', async ({ page }) => {
    await page.keyboard.press('Escape')
    await expect(page.locator(PANEL)).toHaveCount(0)
    await openPanel(page)
    await page.locator(PANEL).getByRole('button', { name: 'Fermer' }).click()
    await expect(page.locator(PANEL)).toHaveCount(0)
  })
})

// ============================================================
// Happy path and own overlap
// ============================================================
test.describe('R3 — Sending a request', () => {
  test('T-R3-020: sends → toast → panel closes → shows under "En cours de validation"; days already booked are blocked', async ({ page }) => {
    const min = weekdayAhead(14)
    test.skip(!sameYear(min), 'end of year')
    await signIn(page, ACCOUNTS.employee1)
    await openPanel(page)
    const day = await firstFreeDay(page, min)
    test.skip(!day || !day.startsWith(String(new Date().getFullYear())), 'no free day left this year')
    await page.locator(`${PANEL} .wb-rp-d[data-date="${day}"]`).click()
    await page.locator(`${PANEL} .wb-rp-d[data-date="${day}"]`).click()
    await page.locator(`${PANEL} textarea`).fill('E2E refonte')
    await page.getByRole('button', { name: 'Envoyer la demande' }).click()
    await expect(page.locator(PANEL)).toHaveCount(0)
    await expect(page.getByText('Demande envoyée')).toBeVisible()

    await page.goto('/leave-requests?tab=pending')
    await expect(page.locator('.wb-tabs [aria-selected="true"]')).toContainText('En cours de validation')
    const card = page.locator(`.wb-lc[data-start="${day}"]`).first()
    await expect(card).toContainText('Congé payé')
    await expect(card).toContainText('En attente')

    // Detail panel
    await card.locator('.wb-lc-open').click()
    await expect(page.locator(PANEL)).toContainText('E2E refonte')
    await expect(page.locator(PANEL)).toContainText('Demande envoyée')
    await page.keyboard.press('Escape')

    // The same days can no longer be picked
    await openPanel(page)
    await expect(page.locator(`${PANEL} .wb-rp-d[data-date="${day}"]`)).toBeDisabled()
  })
})

// ============================================================
// Mes congés list
// ============================================================
test.describe('R3 — Mes congés', () => {
  test('T-R3-030: four tabs with counts; ?tab= selects a tab', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await page.goto('/leave-requests?tab=past')
    const tabs = page.locator('.wb-tabs [role="tab"]')
    await expect(tabs).toHaveCount(4)
    await expect(tabs.nth(0)).toContainText('À venir')
    await expect(tabs.nth(3)).toContainText('Refusés')
    await expect(page.locator('.wb-tabs [aria-selected="true"]')).toContainText('Passés')
  })

  test('T-R3-031: arrow keys move between tabs', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await page.goto('/leave-requests?tab=upcoming')
    await waitForHydration(page)
    await page.locator('.wb-tabs [aria-selected="true"]').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/tab=pending/)
  })

  test('T-R3-032: error state shows a retry button', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await page.route('**/rest/v1/leave_requests*', route => route.fulfill({ status: 500, body: '{"message":"boom"}' }))
    await page.goto('/leave-requests')
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible()
  })
})

// ============================================================
// Security
// ============================================================
test.describe('Security — R3', () => {
  test('S-R3-001: unauthenticated access to /leave-requests redirects to /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/leave-requests')
    await expect(page).toHaveURL('/login')
  })

  test('S-R3-002: employee2 does not see employee1 comments', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee2)
    await page.goto('/leave-requests?tab=pending')
    await expect(page.getByText('E2E refonte')).toHaveCount(0)
  })

  test('S-R3-003: an XSS payload in the comment is rendered as text', async ({ page }) => {
    const min = weekdayAhead(21)
    test.skip(!sameYear(min), 'end of year')
    await signIn(page, ACCOUNTS.employee1)
    await openPanel(page)
    const day = await firstFreeDay(page, min)
    test.skip(!day || !day.startsWith(String(new Date().getFullYear())), 'no free day left this year')
    await page.locator(`${PANEL} .wb-rp-d[data-date="${day}"]`).click()
    const xss = '<img src=x onerror="window.__xss=1">'
    await page.locator(`${PANEL} textarea`).fill(xss)
    await page.getByRole('button', { name: 'Envoyer la demande' }).click()
    await expect(page.locator(PANEL)).toHaveCount(0)
    await page.goto('/leave-requests?tab=pending')
    await page.locator(`.wb-lc[data-start="${day}"] .wb-lc-open`).first().click()
    await expect(page.locator(PANEL).getByText(xss)).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss)).toBeUndefined()
  })
})
