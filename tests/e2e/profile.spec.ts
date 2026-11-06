/**
 * E2E tests — Mon profil (refonte, lot R3): identity, balances, preferences, security.
 *
 * REQUIRES: supabase start && supabase db reset (seed included), app running.
 */

import { test, expect, type Page } from '@playwright/test'

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
  employee2: { email: 'employee2@waka.com', password: 'Waka2026!' },
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
  await page.waitForURL(/\/(dashboard|profile)?$/)
}

async function goToProfile(page: Page) {
  await page.goto('/profile')
  await waitForHydration(page)
}

const balanceRow = (page: Page, type: string) => page.locator('.wb-dt tbody tr', { hasText: type })

test.describe('R3 — Identité', () => {
  test('T-R3-060: employee sees name, role, team and e-mail', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await goToProfile(page)
    await expect(page.locator('header.wb-head h1')).toHaveText('Profil')
    await expect(page.getByText('Emma Employée').first()).toBeVisible()
    await expect(page.getByText('Employé · Équipe A · France')).toBeVisible()
    await expect(page.getByText('employee1@waka.com')).toBeVisible()
  })

  test('T-R3-061: admin is shown as Administrateur, whole company', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await goToProfile(page)
    await expect(page.getByText('Administrateur · Toute l’entreprise · France')).toBeVisible()
  })
})

test.describe('R3 — Mes soldes', () => {
  test('T-R3-062: employee sees Congé payé with 25 days allocated', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await goToProfile(page)
    const row = balanceRow(page, 'Congé payé')
    await expect(row).toBeVisible()
    await expect(row.locator('td').nth(1)).toHaveText('25')
  })

  test('T-R3-063: a type at zero is shown in the danger colour', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await goToProfile(page)
    await expect(balanceRow(page, 'RTT').locator('td').nth(4)).toHaveClass(/wb-c-danger/)
  })

  test('T-R3-064: admin has no balance table and fires no personal balance request', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    // The sidebar count loads team balances; the profile must not ask for the admin's own
    let fired = false
    page.on('request', (r) => { if (r.url().includes('/rest/v1/leave_balances') && r.url().includes('user_id=eq.')) fired = true })
    await goToProfile(page)
    await page.waitForTimeout(800)
    await expect(page.locator('.wb-dt')).toHaveCount(0)
    expect(fired).toBe(false)
  })

  test('T-R3-065: a failed balance fetch shows the retry button', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await page.route('**/rest/v1/leave_balances*', route => route.fulfill({ status: 500, body: '{"message":"boom"}' }))
    await goToProfile(page)
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible()
  })
})

test.describe('R3 — Préférences et sécurité', () => {
  test('T-R3-066: switching the language to English translates the page', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await goToProfile(page)
    await page.getByLabel('Langue').selectOption('en')
    // the English messages are loaded on demand (compiled on first use by the dev server)
    await expect(page.locator('header.wb-head h1')).toHaveText('Profile', { timeout: 15_000 })
    await expect(page.getByText('Preferences')).toBeVisible()
    await page.getByLabel('Language').selectOption('fr')
    await expect(page.locator('header.wb-head h1')).toHaveText('Profil')
  })

  test('T-R3-067: a wrong current password is refused', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee2)
    await goToProfile(page)
    await page.fill('#current-password', 'pas-le-bon')
    await page.fill('#new-password', 'UnNouveauMotDePasse2026')
    await page.getByRole('button', { name: 'Changer le mot de passe' }).click()
    await expect(page.getByText('Mot de passe actuel incorrect.')).toBeVisible()
  })

  test('T-R3-068: a weak new password is refused before any request', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee2)
    await goToProfile(page)
    await page.fill('#current-password', 'Waka2026!')
    await page.fill('#new-password', 'court')
    await page.getByRole('button', { name: 'Changer le mot de passe' }).click()
    await expect(page.getByText('12 caractères minimum, dont au moins un chiffre')).toBeVisible()
  })
})

test.describe('R3 — Profil, mobile et sécurité', () => {
  test('R-R3-010: no horizontal scroll at 375 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await signIn(page, ACCOUNTS.employee1)
    await goToProfile(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })

  test('S-R3-020: unauthenticated access to /profile redirects to /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/profile')
    await expect(page).toHaveURL('/login')
  })

  test('S-R3-021: service key absent from the page source', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await goToProfile(page)
    const html = await page.content()
    expect(html).not.toContain('SERVICE_KEY')
    expect(html).not.toContain('service_role')
  })
})
