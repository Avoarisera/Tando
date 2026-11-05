/**
 * E2E tests — lot R8, leave side: working days and public holidays, half days,
 * edit / cancel a request, refusal reason, cancellation review, holidays admin.
 *
 * REQUIRES: supabase start && supabase db reset (seed + R8 migrations), app running.
 * Dates are relative to today and stay in the current year (balances are per year).
 */

import { test, expect, type Page } from '@playwright/test'

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
}
const PANEL = '.wb-panel[role="dialog"]'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function weekdayAhead(minDays: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + minDays)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d
}
const thisYear = (d: Date) => d.getFullYear() === new Date().getFullYear()

async function signIn(page: Page, account: { email: string; password: string }, path = '/') {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.waitForSelector('html[data-hydrated]')
  await page.fill('#email', account.email)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard)?$/)
  if (path !== '/') await page.goto(path)
  await page.waitForSelector('html[data-hydrated]')
}

async function openPanel(page: Page) {
  await page.locator('header.wb-head button:has-text("Poser un congé")').click()
  await expect(page.locator(`${PANEL} .wb-rc.is-on`)).toHaveCount(1)
}

/** Creates a 1-day Congé payé request through the panel and returns its date */
async function requestDay(page: Page, d: Date, comment = 'E2E R8') {
  await openPanel(page)
  await page.locator(`${PANEL} .wb-rc`, { hasText: 'Congé payé' }).click()
  await page.locator(`${PANEL} .wb-rp-d[data-date="${iso(d)}"]`).click()
  await page.locator(`${PANEL} textarea`).fill(comment)
  await page.getByRole('button', { name: 'Envoyer la demande' }).click()
  await expect(page.locator(PANEL)).toHaveCount(0)
  return iso(d)
}

test.describe('R8 — Jours ouvrés, fériés, demi-journées', () => {
  test('T-R8-001: a public holiday is greyed out with its name', async ({ page }) => {
    const xmas = new Date(new Date().getFullYear(), 11, 25)
    test.skip((xmas.getTime() - Date.now()) / 86_400_000 > 55, 'Christmas is not in the two months shown')
    await signIn(page, ACCOUNTS.employee1)
    await openPanel(page)
    const cell = page.locator(`${PANEL} .wb-rp-d[data-date="${iso(xmas)}"]`)
    await expect(cell).toBeDisabled()
    await expect(cell).toHaveAttribute('title', /Noël/)
  })

  test('T-R8-002: an afternoon on a single day counts 0,5 working day', async ({ page }) => {
    const d = weekdayAhead(12)
    test.skip(!thisYear(d), 'end of year')
    await signIn(page, ACCOUNTS.employee1)
    await openPanel(page)
    await page.locator(`${PANEL} .wb-rp-d[data-date="${iso(d)}"]`).click()
    await page.locator(PANEL).getByRole('group', { name: 'Le jour' }).getByRole('button', { name: 'Après-midi' }).click()
    await expect(page.locator(`${PANEL} .wb-req-sum`)).toContainText('0,5 jour ouvré')
  })
})

test.describe('R8 — Modifier et annuler', () => {
  test('T-R8-010: edit a pending request, then cancel it', async ({ page }) => {
    const d = weekdayAhead(33)
    const d2 = new Date(d)
    d2.setDate(d2.getDate() + 1)
    while (d2.getDay() === 0 || d2.getDay() === 6) d2.setDate(d2.getDate() + 1)
    test.skip(!thisYear(d2), 'end of year')
    await signIn(page, ACCOUNTS.employee1)
    const start = await requestDay(page, d)

    await page.goto('/leave-requests?tab=pending')
    await page.locator(`.wb-lc[data-start="${start}"] .wb-lc-open`).click()
    await page.locator(PANEL).getByRole('button', { name: 'Modifier' }).click()
    await expect(page.locator(PANEL)).toContainText('Modifier la demande')
    await expect(page.locator(`${PANEL} .wb-rp-d[data-date="${start}"]`)).toHaveAttribute('aria-pressed', 'true')
    // new period: d → d2
    await page.locator(`${PANEL} .wb-rp-d[data-date="${start}"]`).click()
    await page.locator(`${PANEL} .wb-rp-d[data-date="${iso(d2)}"]`).click()
    await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()
    await expect(page.getByText('Demande modifiée')).toBeVisible()
    await expect(page.locator(`.wb-lc[data-start="${start}"]`)).toContainText('2 jours ouvrés')

    await page.locator(`.wb-lc[data-start="${start}"] .wb-lc-open`).click()
    await page.locator(PANEL).getByRole('button', { name: 'Annuler la demande' }).click()
    await page.locator('.wb-modal').getByRole('button', { name: 'Annuler la demande' }).click()
    await expect(page.getByText('Demande annulée')).toBeVisible()
    await page.goto('/leave-requests?tab=refused')
    // reruns leave older cards on the same date: look for one in the expected state
    await expect(page.locator(`.wb-lc[data-start="${start}"]`, { hasText: 'Annulé' }).first()).toBeVisible()
  })
})

