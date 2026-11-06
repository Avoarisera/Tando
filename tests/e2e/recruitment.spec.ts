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
  employee2: { email: 'employee2@waka.com', password: 'Waka2026!' },
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

  // ── Lot 2 ────────────────────────────────────────────────────────────────
  let track = ''
  test('T-TND30-007: a second candidate applies; the follow-up link shows coarse progress', async ({ request, browser }) => {
    const res = await request.post(`/api/careers/${SLUG}/apply`, { multipart: {
      first_name: 'Lina', last_name: `Lot2${RUN}`, email: `lina.${RUN}@example.com`, consent: 'true', answers: '{}',
      cv: { name: 'CV Lina.pdf', mimeType: 'application/pdf', buffer: PDF } } })
    expect(res.status()).toBe(200)
    track = (await res.json()).track
    const visitor = await browser.newContext()
    const page = await visitor.newPage()
    await page.goto(`/carrieres/suivi/${track}`)
    await expect(page.getByText('Candidature reçue')).toBeVisible()
    await expect(page.getByText(TITLE)).toBeVisible()
    await visitor.close()
  })

  test('T-TND30-008: HR plans an interview with an employee as interviewer', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/recrutement')
    await page.locator(`a[data-opening="${TITLE}"]`).click()
    await page.locator('.wb-pp-card', { hasText: `Lot2${RUN}` }).click()
    const panel = page.locator('.wb-panel')
    await panel.getByRole('tab', { name: 'Entretiens' }).click()
    await panel.locator('[data-action="plan-interview"]').click()
    await panel.getByLabel('Eddy Employé').check()
    await panel.locator('[data-action="save-interview"]').click()
    await expect(panel.locator('.wb-iv-item').first()).toContainText('Eddy Employé')
  })

  test('T-TND30-009: the invited employee sees only this candidate, scores, cannot move the stage', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee2, '/')
    await expect(page.locator('.wb-side-col nav a[href="/recrutement"]')).toBeVisible()
    await page.goto('/recrutement')
    await page.locator(`a[data-opening="${TITLE}"]`).click()
    await expect(page.locator('.wb-pp-card')).toHaveCount(1)
    await page.locator('.wb-pp-card').click()
    const panel = page.locator('.wb-panel')
    await expect(panel.locator('.wb-cp-act select')).toHaveCount(0)
    await panel.getByRole('tab', { name: 'Évaluations' }).click()
    await expect(panel.getByText('Les évaluations des autres s’affichent une fois la vôtre envoyée')).toBeVisible()
    for (const crit of await panel.locator('.wb-sc-crit').all()) await crit.locator('[data-level="4"]').click()
    await panel.getByRole('radio', { name: 'Oui, fortement' }).click()
    await panel.locator('[data-action="submit-scorecard"]').click()
    await expect(panel.getByText(/Évaluation envoyée le/)).toBeVisible()
  })

  test('T-TND30-010: HR sees the scorecard, moves to « Offre » and hires: the account is created', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/recrutement')
    await page.locator(`a[data-opening="${TITLE}"]`).click()
    await page.locator('.wb-pp-card', { hasText: `Lot2${RUN}` }).click()
    const panel = page.locator('.wb-panel')
    await panel.getByRole('tab', { name: 'Évaluations' }).click()
    await expect(panel.locator('.wb-sc-card')).toContainText('Eddy Employé')
    await expect(panel.getByText(/Synthèse de 1 évaluation/)).toBeVisible()
    await panel.locator('.wb-cp-act select').selectOption('offer')
    await panel.locator('[data-action="hire"]').click()
    await page.locator('[data-action="confirm-hire"]').click()
    // the « Embauché » badge (not the stage list) once the account is created
    await expect(panel.locator('.wb-cp-act .wb-badge', { hasText: 'Embauché' })).toBeVisible({ timeout: 15_000 })
    await page.goto('/people')
    await expect(page.locator("b", { hasText: `Lina Lot2${RUN}` })).toBeVisible()
  })

  test('T-TND30-011: a candidate withdraws, then erases their data from the follow-up link', async ({ request, browser }) => {
    const res = await request.post(`/api/careers/${SLUG}/apply`, { multipart: {
      first_name: 'Rado', last_name: `Out${RUN}`, email: `rado.${RUN}@example.com`, consent: 'true', answers: '{}',
      cv: { name: 'cv.pdf', mimeType: 'application/pdf', buffer: PDF } } })
    const token = (await res.json()).track
    const visitor = await browser.newContext()
    const page = await visitor.newPage()
    await page.goto(`/carrieres/suivi/${token}`)
    await waitForHydration(page)
    await page.locator('[data-action="withdraw"]').click()
    await page.locator('[data-action="confirm-track"]').click()
    await expect(page.getByText('Vous avez retiré votre candidature.')).toBeVisible()
    await page.locator('[data-action="erase"]').click()
    await page.locator('[data-action="confirm-track"]').click()
    await expect(page.getByText('Vos données sont supprimées')).toBeVisible()
    await page.goto(`/carrieres/suivi/${token}`)
    await expect(page.getByText('Lien invalide')).toBeVisible()
    await visitor.close()
  })

  // ── Lots 3 & 4 ───────────────────────────────────────────────────────────
  test('T-TND30-012: statistics show the funnel and the sources', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/recrutement?vue=stats')
    await expect(page.getByRole('heading', { name: 'Entonnoir' })).toBeVisible()
    await expect(page.locator('.wb-rs-funnel li')).not.toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible()
    await expect(page.getByText('Page carrières').first()).toBeVisible()
  })

  test('T-TND30-013: a pooled candidate is proposed for another opening', async ({ page, request }) => {
    const pooled = await request.post(`/api/careers/${SLUG}/apply`, { multipart: {
      first_name: 'Vola', last_name: `Pool${RUN}`, email: `vola.${RUN}@example.com`, consent: 'true', consent_pool: 'true', answers: '{}',
      cv: { name: 'cv.pdf', mimeType: 'application/pdf', buffer: PDF } } })
    expect(pooled.status()).toBe(200)
    // a second opening to propose them for
    await signIn(page, ACCOUNTS.admin, '/recrutement/nouvelle')
    await page.fill('#op-title', `Autre poste ${RUN}`)
    await page.fill('#op-min', '20000')
    await page.fill('#op-max', '25000')
    await page.locator('[data-action="publish"]').click()
    await page.waitForURL(/\/recrutement\/[0-9a-f-]{36}/)
    await page.goto('/recrutement?vue=pool')
    const row = page.locator('.wb-tp tbody tr', { hasText: `Pool${RUN}` })
    await row.locator('[data-action="propose"]').click()
    await page.locator('#pool-target').selectOption({ label: `Autre poste ${RUN}` })
    await page.locator('[data-action="confirm-propose"]').click()
    await expect(page.getByText(`est proposé·e pour « Autre poste ${RUN} »`)).toBeVisible()
    await page.goto('/recrutement')
    await page.locator(`a[data-opening="Autre poste ${RUN}"]`).click()
    await expect(page.locator('.wb-pp-card', { hasText: `Pool${RUN}` })).toContainText('Vivier')
  })

  test('T-TND30-014: anonymous screening hides the identity at the first stages', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/recrutement')
    await page.locator(`a[data-opening="Autre poste ${RUN}"]`).click()
    await page.getByRole('tab', { name: 'Offre' }).click()
    await page.getByText('Présélection anonyme').click()
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(page.getByText('Offre enregistrée')).toBeVisible()
    await page.getByRole('tab', { name: /Candidatures/ }).click()
    const card = page.locator('.wb-pp-card').first()
    await expect(card).toContainText('Candidat n°')
    await expect(card).not.toContainText(`Pool${RUN}`)
    await card.click()
    await expect(page.locator('.wb-panel')).toContainText('Présélection anonyme')
    await expect(page.locator('.wb-panel')).not.toContainText(`vola.${RUN}@example.com`)
  })

  test('T-TND30-015: Settings › E-mails (SMTP): presets, write-only password, connection test', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/settings')
    await page.locator('#mail-preset').selectOption('google')
    await expect(page.locator('#mail-host')).toHaveValue('smtp.gmail.com')
    await expect(page.locator('#mail-port')).toHaveValue('587')
    // local SMTP sink of the Supabase stack (Mailpit)
    await page.fill('#mail-host', '127.0.0.1')
    await page.fill('#mail-port', '54425')
    await page.locator('#mail-sec').selectOption('none')
    await page.fill('#mail-user', '')
    await page.fill('#mail-pass', 'secret-e2e')
    await page.fill('#mail-from-name', 'Recrutement')
    await page.fill('#mail-from', 'jobs@example.com')
    await page.locator('[data-action="save-mail"]').click()
    await expect(page.getByText('Réglages d’e-mail enregistrés')).toBeVisible()
    await page.reload()
    await waitForHydration(page)
    await expect(page.locator('#mail-pass')).toHaveValue('')
    await expect(page.locator('#mail-pass')).toHaveAttribute('placeholder', /Mot de passe enregistré/)
    await page.locator('[data-action="verify-mail"]').click()
    await expect(page.getByText('Connexion et identifiants acceptés par le serveur SMTP.')).toBeVisible()
    await page.locator('[data-action="test-mail"]').click()
    await expect(page.getByText(/E-mail de test envoyé à/)).toBeVisible()
  })

  test('T-TND30-016: an employee cannot read the e-mail settings', async ({ page }) => {
    await signIn(page, ACCOUNTS.employee1, '/')
    const status = await page.evaluate(async () => (await fetch('/api/settings/mail')).status)
    expect(status).toBe(401)
  })
})
