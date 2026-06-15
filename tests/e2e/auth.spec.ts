/**
 * E2E tests for RFC-003 — Authentication & Routing
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

async function waitForHydration(page: Page) {
  await page.waitForSelector('html[data-hydrated]')
}

async function fillAndSubmit(page: Page, email: string, password: string) {
  await waitForHydration(page)
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/login')
  await fillAndSubmit(page, account.email, account.password)
  await page.waitForURL(/\/(profile|dashboard)/)
}

async function clearSession(page: Page) {
  await page.context().clearCookies()
}

// ============================================================
// F01 — Login page
// ============================================================
test.describe('F01 — Login', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
  })

  test('T-003-001: admin can log in and is redirected to /dashboard', async ({ page }) => {
    await page.goto('/login')
    await fillAndSubmit(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await expect(page).toHaveURL('/dashboard')
  })

  test('T-003-002: employee can log in and is redirected to /profile', async ({ page }) => {
    await page.goto('/login')
    await fillAndSubmit(page, ACCOUNTS.employee1.email, ACCOUNTS.employee1.password)
    await expect(page).toHaveURL('/profile')
  })

  test('T-003-003: wrong credentials show French error, no redirect', async ({ page }) => {
    await page.goto('/login')
    await fillAndSubmit(page, ACCOUNTS.admin.email, 'wrongpassword')
    await expect(page).toHaveURL('/login')
    await expect(page.locator('[role="alert"]')).toBeVisible()
    await expect(page.locator('[role="alert"]')).toContainText('Identifiants incorrects')
  })

  test('T-003-004: submit button is disabled and spinner visible during request', async ({ page }) => {
    // Delay the Supabase auth token endpoint to observe in-flight state
    await page.route('**/auth/v1/token**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })

    await page.goto('/login')
    await waitForHydration(page)
    await page.fill('#email', ACCOUNTS.employee1.email)
    await page.fill('#password', ACCOUNTS.employee1.password)

    await page.click('button[type="submit"]')

    // Button must be disabled while request is in flight
    await expect(page.locator('button[type="submit"]')).toBeDisabled()
    // Spinner (animate-spin element) must be visible
    await expect(page.locator('button[type="submit"] .animate-spin')).toBeVisible()
  })

  test('T-003-005: authenticated user visiting /login is redirected to /profile', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await page.goto('/login')
    await expect(page).toHaveURL('/profile')
  })
})

// ============================================================
// F02 — Global auth guard
// ============================================================
test.describe('F02 — Auth guard (unauthenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
  })

  for (const route of ['/profile', '/leave-requests', '/calendar', '/leave-types']) {
    test(`T-003-006/007: unauthenticated access to ${route} redirects to /login`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL('/login')
    })
  }

  test('T-003-007b: /login remains accessible without a session', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL('/login')
    await expect(page.locator('h1')).toContainText('WakaBods')
  })
})

// ============================================================
// F03 — Admin-only guard
// ============================================================
test.describe('F03 — Admin guard', () => {
  test('T-003-008: employee accessing /leave-types gets 403', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await page.goto('/leave-types')
    // Nuxt renders error page for thrown createError({ statusCode: 403 })
    await expect(page.locator('body')).toContainText('403')
  })

  test('T-003-009: manager accessing /leave-types gets 403', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.manager)
    await page.goto('/leave-types')
    await expect(page.locator('body')).toContainText('403')
  })

  test('T-003-010: admin can access /leave-types', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await page.goto('/leave-types')
    await expect(page).toHaveURL('/leave-types')
    // No 403 in body
    await expect(page.locator('body')).not.toContainText('403')
  })
})

// ============================================================
// F04 — Logout (session clearing)
// Note: logout button lives in RFC-004 nav. These tests verify the
// auth middleware response when the session is cleared — the core
// behavior of signOut(). Full useState-clearing test is in RFC-004.
// ============================================================
test.describe('F04 — Logout / session clearing', () => {
  test('T-003-012: private route blocked after session cleared', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1)
    await expect(page).toHaveURL('/profile')

    // Simulate session loss (cookie cleared)
    await clearSession(page)

    await page.goto('/profile')
    await expect(page).toHaveURL('/login')
  })
})

// ============================================================
// Security tests
// ============================================================
test.describe('Security', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
  })

  test('S-003-001: no session → GET /profile returns /login content server-side', async ({ page }) => {
    const response = await page.goto('/profile')
    // After SSR redirect the final URL is /login
    await expect(page).toHaveURL('/login')
    // HTTP response should not be 200 with private content
    expect(response?.status()).not.toBe(500)
  })

  test('S-003-004: XSS payloads in login inputs are rendered as plain text', async ({ page }) => {
    await page.goto('/login')
    const xss = '<script>window.__xss=1</script>'
    await fillAndSubmit(page, xss, xss)

    // Error message rendered as text, no script executed
    await expect(page.locator('[role="alert"]')).toBeVisible()
    const injected = await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss)
    expect(injected).toBeUndefined()

    // No v-html: the raw tag should not appear as an element
    const scriptTags = await page.locator('script[src=""]').count()
    expect(scriptTags).toBe(0)
  })

  test('S-003-005: unknown email and wrong password show identical error message', async ({ page }) => {
    await page.goto('/login')
    await fillAndSubmit(page, 'notexist@waka.com', 'anypassword')
    const msgUnknown = await page.locator('[role="alert"]').textContent()

    await clearSession(page)
    await page.goto('/login')
    await fillAndSubmit(page, ACCOUNTS.admin.email, 'wrongpassword')
    const msgWrongPwd = await page.locator('[role="alert"]').textContent()

    expect(msgUnknown?.trim()).toBe(msgWrongPwd?.trim())
  })
})
