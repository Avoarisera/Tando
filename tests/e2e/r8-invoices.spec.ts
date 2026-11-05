/**
 * E2E tests — lot R8: invoice editor with generated PDF (G) and the
 * Vélocité capacity API access rules (H).
 * REQUIRES: local Supabase stack with the R8 migrations, app running.
 */

import { test, expect, type Page } from '@playwright/test'

const ADMIN = { email: 'admin@waka.com', password: 'Waka2026!' }
const EMPLOYEE = { email: 'employee1@waka.com', password: 'Waka2026!' }
const PANEL = '.wb-panel[role="dialog"]'

async function signIn(page: Page, account: { email: string, password: string }, path: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.waitForSelector('html[data-hydrated]')
  await page.fill('#email', account.email)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|profile)?$/)
  await page.goto(path)
  await page.waitForSelector('html[data-hydrated]')
}

async function accessToken(page: Page): Promise<string> {
  // supabase-js keeps the session in a cookie (sb-…-auth-token, possibly chunked and base64-)
  const cookies = await page.context().cookies()
  const parts = cookies.filter(c => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name))
  let raw = parts.map(c => decodeURIComponent(c.value)).join('')
  if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64').toString('utf8')
  return (JSON.parse(raw) as { access_token: string }).access_token
}

test.describe('R8-G — Éditeur de facture', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN, '/invoices?new=1')
    await expect(page.locator(PANEL)).toBeVisible()
  })

  test('T-R8G-001: two lines → totals, then save generates the PDF', async ({ page }) => {
    const client = `Client E2E ${Date.now() % 100000}`
    await page.fill('#inv-client', client)
    const first = page.locator('[data-line="0"]')
    await first.locator('input').nth(0).fill('Développement')
    await first.locator('input').nth(1).fill('3')
    await first.locator('input').nth(2).fill('500')
    await page.locator('[data-action="add-line"]').click()
    const second = page.locator('[data-line="1"]')
    await second.locator('input').nth(0).fill('Hébergement')
    await second.locator('input').nth(2).fill('100')
    await second.locator('select').selectOption('5.5')
    // 1 500 + 300 VAT + 100 + 5,50 VAT
    await expect(page.locator('[data-gross]')).toHaveText(/1\s?905,50\s?€/)

    await page.locator('[data-action="preview"]').click()
    await expect(page.locator('.wb-inv')).toContainText(client)
    await expect(page.locator('.wb-inv [data-total]')).toHaveText(/1\s?905,50\s?€/)

    await page.locator('[data-action="save-pdf"]').click()
    await expect(page.locator(PANEL)).toHaveCount(0, { timeout: 15_000 })
    const row = page.locator('tr', { hasText: client })
    await expect(row).toContainText(/1\s?905,50\s?€/)
    await expect(row.getByRole('button', { name: 'Voir le PDF' })).toBeVisible()
    // automatic numbering: PREFIX-YEAR-NNN
    await expect(row.locator('.wb-mono')).toHaveText(/^[A-Z0-9]+-\d{4}-\d{3,}$/)
  })

  test('T-R8G-002: an incomplete line blocks the save without any request', async ({ page }) => {
    let posted = false
    page.on('request', (r) => { if (r.url().includes('/rest/v1/invoices') && r.method() === 'POST') posted = true })
    await page.fill('#inv-client', 'ACME')
    await page.locator('[data-action="save-pdf"]').click()
    await expect(page.locator(`${PANEL} .wb-banner.wb-t-danger`)).toBeVisible()
    expect(posted).toBe(false)
  })

  test('T-R8G-003: a line can be removed, the last one cannot', async ({ page }) => {
    await page.locator('[data-action="add-line"]').click()
    await expect(page.locator('[data-line]')).toHaveCount(2)
    await page.locator('[data-line="1"] [data-action="remove-line"]').click()
    await expect(page.locator('[data-line]')).toHaveCount(1)
    await expect(page.locator('[data-line="0"] [data-action="remove-line"]')).toBeDisabled()
  })
})

test.describe('R8-H — Capacité (API)', () => {
  const query = 'workspaceId=00000000-0000-0000-0000-000000000000&teamId=x&from=2026-12-01&to=2026-12-14'

  test('S-R8H-001: no token → 401', async ({ request }) => {
    const res = await request.get(`/api/capacity?${query}`)
    expect(res.status()).toBe(401)
  })

  test('S-R8H-002: an employee gets 403', async ({ page }) => {
    await signIn(page, EMPLOYEE, '/')
    const res = await page.request.get(`/api/capacity?${query}`, { headers: { Authorization: `Bearer ${await accessToken(page)}` } })
    expect(res.status()).toBe(403)
  })

  test('S-R8H-003: an admin is checked for ownership and period length', async ({ page }) => {
    await signIn(page, ADMIN, '/dashboard')
    const headers = { Authorization: `Bearer ${await accessToken(page)}` }
    const unknown = await page.request.get(`/api/capacity?${query}`, { headers })
    expect(unknown.status()).toBe(404)
    const tooLong = await page.request.get('/api/capacity?workspaceId=x&teamId=x&from=2026-01-01&to=2026-12-31', { headers })
    expect(tooLong.status()).toBe(400)
  })
})
