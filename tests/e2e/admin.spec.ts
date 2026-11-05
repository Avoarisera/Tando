/**
 * E2E tests — Admin pages (refonte, lot R5): Tableau de bord, Personnes et
 * équipes, Congés et règles, Factures.
 *
 * REQUIRES: supabase start && supabase db reset (seed included), app running.
 * Set SUPABASE_URL to the local stack for the storage test (default :54321).
 */

import { test, expect, type Page } from '@playwright/test'

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
}
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const MINIMAL_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
const PANEL = '.wb-panel[role="dialog"]'

async function waitForHydration(page: Page) {
  await page.waitForSelector('html[data-hydrated]')
}

async function signIn(page: Page, account: { email: string; password: string }, path: string) {
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

// ============================================================
// Access
// ============================================================
test.describe('R5 — Access', () => {
  for (const path of ['/dashboard', '/people', '/leave-types', '/invoices']) {
    test(`S-R5-001: ${path} is admin-only (403 for employee and manager)`, async ({ page }) => {
      await signIn(page, ACCOUNTS.employee1, path)
      await expect(page.locator('body')).toContainText('403')
      await signIn(page, ACCOUNTS.manager, path)
      await expect(page.locator('body')).toContainText('403')
    })
  }

  test('S-R5-002: unauthenticated access redirects to /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/invoices')
    await expect(page).toHaveURL('/login')
  })

  test('S-R5-003: the invoices bucket is private (public URL refused)', async ({ request }) => {
    const res = await request.get(`${SUPABASE_URL}/storage/v1/object/public/invoices/nonexistent.pdf`)
    expect([400, 401, 403, 404]).toContain(res.status())
  })
})

// ============================================================
// Tableau de bord
// ============================================================
test.describe('R5 — Tableau de bord', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/dashboard')
  })

  test('T-R5-001: 4 indicators, the approval queue and the 14-day chart', async ({ page }) => {
    await expect(page.locator('.wb-metric')).toHaveCount(4)
    await expect(page.locator('.wb-metric').first()).toContainText('Effectif')
    await expect(page.locator('.wb-metric').first().locator('.display')).toHaveText(/^\d+$/)
    await expect(page.getByRole('link', { name: /Voir tout \(\d+\)/ })).toHaveAttribute('href', '/approvals')
    await expect(page.getByText('14 prochains jours')).toBeVisible()
  })

  test('T-R5-002: monthly export downloads a CSV', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exporter les absences du mois' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^absences-\d{4}-\d{2}\.csv$/)
  })

  test('T-R5-003: "Nouvelle facture" opens the invoice panel', async ({ page }) => {
    await page.getByRole('link', { name: 'Nouvelle facture' }).click()
    await expect(page).toHaveURL(/\/invoices\?new=1/)
    await expect(page.locator(PANEL)).toBeVisible()
  })

  test('T-R5-004: RPC failure shows the retry button', async ({ page }) => {
    await page.route('**/rest/v1/rpc/get_dashboard_snapshot*', route => route.fulfill({ status: 500, body: '{"message":"boom"}' }))
    await page.reload()
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible()
  })
})

// ============================================================
// Personnes et équipes
// ============================================================
test.describe('R5 — Personnes et équipes', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/people')
  })

  test('T-R5-010: lists people with team, role and status', async ({ page }) => {
    const emma = page.locator('tr[data-person="Emma Employée"]')
    await expect(emma).toContainText('Équipe A')
    await expect(emma).toContainText('Employé')
    await expect(page.locator('tr[data-person="Marc Manager"]')).toContainText('Manager')
  })

  test('T-R5-011: search and role filter', async ({ page }) => {
    await page.getByPlaceholder('Rechercher une personne').fill('marc')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await page.getByPlaceholder('Rechercher une personne').fill('')
    await page.getByLabel('Rôle').selectOption('manager')
    await expect(page.locator('tbody tr')).toHaveCount(1)
  })

  test('T-R5-012: teams tab shows members and the manager', async ({ page }) => {
    await page.getByRole('tab', { name: /Équipes/ }).click()
    await expect(page.locator('tr[data-team="Équipe A"]')).toContainText('Manager : Marc Manager')
  })
})

