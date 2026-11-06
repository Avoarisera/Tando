/** E2E — TND-34: main role + HR access, explained and settable at invitation */
import { test, expect, type Page } from '@playwright/test'

const ADMIN = { email: 'admin@waka.com', password: 'Waka2026!' }
const PANEL = '.wb-panel[role="dialog"]'
async function signIn(page: Page, path: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.waitForSelector('html[data-hydrated]')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard)?$/)
  await page.goto(path)
  await page.waitForSelector('html[data-hydrated]')
  await page.waitForLoadState('networkidle')
}

test('T-TND34-001: invite a manager with HR access; the summary explains the combination', async ({ page }) => {
  const run = Date.now().toString(36)
  const email = `rh-manager-${run}@waka.com`
  await signIn(page, '/people')
  await page.locator('[data-action="invite-person"]').click()
  const panel = page.locator(PANEL)
  await page.fill('#person-email', email)
  await page.fill('#person-first', 'Rhea')
  await page.fill('#person-last', `Manager${run}`)
  await page.locator('#person-role').selectOption('manager')
  await panel.locator('[data-field="is-hr"] input, input[data-field="is-hr"]').first().check()
  await expect(panel.locator('[data-roles-summary]')).toContainText('Manager + RH')
  await expect(panel.locator('[data-roles-summary]')).toContainText('recrutement')
  // admin: HR included, not a separate choice
  await page.locator('#person-role').selectOption('admin')
  await expect(panel.getByLabel('Accès RH inclus (l’administrateur a tous les accès)')).toBeChecked()
  await page.locator('#person-role').selectOption('manager')
  await panel.locator('button[type="submit"]').click()
  await expect(page.locator(PANEL)).toHaveCount(0)
  await expect(page.locator(`tr[data-person="Rhea Manager${run}"]`).getByText('+ RH')).toBeVisible()
})
