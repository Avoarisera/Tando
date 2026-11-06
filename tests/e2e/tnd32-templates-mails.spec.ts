/**
 * E2E — TND-32: template libraries (reviews, job openings) and the e-mails of a
 * review campaign. REQUIRES the local stack (Mailpit on :54424, SMTP :54425).
 */
import { test, expect, type Page } from '@playwright/test'

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54424'
const ADMIN = { email: 'admin@waka.com', password: 'Waka2026!' }
const RUN = Date.now().toString(36)

async function signIn(page: Page, path: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.waitForSelector('html[data-hydrated]')
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|profile)?$/)
  await page.goto(path)
  await page.waitForSelector('html[data-hydrated]')
  await page.waitForLoadState('networkidle')
}
async function mailTo(page: Page, to: string, subject: RegExp) {
  for (let i = 0; i < 20; i++) {
    const res = await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)
    const list = await res.json() as { messages?: { Subject: string }[] }
    const hit = list.messages?.find(m => subject.test(m.Subject))
    if (hit) return hit.Subject
    await page.waitForTimeout(500)
  }
  return null
}

test.describe.serial('TND-32 — modèles et e-mails', () => {
  test('T-TND32-001: SMTP to the local Mailpit', async ({ page }) => {
    await signIn(page, '/settings')
    await page.fill('#mail-host', '127.0.0.1')
    await page.fill('#mail-port', '54425')
    await page.locator('#mail-sec').selectOption('none')
    await page.fill('#mail-user', '')
    await page.fill('#mail-pass', 'secret-e2e')
    await page.fill('#mail-from-name', 'WakaBods')
    await page.fill('#mail-from', 'rh@example.com')
    const enable = page.getByLabel('Activer l’envoi des e-mails')
    if (!(await enable.isChecked())) await enable.check()
    await page.locator('[data-action="save-mail"]').click()
    await expect(page.getByText('Réglages d’e-mail enregistrés')).toBeVisible()
  })

  test('T-TND32-002: review templates — library, duplicate, archive', async ({ page }) => {
    await signIn(page, '/evaluations/modeles')
    await expect(page.locator('[data-template]')).toHaveCount(3)
    await expect(page.locator('[data-template="Point d’étape de mi-année"]')).toBeVisible()
    await page.locator('[data-template="Revue annuelle"] [data-action="duplicate-template"]').click()
    await expect(page.locator('[data-template="Revue annuelle (copie)"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.locator('[data-template="Revue annuelle (copie)"] [data-action="archive-template"]').click()
    await page.locator('[data-action="confirm-archive"]').click()
    await expect(page.locator('[data-template="Revue annuelle (copie)"]')).toHaveCount(0)
  })

  test('T-TND32-003: « Utiliser » a template, launch — employee and manager get an e-mail', async ({ page }) => {
    await signIn(page, '/evaluations/modeles')
    await page.locator('[data-template="Point d’étape de mi-année"] [data-action="use-template"]').click()
    await expect(page.locator('#cy-name')).toHaveValue(/^Point d’étape de mi-année \d{4}$/)
    await expect(page.locator('[data-tpl-preview]')).toContainText('3 compétences')
    await page.fill('#cy-name', `Mi-année ${RUN}`)
    await page.locator('[data-action="create-cycle"]').click()
    await page.waitForURL(/\/evaluations\/campagne\//)
    await expect(page.locator('.wb-cy-steps .is-cur')).toContainText('Choisir les personnes')
    await expect(page.locator('.wb-cy-g li', { hasText: 'Marc Manager' })).toBeVisible()
    for (const name of await page.locator('.wb-cy-g li').allInnerTexts()) {
      if (!/Emma/.test(name)) await page.getByLabel(name.trim(), { exact: true }).uncheck()
    }
    await page.locator('[data-action="launch"]').click()
    await page.locator('[data-action="confirm-launch"]').click()
    await expect(page.getByText(/\d+ e-mails? envoyés?/)).toBeVisible()
    expect(await mailTo(page, 'employee1@waka.com', new RegExp(`auto-évaluation est ouverte — Mi-année ${RUN}`))).not.toBeNull()
    expect(await mailTo(page, 'manager@waka.com', new RegExp(`Évaluation de Emma Employée à rédiger — Mi-année ${RUN}`))).not.toBeNull()
  })

  test('T-TND32-004: new opening from a job template is pre-filled', async ({ page }) => {
    await signIn(page, '/recrutement')
    await page.locator('[data-action="new-opening"]').click()
    await page.locator('[data-job-template="Commercial·e B2B"]').click()
    await page.waitForURL(/\/recrutement\/nouvelle\?modele=/)
    await expect(page.locator('#op-title')).toHaveValue('Commercial·e B2B')
    await expect(page.locator('#op-missions')).toHaveValue(/prospecter/)
    await expect(page.locator('#op-slug')).toHaveValue('commercial-e-b2b')
  })

  test('T-TND32-005: edit a job template; save an opening as a template', async ({ page }) => {
    await signIn(page, '/recrutement/modeles')
    await expect(page.locator('[data-job-template]')).toHaveCount(4)
    await page.locator('[data-job-template="Stage / alternance"] [data-action="edit-job-template"]').click()
    await expect(page.locator('#op-slug')).toHaveCount(0)
    await page.fill('#tpl-name', `Stage ${RUN}`)
    await page.locator('[data-action="save-job-template"]').click()
    await page.waitForURL(/\/recrutement\/modeles$/)
    await expect(page.locator(`[data-job-template="Stage ${RUN}"]`)).toBeVisible()

    await page.goto('/recrutement/nouvelle')
    await page.waitForSelector('html[data-hydrated]')
    await page.fill('#op-title', `Data analyst ${RUN}`)
    await page.locator('[data-action="save-as-template"]').click()
    await expect(page.getByText(`Modèle « Data analyst ${RUN} » enregistré`)).toBeVisible()
  })
})