// ============================================================
// Congés et règles
// ============================================================
test.describe('R5 — Congés et règles', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/leave-types')
  })

  test('T-R5-020: lists the seeded types with status and actions, no delete', async ({ page }) => {
    const row = page.locator('tr[data-type="Congé payé"]')
    await expect(row).toContainText('Actif')
    await expect(row.getByRole('button', { name: 'Modifier' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Désactiver' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0)
  })

  test('T-R5-021: creating needs a name; a new type appears in the table', async ({ page }) => {
    await page.getByRole('button', { name: 'Ajouter un type' }).click()
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Le nom est obligatoire')).toBeVisible()
    const name = `Formation ${Date.now() % 10000}`
    await page.fill('#type-name', name)
    await page.getByRole('radio', { name: 'Violet' }).check({ force: true })
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Type de congé ajouté')).toBeVisible()
    await expect(page.locator(`tr[data-type="${name}"]`)).toBeVisible()
  })

  test('T-R5-022: deactivate then reactivate a type', async ({ page }) => {
    const row = page.locator('tr[data-type="Congé sans solde"]')
    await row.getByRole('button', { name: 'Désactiver' }).click()
    await expect(row).toContainText('Inactif')
    await row.getByRole('button', { name: 'Activer' }).click()
    await expect(row).toContainText('Actif')
  })

  test('T-R5-023: the name is rendered as text (no script execution)', async ({ page }) => {
    await page.getByRole('button', { name: 'Ajouter un type' }).click()
    const xss = `<img src=x onerror="window.__xss=1"> ${Date.now() % 10000}`
    await page.fill('#type-name', xss)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText(xss)).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss)).toBeUndefined()
  })

  test('T-R5-024: balances tab — edit one allowance, reject a negative value', async ({ page }) => {
    await page.getByRole('tab', { name: 'Soldes' }).click()
    await page.getByLabel('Type de congé').selectOption({ label: 'Congé payé' })
    const row = page.locator('tr[data-person="Eddy Employé"]')
    await row.getByRole('button', { name: /Modifier les jours acquis/ }).click()
    const input = row.getByLabel(/Jours acquis de/)
    await input.fill('-2')
    await row.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(row).toContainText('Un nombre entier, 0 ou plus')
    await input.fill('26')
    await row.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Solde mis à jour')).toBeVisible()
    await expect(row.locator('td').nth(1)).toContainText('26')
  })
})

