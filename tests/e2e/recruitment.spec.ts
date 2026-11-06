/**
 * E2E tests — Recrutement (TND-30, lot 1): openings, public careers page,
 * application with a CV, pipeline, candidate file, decline.
 *
 * REQUIRES: supabase start && supabase db reset (seed included), app running.
 * Each run creates its own opening (unique title), so tests do not depend on order.
 */
import { test, expect, type Page } from '@playwright/test'

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
}
const RUN = Date.now().toString(36)
const TITLE = `Testeur QA ${RUN}`
const SLUG = `testeur-qa-${RUN}`
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

async function waitForHydration(page: Page) {
  await page.waitForSelector('html[data-hydrated]')
}
async function signIn(page: Page, account: { email: string, password: string }, path: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await waitForHydration(page)
  await page.fill('#email', account.email)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|profile)?$/)
  await page.goto(path)
  await waitForHydration(page)
}

test.describe.serial('TND-30 — Recrutement', () => {
  test('T-TND30-001: HR creates and publishes an opening; it shows on the careers page', async ({ page, browser }) => {
    await signIn(page, ACCOUNTS.admin, '/recrutement/nouvelle')
    await page.fill('#op-title', TITLE)
    await page.fill('#op-loc', 'Antananarivo')
    await page.fill('#op-missions', '- Tester les parcours\n- Écrire des cas de test')
    // salary range required to publish (EU pay transparency)
    await page.locator('[data-action="publish"]').click()
    await expect(page.getByText('Indiquez une fourchette de salaire avant de publier.')).toBeVisible()
    await page.fill('#op-min', '20000')
    await page.fill('#op-max', '28000')
    await page.locator('[data-action="publish"]').click()
    await page.waitForURL(/\/recrutement\/[0-9a-f-]{36}/)

    const visitor = await browser.newContext()
    const pub = await visitor.newPage()
    await pub.goto('/carrieres')
    await expect(pub.locator(`a[data-slug="${SLUG}"]`)).toContainText(TITLE)
    await pub.locator(`a[data-slug="${SLUG}"]`).click()
    await expect(pub.locator('h1')).toHaveText(TITLE)
    await expect(pub.getByText(/20\s?000\s?€ – 28\s?000\s?€ brut \/ an/)).toBeVisible()
    await visitor.close()
  })

  test('T-TND30-002: a visitor applies with a CV, without an account', async ({ browser }) => {
    const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await visitor.newPage()
    await page.goto(`/carrieres/${SLUG}`)
    await waitForHydration(page)
    // empty form → field errors, nothing sent
    await page.getByRole('button', { name: 'Envoyer ma candidature' }).click()
    await expect(page.getByText('Ajoutez votre CV.')).toBeVisible()
    await expect(page.getByText('Votre accord est nécessaire pour traiter la candidature.')).toBeVisible()

    await page.fill('#ap-first', 'Awa')
    await page.fill('#ap-last', `Test${RUN}`)
    await page.fill('#ap-email', `awa.${RUN}@example.com`)
    await page.locator('#ap-cv').setInputFiles({ name: 'CV Awa.pdf', mimeType: 'application/pdf', buffer: PDF })
    await page.getByText('J’accepte que').click()
    await page.getByRole('button', { name: 'Envoyer ma candidature' }).click()
    await expect(page.locator('.wb-apply-ok')).toContainText('Merci Awa')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await visitor.close()
  })

  test('T-TND30-003: a file that is not really a PDF is refused by the server', async ({ request }) => {
    const res = await request.post(`/api/careers/${SLUG}/apply`, {
      multipart: {
        first_name: 'Bob', last_name: 'Fake', email: `bob.${RUN}@example.com`, consent: 'true', answers: '{}',
        cv: { name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ this is an executable') },
      },
    })
    expect(res.status()).toBe(422)
    expect((await res.json()).data.errors).toContain('cv_type')
  })

  test('T-TND30-004: HR sees the application, adds a note, moves and declines it', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/recrutement')
    await page.locator(`a[data-opening="${TITLE}"]`).click()
    const card = page.locator('.wb-pp-card', { hasText: `Test${RUN}` })
    await expect(page.locator('[data-stage="new"]').locator('.wb-pp-card', { hasText: `Test${RUN}` })).toBeVisible()
    await card.click()
    const panel = page.locator('.wb-panel')
    await expect(panel).toContainText(`awa.${RUN}@example.com`)
    await expect(panel.getByText('CV Awa.pdf')).toBeVisible()

    await panel.getByRole('tab', { name: 'Activité' }).click()
    await expect(panel).toContainText('Candidature reçue')
    await page.fill('#cp-note', 'Bon profil')
    await panel.getByRole('button', { name: 'Ajouter la note' }).click()
    await expect(panel.locator('.wb-cp-feed')).toContainText('Bon profil')

    await panel.locator('.wb-cp-act select').selectOption('screen')
    await expect(panel.locator('.wb-cp-feed')).toContainText('Nouvelle → Présélection')

    await panel.locator('[data-action="decline"]').click()
    await page.locator('[data-action="confirm-decline"]').click()
    await expect(page.getByText('Le motif interne est obligatoire.')).toBeVisible()
    await page.fill('#cp-reason', 'Profil trop junior pour ce poste')
    await page.getByLabel('Envoyer l’e-mail de refus au candidat').uncheck()
    await page.locator('[data-action="confirm-decline"]').click()
    await expect(panel.getByText('Non retenue', { exact: true })).toBeVisible()
    await expect(panel).toContainText('Profil trop junior pour ce poste')
  })

  test('T-TND30-005: an employee has no access to recruitment', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1, '/recrutement')
    await expect(page.locator('body')).toContainText('403')
    await page.goto('/')
    await expect(page.locator('.wb-side-col nav a[href="/recrutement"]')).toHaveCount(0)
  })

  test('T-TND30-006: an unknown or closed opening shows a clear message', async ({ page }) => {
    await page.goto('/carrieres/offre-qui-n-existe-pas')
    await expect(page.getByText('Cette offre n’est plus disponible')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Toutes les offres' })).toBeVisible()
  })
})
