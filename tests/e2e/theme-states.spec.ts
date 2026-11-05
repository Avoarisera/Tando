/**
 * E2E tests — Transverse (refonte, lot R7): dark theme, error page, toasts.
 * REQUIRES: supabase start && supabase db reset (seed included), app running.
 */

import { test, expect, type Page } from '@playwright/test'

const EMPLOYEE = { email: 'employee2@waka.com', password: 'Waka2026!' }

async function signIn(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.waitForSelector('html[data-hydrated]')
  await page.fill('#email', EMPLOYEE.email)
  await page.fill('#password', EMPLOYEE.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|profile)?$/)
}

test.describe('R7 — Thème', () => {
  test('T-R7-001: "Sombre" applies the dark tokens, survives a reload and reaches the error page', async ({ page }) => {
    await signIn(page)
    await page.goto('/profile')
    await page.waitForSelector('html[data-hydrated]')
    await page.getByRole('button', { name: 'Sombre', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.goto('/page-qui-n-existe-pas')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.goto('/profile')
    await page.waitForSelector('html[data-hydrated]')
    await page.getByRole('button', { name: 'Clair', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('T-R7-002: "Système" follows the OS colour scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await signIn(page)
    await page.goto('/profile')
    await page.waitForSelector('html[data-hydrated]')
    await page.getByRole('button', { name: 'Système', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})

test.describe('R7 — Page d’erreur', () => {
  test('T-R7-010: an unknown page shows the 404 card with a way home', async ({ page }) => {
    await signIn(page)
    await page.goto('/page-qui-n-existe-pas')
    await expect(page.locator('h1')).toHaveText('Page introuvable')
    await page.getByRole('button', { name: 'Retour à l’accueil' }).click()
    await expect(page).toHaveURL('/')
  })
})

test.describe('R7 — Mobile', () => {
  test('T-R7-020: an inline error on mobile does not make the page scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page)
    await page.goto('/profile')
    await page.waitForSelector('html[data-hydrated]')
    await page.fill('#current-password', 'pas-le-bon')
    await page.fill('#new-password', 'UnNouveauMotDePasse2026')
    await page.getByRole('button', { name: 'Changer le mot de passe' }).click()
    await expect(page.getByText('Mot de passe actuel incorrect.')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})

test.describe('R7 — Hors ligne', () => {
  // The browser events are simulated: cutting the network with context.setOffline()
  // also breaks the Vite dev server connection, which reloads the page.
  const setOnline = (page: Page, online: boolean) => page.evaluate((on) => {
    Object.defineProperty(navigator, 'onLine', { get: () => on, configurable: true })
    window.dispatchEvent(new Event(on ? 'online' : 'offline'))
  }, online)

  test('T-R7-030: the offline banner shows when the connection drops', async ({ page }) => {
    await signIn(page)
    await page.waitForSelector('html[data-hydrated]')
    await setOnline(page, false)
    await expect(page.getByText('Vous êtes hors ligne.')).toBeVisible()
    await setOnline(page, true)
    await expect(page.getByText('Vous êtes hors ligne.')).toHaveCount(0)
  })
})