// ============================================================
// Factures
// ============================================================
test.describe('R5 — Factures', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/invoices')
  })

  const NEW_INVOICE = '.wb-inv-toolbar button:has-text("Nouvelle facture")'

  /** Editor (lot R8): one line 1 × 1 250 € HT at 20 % = 1 500 € TTC */
  async function createInvoice(page: Page, ref: string) {
    await page.locator(NEW_INVOICE).click()
    await page.fill('#inv-reference', ref)
    await page.fill('#inv-client', 'ACME Corp')
    const line = page.locator('[data-line="0"]')
    await line.locator('input').nth(0).fill('Prestation')
    await line.locator('input').nth(2).fill('1250')
    await page.locator('[data-action="save-pdf"]').click()
    await expect(page.locator(PANEL)).toHaveCount(0, { timeout: 15_000 })
  }

  test('T-R5-030: create → toast → row "En attente" with the amount', async ({ page }) => {
    const ref = `FAC-E2E-${Date.now() % 100000}`
    await createInvoice(page, ref)
    const row = page.locator(`tr[data-ref="${ref}"]`)
    await expect(row).toContainText('1 500,00 €')
    await expect(row.getByLabel(`Statut de ${ref}`)).toHaveValue('en_attente')
  })

  test('T-R5-031: validation blocks the request (amount 0, due before date)', async ({ page }) => {
    let posted = false
    page.on('request', (r) => { if (r.url().includes('/rest/v1/invoices') && r.method() === 'POST') posted = true })
    await page.locator(NEW_INVOICE).click()
    await page.fill('#inv-client', 'ACME')
    const line = page.locator('[data-line="0"]')
    await line.locator('input').nth(0).fill('Prestation')
    await line.locator('input').nth(2).fill('0')
    await page.locator('[data-action="save-pdf"]').click()
    await expect(page.locator(`${PANEL} .wb-banner.wb-t-danger`)).toBeVisible()
    await line.locator('input').nth(2).fill('10')
    await page.fill('#inv-date', '2026-05-10')
    await page.fill('#inv-due', '2026-05-01')
    await page.locator('[data-action="save-pdf"]').click()
    await expect(page.locator(PANEL)).toContainText('ne peut pas être avant la date de facture')
    expect(posted).toBe(false)
    await page.keyboard.press('Escape')
    await expect(page.locator(PANEL)).toHaveCount(0)
  })

  test('T-R5-032: replace the generated PDF, then "Voir le PDF" opens a new tab', async ({ page, context }) => {
    const ref = `FAC-PDF-${Date.now() % 100000}`
    await createInvoice(page, ref)
    const row = page.locator(`tr[data-ref="${ref}"]`)
    await row.getByLabel(`PDF de ${ref}`).setInputFiles({ name: 'f.pdf', mimeType: 'application/pdf', buffer: MINIMAL_PDF })
    await expect(page.getByText('PDF enregistré')).toBeVisible({ timeout: 15_000 })
    await expect(row.getByRole('button', { name: 'Voir le PDF' })).toBeVisible()
    // The tab opens inside the click (TND-16), then loads the signed URL; headless
    // Chromium downloads the PDF, so check the request rather than the page
    const signed = context.waitForEvent('request', r => /\/storage\/v1\/object\/sign\/invoices\/.+token=/.test(r.url()))
    const [tab] = await Promise.all([context.waitForEvent('page'), row.getByRole('button', { name: 'Voir le PDF' }).click()])
    await signed
    await tab.close()
  })

  test('T-R5-033: a non-PDF file is refused', async ({ page }) => {
    const row = page.locator('tbody tr').first()
    const ref = await row.getAttribute('data-ref')
    await row.getByLabel(`PDF de ${ref}`).setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
    await expect(page.getByText('Seuls les fichiers PDF sont acceptés')).toBeVisible()
  })

  test('T-R5-034: status change persists after reload', async ({ page }) => {
    const ref = `FAC-STS-${Date.now() % 100000}`
    await createInvoice(page, ref)
    await page.locator(`tr[data-ref="${ref}"]`).getByLabel(`Statut de ${ref}`).selectOption('envoyee')
    await expect(page.getByText('Statut mis à jour')).toBeVisible()
    await page.reload()
    await waitForHydration(page)
    await expect(page.locator(`tr[data-ref="${ref}"]`).getByLabel(`Statut de ${ref}`)).toHaveValue('envoyee')
  })

  test('T-R5-035: status chips and search (3 characters minimum) filter without a request', async ({ page }) => {
    await page.getByRole('button', { name: /^Payée/ }).click()
    for (const v of await page.locator('tbody select').evaluateAll(els => els.map(e => (e as HTMLSelectElement).value))) expect(v).toBe('payee')
    await page.getByRole('button', { name: /^Toutes/ }).click()
    let fetched = false
    page.on('request', (r) => { if (r.url().includes('/rest/v1/invoices')) fetched = true })
    await page.fill('#invoice-search', 'fa')
    await expect(page.getByText('3 caractères minimum pour chercher')).toBeVisible()
    await page.fill('#invoice-search', 'zzzz-nothing')
    await expect(page.getByText('Aucune facture ne correspond à cette recherche.')).toBeVisible()
    expect(fetched).toBe(false)
  })

  test('R-R5-001: no horizontal scroll at 390 px (cards instead of the table)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await waitForHydration(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await expect(page.locator('.wb-inv-cards li').first()).toBeVisible()
  })
})
