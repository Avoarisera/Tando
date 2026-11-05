/**
 * E2E tests — Lot R8 (D, E, F): notifications, invitations and people, settings.
 *
 * REQUIRES: local Supabase stack with the R8 migrations, Mailpit, app running.
 * Selectors use ids and data-action where the copy comes from the r8a strings.
 * Records are unique (timestamps), so the file can be rerun without a reset.
 */

import { test, expect, type Page } from '@playwright/test'

const ADMIN = { email: 'admin@waka.com', password: 'Waka2026!' }
const MANAGER = { email: 'manager@waka.com', password: 'Waka2026!' }
const EMPLOYEE = { email: 'employee2@waka.com', password: 'Waka2026!' }
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54424'
const PANEL = '.wb-panel[role="dialog"]'

async function signIn(page: Page, account: { email: string, password: string }, path?: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.waitForSelector('html[data-hydrated]')
  await page.fill('#email', account.email)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard)?$/)
  if (path) {
    await page.goto(path)
    await page.waitForSelector('html[data-hydrated]')
  }
}

/** Link of the latest Mailpit message sent to `to` */
async function mailLink(page: Page, to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)
    const list = await res.json() as { messages?: { ID: string }[] }
    const id = list.messages?.[0]?.ID
    if (id) {
      const msg = await (await page.request.get(`${MAILPIT}/api/v1/message/${id}`)).json() as { HTML: string, Text: string }
      const m = /href="([^"]+\/auth\/v1\/verify[^"]+)"/.exec(msg.HTML) ?? /(http\S+\/auth\/v1\/verify\S+)/.exec(msg.Text)
      if (m?.[1]) return m[1].replaceAll('&amp;', '&')
    }
    await page.waitForTimeout(500)
  }
  throw new Error(`no e-mail for ${to}`)
}

test.describe('R8-E — Inviter et modifier une personne', () => {
  test('T-R8-E1: invite → e-mail → /accept-invite → password → lands on the home page', async ({ page, browser }) => {
    const stamp = Date.now()
    const email = `invite.${stamp}@waka.test`
    const last = `Invitée${stamp % 100000}`
    await signIn(page, ADMIN, '/people')
    await page.locator('[data-action="invite-person"]').click()
    await page.fill('#person-email', email)
    await page.fill('#person-first', 'Nina')
    await page.fill('#person-last', last)
    await page.locator('#person-country').selectOption('BE')
    await page.locator(`${PANEL} button[type="submit"]`).click()
    await expect(page.locator(PANEL)).toHaveCount(0)
    await expect(page.locator(`tr[data-person="Nina ${last}"]`)).toBeVisible()

    const link = await mailLink(page, email)
    const ctx = await browser.newContext({ locale: 'fr-FR' })
    const guest = await ctx.newPage()
    // Locally /accept-invite is not in the stack's Redirect URLs: GoTrue falls
    // back to the Site URL. Rewrite the redirect to the app under test.
    await guest.route('**/auth/v1/verify**', async (route) => {
      const res = await guest.request.fetch(route.request(), { maxRedirects: 0 })
      const location = res.headers().location ?? ''
      const hash = location.includes('#') ? location.slice(location.indexOf('#')) : ''
      await route.fulfill({ status: 302, headers: { location: `http://localhost:3100/accept-invite${hash}` } })
    })
    await guest.goto(link)
    await guest.waitForURL(/\/accept-invite/)
    await guest.waitForSelector('html[data-hydrated]')
    // session opened from the link: the form is usable
    await expect(guest.locator('button[type="submit"]')).toBeEnabled()
    await guest.fill('#password', 'BienvenueNina2026!')
    await guest.fill('#password-confirm', 'BienvenueNina2026!')
    await guest.locator('button[type="submit"]').click()
    await guest.waitForURL('http://localhost:3100/', { timeout: 15_000 })
    await ctx.close()
  })

  test('T-R8-E2: an already used address is refused (409)', async ({ page }) => {
    await signIn(page, ADMIN, '/people')
    await page.locator('[data-action="invite-person"]').click()
    await page.fill('#person-email', 'employee1@waka.com')
    await page.fill('#person-first', 'Emma')
    await page.fill('#person-last', 'Doublon')
    await page.locator(`${PANEL} button[type="submit"]`).click()
    await expect(page.locator(`${PANEL} .wb-banner.wb-t-danger`)).toBeVisible()
  })

  test('T-R8-E3: edit a person (country) and the change is listed', async ({ page }) => {
    await signIn(page, ADMIN, '/people')
    const row = page.locator('tr[data-person="Eddy Employé"]')
    await row.locator('[data-action="edit-person"]').click()
    await page.locator('#person-country').selectOption('LU')
    await page.locator(`${PANEL} button[type="submit"]`).click()
    await expect(page.locator(PANEL)).toHaveCount(0)
    await expect(row).toContainText(/Luxembourg/)
    // restore
    await row.locator('[data-action="edit-person"]').click()
    await page.locator('#person-country').selectOption('FR')
    await page.locator(`${PANEL} button[type="submit"]`).click()
    await expect(row).toContainText(/France/)
  })

  test('S-R8-E1: the invite route refuses non-admins and anonymous calls', async ({ page }) => {
    const anon = await page.request.post('/api/people/invite', { data: { email: 'x@y.z' } })
    expect(anon.status()).toBe(401)
    await signIn(page, EMPLOYEE)
    const token = await page.evaluate(() => {
      const raw = Object.entries(localStorage).find(([k]) => k.includes('auth-token'))?.[1]
      return raw ? (JSON.parse(raw) as { access_token?: string }).access_token ?? '' : ''
    })
    const cookieToken = token || await page.evaluate(() => {
      const c = document.cookie.split('; ').filter(x => x.includes('auth-token'))
      try {
        const joined = c.map(x => decodeURIComponent(x.split('=').slice(1).join('='))).join('')
        const json = joined.startsWith('base64-') ? atob(joined.slice(7)) : joined
        return (JSON.parse(json) as { access_token?: string }).access_token ?? ''
      }
      catch { return '' }
    })
    const res = await page.request.post('/api/people/invite', {
      headers: { Authorization: `Bearer ${cookieToken}` },
      data: { email: `nope.${Date.now()}@waka.test`, first_name: 'A', last_name: 'B', role: 'admin', country: 'FR' },
    })
    expect([401, 403]).toContain(res.status())
  })
})

