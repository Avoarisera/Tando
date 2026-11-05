/**
 * E2E tests — Calendrier (refonte, lot R3): month, planning and list views.
 *
 * REQUIRES: supabase start && supabase db reset (seed included), app running.
 * Seed: Emma approved 14–18 April 2026 (Congé payé), Emma pending 12–16 May 2026.
 */

import { test, expect, type Page } from '@playwright/test'

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
  employee2: { email: 'employee2@waka.com', password: 'Waka2026!' },
}

const CARD_TITLE = '.wb-card-h h2'
const BAR = '.wb-cal .wb-bar'

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
  await page.waitForURL(/\/(dashboard|profile)?$/)
  await page.goto('/calendar')
  await waitForHydration(page)
  await expect(page.locator('.wb-cal')).toBeVisible()
}

/** Click "Mois précédent / suivant" until the card shows the target month */
async function goToMonth(page: Page, year: number, month: number) {
  const now = new Date()
  const diff = (year * 12 + month) - (now.getFullYear() * 12 + now.getMonth() + 1)
  const name = diff < 0 ? 'Mois précédent' : 'Mois suivant'
  for (let i = 0; i < Math.abs(diff); i++) {
    await page.locator('.wb-card-h').getByRole('button', { name }).click()
  }
}

test.describe('R3 — Calendrier, vue mois', () => {
  test('T-R3-040: employee sees her approved leave in April 2026, with the legend', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await goToMonth(page, 2026, 4)
    await expect(page.locator(CARD_TITLE)).toHaveText('Avril 2026')
    await expect(page.locator(BAR, { hasText: 'Emma' }).first()).toBeVisible()
    await expect(page.locator('.wb-leg')).toContainText('Congé payé')
  })

  test('T-R3-041: a colleague sees approved leave but not pending requests', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee2)
    await goToMonth(page, 2026, 4)
    await expect(page.locator(BAR, { hasText: 'Emma' }).first()).toBeVisible()
    await page.locator('.wb-card-h').getByRole('button', { name: 'Mois suivant' }).click()
    await expect(page.locator(CARD_TITLE)).toHaveText('Mai 2026')
    await expect(page.locator(BAR, { hasText: 'Emma' })).toHaveCount(0)
  })

  test('T-R3-042: own pending request is hatched', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await goToMonth(page, 2026, 5)
    await expect(page.locator(`${BAR}.is-pend`, { hasText: 'Emma' }).first()).toBeVisible()
  })

  test('T-R3-043: previous, next and today change the month', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    const title = page.locator(CARD_TITLE)
    const start = await title.textContent()
    await page.locator('.wb-card-h').getByRole('button', { name: 'Mois suivant' }).click()
    await expect(title).not.toHaveText(start ?? '')
    await page.locator('.wb-card-h').getByRole('button', { name: 'Aujourd’hui' }).click()
    await expect(title).toHaveText(start ?? '')
  })

  test('T-R3-044: "Moi uniquement" hides colleagues', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee2)
    await goToMonth(page, 2026, 4)
    await expect(page.locator(BAR, { hasText: 'Emma' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Moi uniquement' }).click()
    await expect(page.locator(BAR, { hasText: 'Emma' })).toHaveCount(0)
  })

  test('T-R3-045: "Absents aujourd’hui" card is shown', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await expect(page.getByText('Absents aujourd’hui')).toBeVisible()
  })
})

test.describe('R3 — Calendrier, planning et liste', () => {
  test('T-R3-050: planning shows one row per teammate and a presence row', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await page.getByRole('button', { name: 'Planning' }).click()
    await expect(page.locator('.wb-plan [role="rowheader"]')).not.toHaveCount(0)
    await expect(page.locator('.wb-plan-ft')).toContainText('Présents')
    await expect(page.locator('.wb-plan-dh')).toHaveCount(14)
  })

  test('T-R3-051: list view groups April leave by week', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await goToMonth(page, 2026, 4)
    await page.getByRole('button', { name: 'Liste' }).click()
    await expect(page.getByText(/Semaine du 13 avril/)).toBeVisible()
    await expect(page.locator('.wb-cal-li', { hasText: 'Emma' }).first()).toBeVisible()
  })

  test('T-R3-052: admin gets a team filter', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    const team = page.getByLabel('Équipe')
    await expect(team).toBeVisible()
    await expect(team.locator('option').first()).toHaveText('Toutes les équipes')
  })

  test('T-R3-053: employee has no team filter', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await expect(page.getByLabel('Équipe')).toHaveCount(0)
  })
})

test.describe('TND-25 — Calendrier, clic sur un congé', () => {
  const EMMA_PENDING = '[data-id="00000000-0000-0000-0000-000000000041"]'
  const EMMA_APPROVED = '[data-id="00000000-0000-0000-0000-000000000043"]'
  const PANEL = '.wb-panel'

  test('T-TND25-001: manager sees the pending request of the team and can decide from the calendar', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await goToMonth(page, 2026, 5)
    const bar = page.locator(`${BAR}${EMMA_PENDING}`).first()
    await expect(bar).toContainText('à valider')
    await bar.click()
    const panel = page.locator(PANEL)
    await expect(panel).toContainText('Demande à valider')
    await expect(panel.getByRole('button', { name: 'Approuver' })).toBeVisible()
    await panel.getByRole('button', { name: 'Refuser' }).click()
    await expect(page.getByLabel(/Motif/)).toBeVisible() // same refusal modal as « À valider »
  })

  test('T-TND25-002: employee opens her own request with its actions', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await goToMonth(page, 2026, 5)
    await page.locator(`${BAR}${EMMA_PENDING}`).first().click()
    await expect(page.locator(PANEL).getByRole('button', { name: 'Modifier' })).toBeVisible()
  })

  test('T-TND25-003: a colleague sees approved leave read-only', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee2)
    await goToMonth(page, 2026, 4)
    await page.locator(`${BAR}${EMMA_APPROVED}`).first().click()
    const panel = page.locator(PANEL)
    await expect(panel).toContainText('lecture seule')
    await expect(panel.getByRole('button', { name: /Approuver|Refuser|Annuler/ })).toHaveCount(0)
  })

  test('T-TND25-004: an employee does not see colleagues\' requests to review', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee2)
    await goToMonth(page, 2026, 5)
    await expect(page.locator(`${BAR}${EMMA_PENDING}`)).toHaveCount(0)
  })
})

test.describe('R3 — Calendrier, mobile et sécurité', () => {
  test('R-R3-001: no horizontal page scroll at 390 px, planning scrolls inside', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, ACCOUNTS.manager)
    await page.getByRole('button', { name: 'Planning' }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test('S-R3-010: unauthenticated access to /calendar redirects to /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/calendar')
    await expect(page).toHaveURL('/login')
  })
})
