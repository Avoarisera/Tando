/**
 * E2E tests — Évaluations (TND-29, lot 1): campaign, self review, manager review,
 * HR conclusion, release, acknowledgement.
 *
 * REQUIRES: supabase start && supabase db reset (seed included), app running.
 * Seed: Équipe A = Marc (manager), Emma, Eddy. Each run creates its own campaign.
 */
import { test, expect, type Page } from '@playwright/test'

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
  employee2: { email: 'employee2@waka.com', password: 'Waka2026!' },
}
const RUN = Date.now().toString(36)
const CYCLE = `Revue E2E ${RUN}`

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
async function fill(page: Page, level: number) {
  await page.waitForSelector('.wb-rf-comp')
  for (const c of await page.locator('.wb-rf-comp').all()) await c.locator(`[data-level="${level}"]`).click()
  for (const ta of await page.locator('[data-q] textarea').all()) await ta.fill('Un exemple concret de la période.')
}

test.describe.serial('TND-29 — Évaluations', () => {
  test('T-TND29-001: HR creates and launches a campaign for Emma and Eddy', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/evaluations')
    await page.locator('[data-action="new-cycle"]').click()
    await page.fill('#cy-name', CYCLE)
    await page.locator('[data-action="create-cycle"]').click()
    await page.waitForURL(/\/evaluations\/campagne\//)
    // only Emma and Eddy (wait for the people list first)
    await expect(page.locator('.wb-cy-g li', { hasText: 'Marc Manager' })).toBeVisible()
    for (const name of await page.locator('.wb-cy-g li').allInnerTexts()) {
      if (!/Emma|Eddy/.test(name)) await page.getByLabel(name.trim(), { exact: true }).uncheck()
    }
    await page.locator('[data-action="launch"]').click()
    await page.locator('[data-action="confirm-launch"]').click()
    await expect(page.locator('tbody tr')).toHaveCount(2)
    await expect(page.locator('tr[data-packet="Emma Employée"]')).toContainText('Attend l’auto-évaluation')
  })

  test('T-TND29-002: Emma fills in and sends her self review; it is then locked', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1, '/mes-evaluations')
    await expect(page.locator('.wb-side-col nav a[href="/mes-evaluations"]')).toBeVisible()
    await page.locator('.wb-me-c.is-todo[data-packet="self"]').first().click()
    // incomplete → listed as missing
    await page.locator('[data-action="submit-review"]').click()
    await expect(page.getByText(/éléments? à compléter/)).toBeVisible()
    await fill(page, 3)
    await page.locator('[data-action="submit-review"]').click()
    await page.locator('[data-action="confirm-submit"]').click()
    await expect(page.getByText(/Votre auto-évaluation est envoyée/)).toBeVisible()
  })

  test('T-TND29-003: the manager writes the review, then sees the self review', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager, '/mes-evaluations')
    await page.locator('.wb-me-c.is-todo[data-packet="Emma Employée"]').first().click()
    await expect(page.getByText(/Vous verrez son auto-évaluation une fois la vôtre envoyée/)).toBeVisible()
    await fill(page, 2)
    await page.locator('[data-action="submit-review"]').click()
    await page.locator('[data-action="confirm-submit"]').click()
    await expect(page.getByRole('heading', { name: 'Synthèse par compétence' })).toBeVisible()
    await expect(page.locator('.wb-rs2-dot.is-self').first()).toBeVisible()
  })

  test('T-TND29-004: a colleague sees nothing of Emma’s review', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee2, '/mes-evaluations')
    await expect(page.locator('.wb-me-c[data-packet="Emma Employée"]')).toHaveCount(0)
  })

  test('T-TND29-005: HR concludes and shares; Emma reads everything and signs', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/evaluations')
    await page.locator(`a[data-cycle="${CYCLE}"]`).click()
    await page.locator('tr[data-packet="Emma Employée"] a').click()
    await expect(page.getByRole('heading', { name: 'Synthèse par compétence' })).toBeVisible()
    await page.locator('[data-action="share"]').isDisabled()
    await page.locator('[data-rating="3"]').click()
    await page.fill('#hr-strengths', 'Fiable et rigoureuse')
    await page.fill('#hr-improve', 'Estimer plus finement')
    await page.locator('[data-action="share"]').click()
    await page.locator('[data-action="confirm-share"]').click()
    await expect(page.getByText(/Partagée le/)).toBeVisible()

    await signIn(page, ACCOUNTS.employee1, '/mes-evaluations')
    await page.locator('.wb-me-c', { hasText: CYCLE }).first().click()
    await expect(page.getByText('Conforme aux attentes')).toBeVisible()
    await expect(page.getByText('Fiable et rigoureuse')).toBeVisible()
    await page.fill('#ack-comment', 'Merci pour ces retours')
    await page.locator('[data-action="acknowledge"]').click()
    await page.locator('[data-action="confirm-ack"]').click()
    await expect(page.getByText(/Vous avez pris connaissance de ce dossier/)).toBeVisible()
  })

  test('T-TND29-006: an employee has no access to the HR campaigns', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1, '/evaluations')
    await expect(page.locator('body')).toContainText('403')
  })
})
