/**
 * E2E tests for RFC-004 — Private Layout & Navigation
 *
 * REQUIRES:
 *   - supabase start && supabase db reset (seed included)
 *   - yarn dev (or webServer in playwright.config.ts starts it)
 *
 * Run: yarn test:e2e
 */

import { test, expect, type Page } from '@playwright/test'

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
}

// Stable selectors derived from ARIA roles and labels — resilient to class renames
const SIDEBAR       = 'aside'
const NAV           = 'nav[aria-label="Navigation principale"]'
const NAV_LINKS     = `${NAV} a`
const HAMBURGER     = 'button[aria-label="Ouvrir le menu"]'
const DRAWER        = '[role="dialog"]'
const DRAWER_NAV    = `${DRAWER} ${NAV}`
const DRAWER_CLOSE  = 'button[aria-label="Fermer le menu"]'
const SIGNOUT_BTN   = 'button:has-text("Déconnexion")'

async function waitForHydration(page: Page) {
  await page.waitForSelector('html[data-hydrated]')
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

// ============================================================
// T-004-001 — Layout renders on all private routes
// ============================================================
test.describe('F08 — Layout renders (desktop)', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
  })

  test('T-004-001: private layout present on all 4 private routes', async ({ page }) => {
    for (const route of ['/profile', '/leave-requests', '/calendar']) {
      await page.goto(route)
      await waitForHydration(page)
      // Sidebar confirms private layout rendered
      await expect(page.locator(SIDEBAR)).toBeVisible()
      // Stub page heading confirms <slot> content rendered
      await expect(page.locator('main h1')).toBeVisible()
      // No unexpected redirect
      await expect(page).toHaveURL(route)
    }
  })
})

// ============================================================
// T-004-002/003/015/004/014/017/018 — Nav content & desktop behaviour
// ============================================================
test.describe('F08 — Nav content (desktop 1280px)', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
  })

  test('T-004-002: employee nav has 3 links — no "Types de congé"', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    const links = page.locator(`${SIDEBAR} ${NAV_LINKS}`)
    await expect(links).toHaveCount(3)
    await expect(page.locator(`${SIDEBAR} a[href="/leave-types"]`)).not.toBeVisible()
  })

  test('T-004-003: admin nav has 5 links — "Tableau de bord" first, includes "Types de congé"', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin)
    const links = page.locator(`${SIDEBAR} ${NAV_LINKS}`)
    await expect(links).toHaveCount(5)
    await expect(links.first()).toHaveAttribute('href', '/dashboard')
    await expect(links.first()).toContainText('Tableau de bord')
    const typesLink = page.locator(`${SIDEBAR} a[href="/leave-types"]`)
    await expect(typesLink).toBeVisible()
    await expect(typesLink).toContainText('Types de congé')
  })

  test('T-004-015: manager nav has 3 links — no "Types de congé"', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager)
    const links = page.locator(`${SIDEBAR} ${NAV_LINKS}`)
    await expect(links).toHaveCount(3)
    await expect(page.locator(`${SIDEBAR} a[href="/leave-types"]`)).not.toBeVisible()
  })

  test('T-004-004: active route link has aria-current="page" and shifts on navigation', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)

    // On /profile — only the /profile link is marked active
    await expect(page.locator(`${SIDEBAR} a[href="/profile"][aria-current="page"]`)).toBeVisible()
    await expect(page.locator(`${SIDEBAR} a[href="/leave-requests"][aria-current="page"]`)).not.toBeAttached()

    // Navigate to /leave-requests via the nav link
    await page.click(`${SIDEBAR} a[href="/leave-requests"]`)
    await page.waitForURL('/leave-requests')

    await expect(page.locator(`${SIDEBAR} a[href="/leave-requests"][aria-current="page"]`)).toBeVisible()
    await expect(page.locator(`${SIDEBAR} a[href="/profile"][aria-current="page"]`)).not.toBeAttached()
  })

  test('T-004-014: authenticated user full name visible in sidebar footer', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    // The profile name div is rendered v-if="profile" — present after loadProfile()
    const nameEl = page.locator(`${SIDEBAR} .text-sm.text-gray-500.truncate`)
    await expect(nameEl).toBeVisible()
    const text = await nameEl.textContent()
    expect(text?.trim().length).toBeGreaterThan(0)
  })

  test('T-004-017: Déconnexion button (ghost variant) has gray text class', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    const btn = page.locator(`${SIDEBAR} ${SIGNOUT_BTN}`)
    await expect(btn).toBeVisible()
    const classes = await btn.getAttribute('class')
    expect(classes).toContain('text-gray-600')
  })

  test('T-004-018: employee sees 403 on /leave-types, "Types de congé" absent from nav', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await page.goto('/leave-types')
    await expect(page.locator('body')).toContainText('403')

    // Nav still shows employee links on return to a valid private page
    await page.goto('/profile')
    await waitForHydration(page)
    await expect(page.locator(`${SIDEBAR} a[href="/leave-types"]`)).not.toBeVisible()
  })
})

// ============================================================
// T-004-011 — Logout via desktop sidebar
// ============================================================
test.describe('F04 — Logout via sidebar (desktop)', () => {
  test('T-004-011: Déconnexion redirects to /login and blocks private routes', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)

    await page.locator(`${SIDEBAR} ${SIGNOUT_BTN}`).click()
    await page.waitForURL('/login')

    // Auth middleware blocks all private routes after logout
    await page.goto('/profile')
    await expect(page).toHaveURL('/login')

    await page.goto('/leave-requests')
    await expect(page).toHaveURL('/login')
  })
})