test.describe('R8 — Motif de refus', () => {
  test('T-R8-020: the manager must give a reason; the employee sees it', async ({ page }) => {
    const d = weekdayAhead(36)
    test.skip(!thisYear(d), 'end of year')
    await signIn(page, ACCOUNTS.employee1)
    const start = await requestDay(page, d, 'E2E motif')

    await signIn(page, ACCOUNTS.manager, '/approvals')
    const card = page.locator('article.wb-ac', { hasText: 'E2E motif' })
    await card.getByRole('button', { name: 'Refuser' }).click()
    const modal = page.locator('.wb-modal')
    await modal.getByRole('button', { name: 'Refuser la demande' }).click()
    await expect(modal).toContainText('Indiquez le motif du refus')
    await modal.locator('textarea').fill('Lancement produit cette semaine')
    await modal.getByRole('button', { name: 'Refuser la demande' }).click()
    await expect(page.getByText('Demande de Emma refusée')).toBeVisible()

    await signIn(page, ACCOUNTS.employee1, '/leave-requests?tab=refused')
    await expect(page.locator(`.wb-lc[data-start="${start}"]`, { hasText: 'Lancement produit cette semaine' }).first()).toBeVisible()
  })
})

test.describe('R8 — Annulation d’un congé approuvé', () => {
  test('T-R8-030: approved → ask to cancel → admin accepts → cancelled', async ({ page }) => {
    const d = weekdayAhead(39)
    test.skip(!thisYear(d), 'end of year')
    await signIn(page, ACCOUNTS.employee1)
    const start = await requestDay(page, d, 'E2E annulation')

    await signIn(page, ACCOUNTS.admin, '/approvals')
    await page.locator('article.wb-ac', { hasText: 'E2E annulation' }).getByRole('button', { name: 'Approuver' }).click()
    await expect(page.getByText('Demande de Emma approuvée')).toBeVisible()

    await signIn(page, ACCOUNTS.employee1, '/leave-requests?tab=upcoming')
    await page.locator(`.wb-lc[data-start="${start}"]`, { hasText: 'Approuvé' }).first().locator('.wb-lc-open').click()
    await page.locator(PANEL).getByRole('button', { name: 'Demander l’annulation' }).click()
    await page.locator('.wb-modal').getByRole('button', { name: 'Demander l’annulation' }).click()
    await expect(page.getByText('Annulation demandée à l’admin')).toBeVisible()

    await signIn(page, ACCOUNTS.admin, '/approvals')
    const card = page.locator('article.wb-ac', { hasText: 'E2E annulation' })
    await expect(card).toContainText('Annulation demandée')
    await card.getByRole('button', { name: 'Accepter l’annulation' }).click()
    await expect(page.getByText('Annulation de Emma acceptée')).toBeVisible()

    await signIn(page, ACCOUNTS.employee1, '/leave-requests?tab=refused')
    await expect(page.locator(`.wb-lc[data-start="${start}"]`, { hasText: 'Annulé' }).first()).toBeVisible()
  })
})

test.describe('R8 — Jours fériés (admin)', () => {
  test('T-R8-040: lists the seeded days, adds and removes a regional day', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/leave-types?tab=holidays')
    await expect(page.locator('tbody tr', { hasText: 'Noël' })).toBeVisible()
    const y = new Date().getFullYear()
    await page.fill('#holiday-day', `${y}-03-19`)
    await page.fill('#holiday-name', 'Jour régional E2E')
    await page.getByRole('button', { name: 'Ajouter' }).click()
    await expect(page.getByText('Jour férié ajouté')).toBeVisible()
    const row = page.locator(`tr[data-day="${y}-03-19"]`)
    await expect(row).toContainText('Jour régional E2E')
    await row.getByRole('button', { name: 'Retirer' }).click()
    await expect(row).toHaveCount(0)
  })

})
