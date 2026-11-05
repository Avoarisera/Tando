/**
 * E2E tests — À valider (refonte, lot R4): manager and admin approvals.
 *
 * REQUIRES: supabase start && supabase db reset (seed included), app running.
 * Seed: Emma pending (level 1, Congé payé), Eddy manager_approved (level 2, RTT),
 * Emma approved, Eddy rejected. Mutating tests come last in the file.
 */

import { test, expect, type Page } from '@playwright/test'

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
}

const CARD = 'article.wb-ac'
const SIDE_COUNT = '.wb-side-col > nav.wb-side a[href="/approvals"] .wb-nav-n'

async function waitForHydration(page: Page) {
  await page.waitForSelector('html[data-hydrated]')
}

async function signIn(page: Page, account: { email: string; password: string }, path = '/approvals') {
  await page.context().clearCookies()
  await page.goto('/login')
  await waitForHydration(page)
  await page.fill('#email', account.email)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|profile)?$/)
  await page.goto(path)
  await waitForHydration(page)
}

test.describe('R4 — Admin', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
  })

  test('T-R4-001: shows the 2 open requests with their level, and the sidebar count', async ({ page }) => {
    await expect(page.locator(CARD)).toHaveCount(2)
    await expect(page.locator(CARD, { hasText: 'Eddy' })).toContainText('Niveau 2')
    await expect(page.locator(CARD, { hasText: 'Emma' })).toContainText('Niveau 1')
    await expect(page.locator(SIDE_COUNT)).toHaveText('2')
  })

  test('T-R4-002: a level-1 request warns that the manager is skipped', async ({ page }) => {
    await expect(page.locator(CARD, { hasText: 'Emma' })).toContainText('Vous allez approuver sans l’avis du manager')
    await expect(page.locator(CARD, { hasText: 'Eddy' })).not.toContainText('sans l’avis du manager')
  })

  test('T-R4-003: impact shows overlaps, presence and the balance after (negative in danger)', async ({ page }) => {
    const eddy = page.locator(CARD, { hasText: 'Eddy' })
    await expect(eddy).toContainText('Impact sur l’équipe')
    await expect(eddy).toContainText(/Présents le .+ : \d+ \/ \d+/)
    await expect(eddy.locator('li.wb-c-danger', { hasText: 'Solde après' })).toBeVisible()
  })

  test('T-R4-004: level and search filters narrow the list; reset restores it', async ({ page }) => {
    await page.getByRole('button', { name: /Niveau 2/ }).click()
    await expect(page.locator(CARD)).toHaveCount(1)
    await expect(page.locator(CARD)).toContainText('Eddy')
    await page.getByRole('button', { name: 'Réinitialiser' }).click()
    await expect(page.locator(CARD)).toHaveCount(2)
    await page.getByPlaceholder('Rechercher une personne').fill('emma')
    await expect(page.locator(CARD)).toHaveCount(1)
    await page.getByPlaceholder('Rechercher une personne').fill('zzz')
    await expect(page.getByText('Aucune demande ne correspond à ces filtres.')).toBeVisible()
  })

  test('T-R4-005: "Traitées" lists decided requests with their status', async ({ page }) => {
    await page.getByRole('tab', { name: /Traitées/ }).click()
    await expect(page.locator('.wb-list li', { hasText: 'Approuvé' }).first()).toBeVisible()
    await expect(page.locator('.wb-list li', { hasText: 'Refusé' }).first()).toBeVisible()
  })

  test('T-R4-006: refusing asks for confirmation; Annuler sends nothing', async ({ page }) => {
    let mutated = false
    page.on('request', (r) => { if (r.url().includes('review_leave_request')) mutated = true })
    await page.locator(CARD, { hasText: 'Eddy' }).getByRole('button', { name: 'Refuser' }).click()
    const modal = page.locator('.wb-modal[role="dialog"]')
    await expect(modal).toContainText('Refuser la demande de Eddy Employé ?')
    await expect(modal.getByRole('button', { name: 'Refuser la demande' })).toHaveClass(/wb-btn-danger/)
    await modal.getByRole('button', { name: 'Annuler' }).click()
    await expect(modal).toHaveCount(0)
    expect(mutated).toBe(false)
  })

  test('T-R4-007: select all toggles the bulk action', async ({ page }) => {
    const bulk = page.getByRole('button', { name: 'Approuver la sélection' })
    await expect(bulk).toBeDisabled()
    await page.getByText('Tout sélectionner').click()
    await expect(page.getByText('2 demandes sélectionnées')).toBeVisible()
    await expect(bulk).toBeEnabled()
  })

  test('T-R4-008: error state offers a retry', async ({ page }) => {
    await page.route('**/rest/v1/leave_requests*', route => route.fulfill({ status: 500, body: '{"message":"boom"}' }))
    await page.reload()
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible()
  })
})

test.describe('R4 — Manager', () => {
  test('T-R4-010: manager only sees pending requests of the team, with the team planning', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await expect(page.locator(CARD)).toHaveCount(1)
    await expect(page.locator(CARD)).toContainText('Emma')
    await expect(page.locator(`${CARD} .wb-plan`)).toBeVisible()
    await expect(page.getByPlaceholder('Rechercher une personne')).toHaveCount(0)
  })

  test('T-R4-011: manager home shows the queue with "Voir tout"', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager, '/')
    await expect(page.getByRole('heading', { name: 'À valider (1)' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Voir tout' })).toHaveAttribute('href', '/approvals')
    await expect(page.getByText('Vos demandes partent directement à l’admin.')).toBeVisible()
  })
})

test.describe('R4 — Access', () => {
  test('S-R4-001: unauthenticated access redirects to /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/approvals')
    await expect(page).toHaveURL('/login')
  })

  test('S-R4-002: an employee is sent back to Mes congés', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await expect(page).toHaveURL('/leave-requests')
  })
})