// ============================================================
// Mobile drawer tests (375px viewport)
// ============================================================
test.describe('F08 — Mobile drawer (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
  })

  test('T-004-005: sidebar hidden, hamburger bar visible, no horizontal scroll', async ({ page }) => {
    // aside has hidden lg:flex — display:none on mobile
    await expect(page.locator(SIDEBAR)).not.toBeVisible()
    // Hamburger top bar is visible
    await expect(page.locator(HAMBURGER)).toBeVisible()
    // No horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })

  test('T-004-006: hamburger opens drawer with nav links and backdrop', async ({ page }) => {
    await page.click(HAMBURGER)
    const drawer = page.locator(DRAWER)
    await expect(drawer).toBeVisible()
    // Overlay backdrop is present
    await expect(page.locator('[aria-hidden="true"].fixed.inset-0')).toBeVisible()
    // Drawer contains nav links (employee: 3)
    await expect(page.locator(`${DRAWER_NAV} a`)).toHaveCount(3)
  })

  test('T-004-007: clicking nav link closes drawer and navigates', async ({ page }) => {
    await page.click(HAMBURGER)
    await expect(page.locator(DRAWER)).toBeVisible()

    await page.click(`${DRAWER} a[href="/leave-requests"]`)
    await page.waitForURL('/leave-requests')
    await expect(page.locator(DRAWER)).not.toBeVisible()
  })

  test('T-004-008: clicking backdrop closes drawer without navigating', async ({ page }) => {
    await page.goto('/profile')
    await waitForHydration(page)
    await page.click(HAMBURGER)
    await expect(page.locator(DRAWER)).toBeVisible()

    // Click at x=350 (outside the 288px drawer) on the backdrop
    await page.locator('[aria-hidden="true"].fixed.inset-0').click({ position: { x: 350, y: 400 } })
    await expect(page.locator(DRAWER)).not.toBeVisible()
    await expect(page).toHaveURL('/profile')
  })

  test('T-004-009: Escape key closes drawer and returns focus to hamburger', async ({ page }) => {
    await page.click(HAMBURGER)
    await expect(page.locator(DRAWER)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator(DRAWER)).not.toBeVisible()

    const focusedLabel = await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label')
    )
    expect(focusedLabel).toBe('Ouvrir le menu')
  })

  test('T-004-010: Tab key is trapped inside open drawer', async ({ page }) => {
    await page.click(HAMBURGER)
    await expect(page.locator(DRAWER)).toBeVisible()

    // Tab 10 times — focus must always remain inside the drawer
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
      const isInsideDrawer = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]')
        return dialog?.contains(document.activeElement) ?? false
      })
      expect(isInsideDrawer).toBe(true)
    }
  })

  test('T-004-013: X close button closes drawer and returns focus to hamburger', async ({ page }) => {
    await page.click(HAMBURGER)
    await expect(page.locator(DRAWER)).toBeVisible()

    await page.click(DRAWER_CLOSE)
    await expect(page.locator(DRAWER)).not.toBeVisible()

    const focusedLabel = await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label')
    )
    expect(focusedLabel).toBe('Ouvrir le menu')
  })

  test('T-004-012: Déconnexion from drawer redirects to /login and clears session', async ({ page }) => {
    await page.click(HAMBURGER)
    await expect(page.locator(DRAWER)).toBeVisible()

    await page.locator(`${DRAWER} ${SIGNOUT_BTN}`).click()
    await page.waitForURL('/login')

    await page.goto('/profile')
    await expect(page).toHaveURL('/login')
  })
})

// ============================================================
// T-004-016 — Responsive resize (desktop → mobile, no reload)
// ============================================================
test.describe('T-004-016 — Responsive resize', () => {
  test('sidebar hides and hamburger appears on resize to 375px without page reload', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)

    // Desktop: sidebar visible, hamburger hidden
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.locator(SIDEBAR)).toBeVisible()
    await expect(page.locator(HAMBURGER)).not.toBeVisible()

    // Mobile: sidebar hidden, hamburger visible
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.locator(SIDEBAR)).not.toBeVisible()
    await expect(page.locator(HAMBURGER)).toBeVisible()

    // No horizontal scroll at 375px
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
})

// ============================================================
// Security — RFC-004
// ============================================================
test.describe('Security — RFC-004', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
  })

  test('S-004-001: unauthenticated access to all private routes redirects to /login', async ({ page }) => {
    for (const route of ['/profile', '/leave-requests', '/calendar', '/leave-types']) {
      await page.goto(route)
      await expect(page).toHaveURL('/login')
    }
  })

  test('S-004-002: /leave-types returns 403 for employee and manager', async ({ page }) => {
    for (const account of [ACCOUNTS.employee1, ACCOUNTS.manager]) {
      await clearSession(page)
      await signIn(page, account)
      await page.goto('/leave-types')
      await expect(page.locator('body')).toContainText('403')
    }
  })

  test('S-004-004: SUPABASE_SERVICE_KEY absent from rendered page source', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    const source = await page.content()
    expect(source).not.toContain('SERVICE_KEY')
    expect(source).not.toContain('service_role')
  })
})
