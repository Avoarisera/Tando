/** E2E — TND-35: calibration with a reason, team report, professional interview (no rating), schedule */
import { test, expect, type Page } from '@playwright/test'

const P = 'Waka2026!'
const ADMIN = { email: 'admin@waka.com', password: P }
const MANAGER = { email: 'manager@waka.com', password: P }
const EMMA = { email: 'employee1@waka.com', password: P }
const RUN = Date.now().toString(36)
const CYCLE = `Lot3 ${RUN}`

async function signIn(page: Page, a: { email: string, password: string }, path: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.waitForSelector('html[data-hydrated]')
  await page.fill('#email', a.email)
  await page.fill('#password', a.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|profile)?$/)
  await page.goto(path)
  await page.waitForSelector('html[data-hydrated]')
  await page.waitForLoadState('networkidle')
}
async function fill(page: Page, level: number) {
  await page.waitForSelector('[data-q] textarea')
  for (const c of await page.locator('.wb-rf-comp').all()) await c.locator(`[data-level="${level}"]`).click()
  for (const ta of await page.locator('[data-q] textarea').all()) await ta.fill('Un exemple concret de la période.')
  await page.locator('[data-action="submit-review"]').click()
  await page.locator('[data-action="confirm-submit"]').click()
  await expect(page.getByText('Évaluation envoyée').first()).toBeVisible()
}
async function launchFor(page: Page, who: RegExp) {
  await expect(page.locator('.wb-cy-g li', { hasText: 'Marc Manager' })).toBeVisible()
  for (const name of await page.locator('.wb-cy-g li').allInnerTexts()) {
    const box = page.getByLabel(name.trim(), { exact: true })
    if (who.test(name)) await box.check()
    else await box.uncheck()
  }
  await page.locator('[data-action="launch"]').click()
  await page.locator('[data-action="confirm-launch"]').click()
}

test.describe.serial('TND-35 — lot 3', () => {
  test('T-TND35-001: rated campaign → HR rating, then calibration with a mandatory reason', async ({ page }) => {
    await signIn(page, ADMIN, '/evaluations')
    await page.locator('[data-action="new-cycle"]').click()
    await page.fill('#cy-name', CYCLE)
    await page.getByLabel('Inclure des retours de collègues (360°)').uncheck()
    await page.locator('[data-action="create-cycle"]').click()
    await page.waitForURL(/\/evaluations\/campagne\//)
    await launchFor(page, /Emma/)
    await expect(page.locator('tbody tr')).toHaveCount(1)
    const url = page.url()

    await signIn(page, EMMA, '/mes-evaluations')
    await page.locator('.wb-me-c.is-todo[data-packet="self"]', { hasText: CYCLE }).click()
    await fill(page, 3)
    await signIn(page, MANAGER, '/mes-evaluations')
    await page.locator('.wb-me-c.is-todo[data-packet="Emma Employée"]', { hasText: CYCLE }).click()
    await fill(page, 2)

    await signIn(page, ADMIN, url.replace(/^https?:\/\/[^/]+/, ''))
    await page.locator('tr[data-packet="Emma Employée"] a').click()
    await page.locator('[data-rating="1"]').click()
    await page.locator('[data-action="save-conclusion"]').click()
    await expect(page.getByText('Conclusion enregistrée').first()).toBeVisible()

    await page.goto(`${url.replace(/^https?:\/\/[^/]+/, '')}?vue=calibration`)
    await page.waitForSelector('html[data-hydrated]')
    const row = page.locator('[data-cal="Emma Employée"]')
    await expect(row).toHaveClass(/is-gap/)
    await row.locator('[data-action="calibrate"]').click()
    await page.locator('.wb-cal-r[data-rating="2"]').click()
    await page.fill('#cal-reason', 'court')
    await page.locator('[data-action="confirm-calibrate"]').click()
    await expect(page.getByText('Justifiez l’ajustement (10 caractères au moins)')).toBeVisible()
    await page.fill('#cal-reason', 'Alignement avec les dossiers comparables de l’équipe')
    await page.locator('[data-action="confirm-calibrate"]').click()
    await expect(row).toContainText('1 ajustement')
    await expect(row).toContainText('À améliorer')
  })

  test('T-TND35-002: report by team hides averages of small teams', async ({ page }) => {
    await signIn(page, ADMIN, '/evaluations')
    await page.locator(`a[data-cycle="${CYCLE}"]`).click()
    await page.getByRole('tab', { name: 'Rapport par équipe' }).click()
    const team = page.locator('[data-team]').first()
    await expect(team).toContainText('Auto-évaluations')
    await expect(team.locator('[data-small]')).toBeVisible()
  })

  test('T-TND35-003: schedule → professional interview launched, filled, shared without rating', async ({ page }) => {
    await signIn(page, ADMIN, '/evaluations?vue=professionnel')
    const emma = page.locator('[data-ep="Emma Employée"]')
    await expect(emma).toBeVisible()
    await emma.locator('input[type="checkbox"]').check()
    await page.locator('[data-action="launch-ep"]').click()
    await page.waitForURL(/\/evaluations\/campagne\/.+people=/)
    await expect(page.getByLabel('Emma Employée', { exact: true })).toBeChecked()
    await expect(page.getByLabel('Eddy Employé', { exact: true })).not.toBeChecked()
    await page.locator('[data-action="launch"]').click()
    await page.locator('[data-action="confirm-launch"]').click()
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.getByRole('tab', { name: 'Harmonisation' })).toHaveCount(0)
    const url = page.url().replace(/^https?:\/\/[^/]+/, '')

    await signIn(page, EMMA, '/mes-evaluations')
    await page.locator('.wb-me-c.is-todo[data-packet="self"]', { hasText: 'Entretiens professionnels' }).first().click()
    await expect(page.locator('.wb-rf-comp')).toHaveCount(0)
    await fill(page, 0)

    await signIn(page, ADMIN, url)
    await page.locator('tr[data-packet="Emma Employée"] a').click()
    await expect(page.locator('[data-rating]')).toHaveCount(0)
    await page.fill('#hr-strengths', 'Projet professionnel clair')
    await page.locator('[data-action="share"]').click()
    await page.locator('[data-action="confirm-share"]').click()
    await expect(page.getByText(/Partagée le/)).toBeVisible()
  })
})
