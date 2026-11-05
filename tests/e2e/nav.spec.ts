/**
 * E2E tests — App shell and navigation (refonte, lot R2)
 *
 * Sidebar per role, header title, account menu, collapsed sidebar,
 * mobile tab bar (employee, manager) and drawer (admin).
 *
 * REQUIRES: supabase start && supabase db reset (seed included), app running.
 */

import { test, expect, type Page } from '@playwright/test'

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
}

const SIDEBAR   = '.wb-side-col > nav.wb-side'
// Link labels only: the approval count badge is a sibling span
const SIDE_LINKS = `${SIDEBAR} .wb-side-g a > span:not(.wb-nav-n)`
const HEADER    = 'header.wb-head'
const TABBAR    = 'nav.wb-tabbar'
const DRAWER    = '[role="dialog"].wb-drawer'
const MENU_BTN  = 'button.wb-only-m-admin'
const USER_BTN  = 'button[aria-haspopup="menu"]'

async function waitForHydration(page: Page) {
  await page.waitForSelector('html[data-hydrated]')
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/login')
  await waitForHydration(page)
  await page.fill('#email', account.email)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|profile)?$/)
  await waitForHydration(page)
}

async function clearSession(page: Page) {
  await page.context().clearCookies()
}

// ============================================================
// Desktop — sidebar per role
// ============================================================
test.describe('R2 — Sidebar (desktop)', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
  })

  test('T-R2-001: employee menu is Accueil, Mes congés, Calendrier', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await expect(page.locator(SIDE_LINKS)).toHaveText(['Accueil', 'Mes congés', 'Calendrier'])
    await expect(page.locator(`${SIDEBAR} h2`)).toHaveText(['Moi', 'Équipe'])
  })

  test('T-R2-002: manager menu has no admin entries', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    // TND-26: « Mon équipe »; no Vélocité while the team is not linked to Linear
    await expect(page.locator(SIDE_LINKS)).toHaveText(['Accueil', 'À valider', 'Mes congés', 'Mon équipe', 'Calendrier'])
    await expect(page.locator(`${SIDEBAR} a[href="/leave-types"]`)).toHaveCount(0)
  })

  test('T-TND26-001: manager « Mon équipe » shows the team board and its members, read-only', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await page.locator(SIDEBAR).getByRole('link', { name: 'Mon équipe' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.locator('h1.wb-head-title')).toHaveText('Mon équipe')
    await expect(page.getByRole('link', { name: /Nouvelle facture/ })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Membres' }).click()
    await expect(page.locator('.wb-tm tbody tr')).toHaveCount(3) // Équipe A: Emma, Eddy, Marc
    await expect(page.locator('.wb-tm')).toContainText('Lecture seule')
  })

  test('T-TND26-002: manager without a Linear link gets the empty Vélocité state', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    await page.goto('/velocite')
    await expect(page.getByText('Votre équipe n’est pas encore reliée à Linear')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Connecter un workspace' })).toHaveCount(0)
  })

  test('T-TND26-003: an employee cannot open Vélocité nor the team board', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    for (const path of ['/velocite', '/dashboard']) {
      await page.goto(path)
      await expect(page.locator('body')).toContainText('403')
    }
  })

  test('T-R2-003: admin menu groups Équipe, Pilotage, Administration', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await expect(page.locator(`${SIDEBAR} h2`)).toHaveText(['Équipe', 'Pilotage', 'Administration'])
    await expect(page.locator(SIDE_LINKS)).toHaveText(['Tableau de bord', 'Calendrier', 'À valider', 'Vélocité', 'Personnes et équipes', 'Congés et règles', 'Factures', 'Paramètres'])
  })

  test('T-R2-004: active link has aria-current and the header shows the page title', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await page.locator(`${SIDEBAR} a[href="/calendar"]`).click()
    await expect(page).toHaveURL('/calendar')
    await expect(page.locator(`${SIDEBAR} a[href="/calendar"]`)).toHaveAttribute('aria-current', 'page')
    await expect(page.locator(`${SIDEBAR} a[href="/leave-requests"]`)).not.toHaveAttribute('aria-current', 'page')
    await expect(page.locator(`${HEADER} h1`)).toHaveText('Calendrier')
    await expect(page).toHaveTitle('Calendrier · WakaBods')
  })

  test('T-R2-005: "Poser un congé" is in the header for employees, not for admins', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await expect(page.locator(HEADER).getByRole('button', { name: 'Poser un congé' })).toBeVisible()
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await expect(page.locator(HEADER).getByRole('button', { name: 'Poser un congé' })).toHaveCount(0)
  })

  test('T-R2-006: the collapsed sidebar is remembered after a reload', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await page.getByRole('button', { name: 'Replier le menu' }).click()
    await expect(page.locator(SIDEBAR)).toHaveClass(/is-col/)
    await page.reload()
    await waitForHydration(page)
    await expect(page.locator(SIDEBAR)).toHaveClass(/is-col/)
    await page.getByRole('button', { name: 'Déplier le menu' }).click()
    await expect(page.locator(SIDEBAR)).not.toHaveClass(/is-col/)
  })

  test('T-R2-007: account menu opens, closes with Escape, and signs out', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    const userBtn = page.locator(USER_BTN)
    await expect(userBtn).toHaveAttribute('aria-label', /Emma/)
    await userBtn.click()
    await expect(page.getByRole('menuitem', { name: 'Mon profil' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(userBtn).toBeFocused()

    await userBtn.click()
    await page.getByRole('menuitem', { name: 'Déconnexion' }).click()
    await expect(page).toHaveURL('/login')
    await page.goto('/profile')
    await expect(page).toHaveURL('/login')
  })

  test('T-R2-008: employee sees 403 on /leave-types', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await page.goto('/leave-types')
    await expect(page.locator('body')).toContainText('403')
  })
})

