/**
 * E2E tests — À valider (refonte, lot R4): manager and admin approvals.
 *
 * REQUIRES: supabase start && supabase db reset (seed included), app running.
 * Seed: Emma pending (level 1, Congé payé), Eddy manager_approved (level 2, RTT),
 * Emma approved, Eddy rejected. This file only holds the decisions, which change the seed: its name makes it run last.
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

// Mutating tests: keep last (they change the seed)
test.describe('R4 — Decisions', () => {
  test('T-R4-020: manager approves Emma → toast, card gone, admin then sees it at level 2', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    // The seeded pending request (other specs may have added more for Emma)
    const seeded = `${CARD}[data-id="00000000-0000-0000-0000-000000000041"]`
    const before = await page.locator(CARD).count()
    await page.locator(seeded).getByRole('button', { name: 'Approuver' }).click()
    await expect(page.getByText('Demande de Emma approuvée')).toBeVisible()
    await expect(page.locator(seeded)).toHaveCount(0)
    await expect(page.locator(CARD)).toHaveCount(before - 1)

    await signIn(page, ACCOUNTS.admin)
    await expect(page.locator(seeded)).toContainText('Niveau 2')
  })

  test('T-R4-021: admin refuses Eddy → status Refusé in Traitées', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await page.locator(CARD, { hasText: 'Eddy' }).getByRole('button', { name: 'Refuser' }).click()
    await page.locator('.wb-modal').getByRole('button', { name: 'Refuser la demande' }).click()
    await expect(page.getByText('Demande de Eddy refusée')).toBeVisible()
    await expect(page.locator(CARD, { hasText: 'Eddy' })).toHaveCount(0)
  })

  test('T-R4-022: admin approves the selection', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await page.getByText('Tout sélectionner').click()
    await page.getByRole('button', { name: 'Approuver la sélection' }).click()
    await expect(page.getByText(/demandes? approuvées?/)).toBeVisible()
    await expect(page.locator(CARD)).toHaveCount(0)
  })
})