test.describe('R8-F — Paramètres', () => {
  test('T-R8-F1: settings are saved and survive a reload', async ({ page }) => {
    const name = `Acme Studio ${Date.now() % 10000}`
    await signIn(page, ADMIN, '/settings')
    await page.fill('#set-name', name)
    await page.fill('#set-prefix', 'FAC')
    await page.locator('form button[type="submit"]').click()
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForSelector('html[data-hydrated]')
    await expect(page.locator('#set-name')).toHaveValue(name)
  })

  test('S-R8-F1: settings are admin-only', async ({ page }) => {
    await signIn(page, EMPLOYEE, '/settings')
    await expect(page.locator('body')).toContainText('403')
  })
})

test.describe('R8-D — Notifications', () => {
  test('T-R8-D1: an employee request shows up in the manager bell; read-all clears the count', async ({ page }) => {
    // Employee sends a request on the first free working day of next month
    await signIn(page, EMPLOYEE)
    await page.locator('header.wb-head button:has-text("Poser un congé")').click()
    await expect(page.locator(`${PANEL} .wb-rc.is-on`)).toHaveCount(1)
    const cell = page.locator(`${PANEL} .wb-rp-m`).nth(1).locator('button.wb-rp-d:not([disabled])').first()
    const iso = await cell.getAttribute('data-date')
    test.skip(!iso || iso.slice(0, 4) !== String(new Date().getFullYear()), 'next month is in another year (no balance)')
    await cell.click()
    await cell.click()
    await page.getByRole('button', { name: 'Envoyer la demande' }).click()
    await expect(page.locator(PANEL)).toHaveCount(0)

    await signIn(page, MANAGER)
    const bell = page.locator('header.wb-head button.wb-bell')
    await expect(bell.locator('.wb-num')).toBeVisible({ timeout: 10_000 })
    await bell.click()
    await expect(page.locator('.wb-np li.is-un[data-kind="request_submitted"]').first()).toBeVisible()
    await page.locator('.wb-np header button').click()
    await expect(bell.locator('.wb-num')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('.wb-np')).toHaveCount(0)
  })
})