// ============================================================
// Mobile — tab bar (employee) and drawer (admin)
// ============================================================
test.describe('R2 — Mobile (390 px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await clearSession(page)
  })

  test('T-R2-010: employee gets the tab bar, no sidebar, no horizontal scroll', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await expect(page.locator(SIDEBAR)).toBeHidden()
    const tabs = page.locator(`${TABBAR} a`)
    await expect(tabs).toHaveCount(4)
    await expect(page.locator(`${TABBAR} button[aria-label="Poser un congé"]`)).toBeVisible()
    await expect(page.locator(`${TABBAR} a[href="/"]`)).toHaveAttribute("aria-current", "page")
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollW).toBeLessThanOrEqual(390)
  })

  test('T-R2-011: admin has no tab bar; the menu button opens the drawer', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await expect(page.locator(TABBAR)).toHaveCount(0)
    await page.locator(MENU_BTN).click()
    const drawer = page.locator(DRAWER)
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.wb-side-g a')).toHaveCount(8)
    await expect(drawer.locator('.wb-side-g a').first()).toBeFocused()
  })

  test('T-R2-012: Escape closes the drawer and returns focus to the menu button', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await page.locator(MENU_BTN).click()
    await expect(page.locator(DRAWER)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator(DRAWER)).toHaveCount(0)
    await expect(page.locator(MENU_BTN)).toBeFocused()
  })

  test('T-R2-013: clicking a link closes the drawer and navigates', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await page.locator(MENU_BTN).click()
    await page.locator(`${DRAWER} a[href="/invoices"]`).click()
    await expect(page).toHaveURL('/invoices')
    await expect(page.locator(DRAWER)).toHaveCount(0)
  })

  test('T-R2-014: the scrim and the close button close the drawer', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await page.locator(MENU_BTN).click()
    await page.locator(`${DRAWER} .wb-scrim`).click({ position: { x: 360, y: 600 } })
    await expect(page.locator(DRAWER)).toHaveCount(0)
    await page.locator(MENU_BTN).click()
    await page.getByRole('button', { name: 'Fermer le menu' }).click()
    await expect(page.locator(DRAWER)).toHaveCount(0)
  })

  test('T-R2-015: Tab stays trapped inside the open drawer', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    await page.locator(MENU_BTN).click()
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
    const inside = await page.evaluate(() => !!document.activeElement?.closest('.wb-drawer'))
    expect(inside).toBe(true)
  })
})

// ============================================================
// Security
// ============================================================
test.describe('Security — navigation', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
  })

  test('S-R2-001: unauthenticated access to private routes redirects to /login', async ({ page }) => {
    for (const route of ['/profile', '/leave-requests', '/calendar', '/leave-types']) {
      await page.goto(route)
      await expect(page).toHaveURL('/login')
    }
  })

  test('S-R2-002: service key absent from rendered page source', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    const source = await page.content()
    expect(source).not.toContain('SERVICE_KEY')
    expect(source).not.toContain('service_role')
  })
})
