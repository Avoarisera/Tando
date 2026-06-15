/**
 * E2E tests for RFC-016 — Factures Vault (F39, F40, F41)
 *
 * REQUIRES:
 *   - supabase start && supabase db reset  (seed applied, clean invoices table)
 *   - yarn dev  (or playwright.config.ts webServer starts it)
 *
 * NOTE: Happy-path tests insert rows that cannot be deleted via the anon key
 * (RLS: admin_all_invoices FOR ALL). Run `supabase db reset` between full
 * suite executions to restore a clean state.
 *
 * PDF upload tests require a live Supabase Storage bucket named `invoices`
 * (RFC-014 migration applied).
 */

import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'

// ── Accounts ──────────────────────────────────────────────────────────────────

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
}

// Minimal valid PDF bytes (avoids uploading a real file to CI Storage)
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
  '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n' +
  'xref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n' +
  'trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n110\n%%EOF',
)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waitForHydration(page: Page) {
  await page.waitForSelector('html[data-hydrated]', { timeout: 10_000 })
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/login')
  await waitForHydration(page)
  await page.fill('#email', account.email)
  await page.fill('#password', account.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(profile|dashboard)/)
  await waitForHydration(page)
}

async function clearSession(page: Page) {
  await page.context().clearCookies()
}

async function goToInvoices(page: Page) {
  await page.goto('/invoices')
  await waitForHydration(page)
  await page.waitForLoadState('networkidle')
}

async function openCreateModal(page: Page) {
  await page.click('button:has-text("Nouvelle facture")')
  await expect(page.locator('[role="dialog"]')).toBeVisible()
}

async function fillInvoiceForm(
  page: Page,
  opts: {
    reference: string
    client: string
    amount?: number
    currency?: string
    invoiceDate?: string
    dueDate?: string
  },
) {
  await page.fill('#inv-reference', opts.reference)
  await page.fill('#inv-client', opts.client)
  if (opts.amount !== undefined) await page.fill('#inv-amount', String(opts.amount))
  if (opts.currency) await page.selectOption('#inv-currency', opts.currency)
  if (opts.invoiceDate) await page.fill('#inv-date', opts.invoiceDate)
  if (opts.dueDate) await page.fill('#inv-due', opts.dueDate)
}

/** Create an invoice via the UI and wait for the modal to close. */
async function createInvoiceViaUI(
  page: Page,
  ref: string,
  client = 'Test Corp',
  amount = 100,
  invoiceDate = '2026-05-18',
) {
  await openCreateModal(page)
  await fillInvoiceForm(page, { reference: ref, client, amount, invoiceDate })
  await page.locator('[role="dialog"] button:has-text("Créer la facture")').click()
  await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 8_000 })
  await expect(page.locator('text=Facture enregistrée')).toBeVisible()
}

/** Click the AppSelect trigger for a given invoice reference and pick an option. */
async function changeInvoiceStatus(page: Page, reference: string, statusLabel: string) {
  await page
    .locator(`button[aria-label="Changer le statut de la facture ${reference}"]`)
    .click()
  await page.locator(`li[role="option"]:has-text("${statusLabel}")`).click()
}

// ── F39 — Création de facture ─────────────────────────────────────────────────

test.describe('T-016-001 — F39: Création happy path', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)
  })

  test('T-016-001: modal closes, toast shown, invoice appears in list', async ({ page }) => {
    await openCreateModal(page)
    await fillInvoiceForm(page, {
      reference:   'FAC-E2E-T001',   // seed already uses FAC-2026-001; avoid clash
      client:      'ACME Corp',
      amount:      1500,
      currency:    'EUR',
      invoiceDate: '2026-05-18',
    })
    await page.locator('[role="dialog"] button:has-text("Créer la facture")').click()

    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 8_000 })
    await expect(page.locator('text=Facture enregistrée')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-E2E-T001")')).toBeVisible()
  })

  test('T-016-001: new invoice has status badge "En attente"', async ({ page }) => {
    await openCreateModal(page)
    await fillInvoiceForm(page, {
      reference:   'FAC-E2E-T001B',
      client:      'ACME Corp',
      amount:      200,
      invoiceDate: '2026-05-18',
    })
    await page.locator('[role="dialog"] button:has-text("Créer la facture")').click()
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 8_000 })

    const invoiceRow = page.locator('tr', { hasText: 'FAC-E2E-T001B' })
    await expect(invoiceRow.locator('span:has-text("En attente")')).toBeVisible()
  })
})

test.describe('T-016-002 — F39: Référence dupliquée', () => {
  test('T-016-002: modal stays open, inline error, no toast', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)

    // Seed an invoice first
    await createInvoiceViaUI(page, 'FAC-DUP-001')
    await goToInvoices(page)

    // Try to create with the same reference — mock the Supabase error
    await page.route('**/rest/v1/invoices**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            code:    '23505',
            message: 'duplicate key value violates unique constraint "invoices_reference_key"',
            details: null,
            hint:    null,
          }),
        })
      }
      return route.continue()
    })

    await openCreateModal(page)
    await fillInvoiceForm(page, {
      reference:   'FAC-DUP-001',
      client:      'Other Corp',
      amount:      500,
      invoiceDate: '2026-05-18',
    })
    await page.locator('[role="dialog"] button:has-text("Créer la facture")').click()

    // Modal must stay open
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    // Inline error block visible (PostgrestError is not instanceof Error so message is the
    // generic fallback "Erreur lors de la création" — the important thing is the alert shows)
    await expect(page.locator('[role="dialog"] [role="alert"]')).toBeVisible()
    // No success toast
    await expect(page.locator('text=Facture enregistrée')).toHaveCount(0)
  })
})

test.describe('T-016-003 — F39: Validation front — champs requis', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)
    await openCreateModal(page)
  })

  test('T-016-003: empty reference — no API call, modal stays open', async ({ page }) => {
    // The form uses HTML `required` attributes, so browser native validation fires
    // before Vue's validate(). The submit event is never dispatched → no API call.
    let apiCalled = false
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/rest/v1/invoices')) apiCalled = true
    })

    await page.locator('[role="dialog"] button:has-text("Créer la facture")').click()

    // Modal must remain open
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    // No DB call was made
    expect(apiCalled).toBe(false)
  })

  test('T-016-003: amount = 0 — no API call, modal stays open', async ({ page }) => {
    // Browser constraint min="0.01" fires before Vue's validate(); no submit event.
    let apiCalled = false
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/rest/v1/invoices')) apiCalled = true
    })

    await page.fill('#inv-reference', 'FAC-VAL-001')
    await page.fill('#inv-client',    'Test Corp')
    await page.fill('#inv-amount',    '0')
    await page.fill('#inv-date',      '2026-05-18')

    await page.locator('[role="dialog"] button:has-text("Créer la facture")').click()

    await expect(page.locator('[role="dialog"]')).toBeVisible()
    expect(apiCalled).toBe(false)
  })

  test('T-016-003: missing client — no API call, modal stays open', async ({ page }) => {
    let apiCalled = false
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/rest/v1/invoices')) apiCalled = true
    })

    await page.fill('#inv-reference', 'FAC-VAL-002')
    // Deliberately skip client (required field)

    await page.locator('[role="dialog"] button:has-text("Créer la facture")').click()

    await expect(page.locator('[role="dialog"]')).toBeVisible()
    expect(apiCalled).toBe(false)
  })
})

test.describe('T-016-004 — F39: Validation due_date < invoice_date', () => {
  test('T-016-004: due_date before invoice_date triggers inline error, no API call', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)
    await openCreateModal(page)

    let apiCalled = false
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/rest/v1/invoices')) apiCalled = true
    })

    await fillInvoiceForm(page, {
      reference:   'FAC-DATE-001',
      client:      'Test Corp',
      amount:      100,
      invoiceDate: '2026-05-18',
      dueDate:     '2026-05-10',
    })
    await page.locator('[role="dialog"] button:has-text("Créer la facture")').click()

    await expect(page.locator('[role="dialog"] [role="alert"]')).toContainText("date d'échéance")
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    expect(apiCalled).toBe(false)
  })
})

test.describe('T-016-005 — F39: État loading skeleton', () => {
  test('T-016-005: 5 skeleton rows visible while invoices fetch is in flight', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    await page.route('**/rest/v1/invoices**', async (route) => {
      await new Promise((r) => setTimeout(r, 1_200))
      await route.continue()
    })

    await page.goto('/invoices')
    await waitForHydration(page)

    await expect(page.locator('.animate-pulse').first()).toBeVisible({ timeout: 5_000 })
    // Skeletons disappear once fetch completes
    await expect(page.locator('.animate-pulse').first()).not.toBeVisible({ timeout: 8_000 })
  })
})

test.describe('T-016-006 — F39: État erreur avec retry', () => {
  test('T-016-006: AppErrorBanner shown on fetch failure; retry button visible', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    await page.route('**/rest/v1/invoices**', (route) =>
      route.fulfill({
        status:      500,
        contentType: 'application/json',
        body:        JSON.stringify({ code: '500', message: 'Erreur simulée', details: null, hint: null }),
      }),
    )

    await page.goto('/invoices')
    await waitForHydration(page)

    await expect(page.locator('button:has-text("Réessayer")')).toBeVisible({ timeout: 5_000 })
  })

  test('T-016-006: retry button re-triggers fetchInvoices', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    let callCount = 0

    await page.route('**/rest/v1/invoices**', async (route) => {
      callCount++
      if (callCount === 1) {
        return route.fulfill({
          status:      500,
          contentType: 'application/json',
          body:        JSON.stringify({ code: '500', message: 'Erreur', details: null, hint: null }),
        })
      }
      return route.continue()
    })

    await page.goto('/invoices')
    await waitForHydration(page)

    await expect(page.locator('button:has-text("Réessayer")')).toBeVisible({ timeout: 5_000 })
    await page.click('button:has-text("Réessayer")')

    // Wait for the full fetch cycle: loading skeletons appear then disappear
    await page.waitForLoadState('networkidle')
    // Error banner must be gone (fetch succeeded)
    await expect(page.locator('button:has-text("Réessayer")')).not.toBeVisible({ timeout: 5_000 })
    // Route handler was invoked at least twice (initial + retry)
    expect(callCount).toBeGreaterThanOrEqual(2)
  })
})

// ── F40 — Upload et téléchargement PDF ───────────────────────────────────────

test.describe('T-016-010 — F40: Upload PDF happy path', () => {
  test('T-016-010: spinner shown, toast PDF enregistré, button becomes Voir PDF', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)

    // Create a fresh invoice for this test
    await createInvoiceViaUI(page, 'FAC-PDF-010')
    await goToInvoices(page)

    const fileInput = page.locator('input[aria-label="Choisir un PDF pour la facture FAC-PDF-010"]')

    await fileInput.setInputFiles({
      name:     'test.pdf',
      mimeType: 'application/pdf',
      buffer:   MINIMAL_PDF,
    })

    // Spinner + "Envoi…" visible during upload
    await expect(page.locator('text=Envoi…')).toBeVisible({ timeout: 5_000 })
    // Toast after completion
    await expect(page.locator('text=PDF enregistré')).toBeVisible({ timeout: 15_000 })
    // Row now shows "Voir PDF"
    const invoiceRow = page.locator('tr', { hasText: 'FAC-PDF-010' })
    await expect(invoiceRow.locator('button:has-text("Voir PDF")')).toBeVisible()
    await expect(invoiceRow.locator('button:has-text("Remplacer")')).toBeVisible()
  })
})

test.describe('T-016-011 — F40: Voir PDF (signed URL)', () => {
  test('T-016-011: clicking Voir PDF opens a new tab with a signed URL', async ({ page, context }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)

    // Create invoice and upload PDF to set pdf_path
    await createInvoiceViaUI(page, 'FAC-PDF-011')
    await goToInvoices(page)

    const fileInput = page.locator('input[aria-label="Choisir un PDF pour la facture FAC-PDF-011"]')
    await fileInput.setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: MINIMAL_PDF })
    await expect(page.locator('text=PDF enregistré')).toBeVisible({ timeout: 15_000 })
    await goToInvoices(page)

    // Intercept the Storage sign endpoint and return a fake signed URL
    const FAKE_SIGNED_URL = 'http://localhost:54321/storage/v1/object/sign/invoices/fake.pdf?token=test123'
    await page.route('**/storage/v1/object/sign/**', (route) =>
      route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({ signedURL: FAKE_SIGNED_URL }),
      }),
    )

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('tr', { hasText: 'FAC-PDF-011' }).locator('button:has-text("Voir PDF")').click(),
    ])

    await newPage.waitForLoadState()
    // New tab opened — URL contains the faked signed token or is navigating to it
    expect(newPage.url()).toContain('token=test123')
    await newPage.close()
  })

  test('T-016-011: Voir PDF shows error toast when Storage returns error', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)

    // Create invoice and upload a PDF so pdf_path is set
    await createInvoiceViaUI(page, 'FAC-PDF-011B')
    await goToInvoices(page)

    const fileInput = page.locator('input[aria-label="Choisir un PDF pour la facture FAC-PDF-011B"]')
    await fileInput.setInputFiles({ name: 'test.pdf', mimeType: 'application/pdf', buffer: MINIMAL_PDF })
    await expect(page.locator('text=PDF enregistré')).toBeVisible({ timeout: 15_000 })
    await goToInvoices(page)

    // Force Storage sign to fail
    await page.route('**/storage/v1/object/sign/**', (route) =>
      route.fulfill({
        status:      400,
        contentType: 'application/json',
        body:        JSON.stringify({ message: 'Object not found' }),
      }),
    )

    await page.locator('tr', { hasText: 'FAC-PDF-011B' }).locator('button:has-text("Voir PDF")').click()

    await expect(page.locator('text=Impossible de générer le lien PDF')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('T-016-012 — F40: Validation MIME côté client', () => {
  test('T-016-012: non-PDF file rejected with toast, no upload initiated', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)

    await createInvoiceViaUI(page, 'FAC-PDF-012')
    await goToInvoices(page)

    let storageCallMade = false
    page.on('request', (req) => {
      if (req.url().includes('/storage/v1/')) storageCallMade = true
    })

    const fileInput = page.locator('input[aria-label="Choisir un PDF pour la facture FAC-PDF-012"]')
    await fileInput.setInputFiles({
      name:     'document.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer:   Buffer.from('fake docx content'),
    })

    await expect(page.locator('text=Seuls les fichiers PDF sont acceptés')).toBeVisible({ timeout: 3_000 })
    expect(storageCallMade).toBe(false)
  })
})

test.describe('T-016-013 — F40: Remplacement d\'un PDF existant', () => {
  test('T-016-013: uploading a second PDF replaces the first and shows toast', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)

    await createInvoiceViaUI(page, 'FAC-PDF-013')
    await goToInvoices(page)

    const fileInput = page.locator('input[aria-label="Choisir un PDF pour la facture FAC-PDF-013"]')

    // Upload first PDF
    await fileInput.setInputFiles({ name: 'first.pdf', mimeType: 'application/pdf', buffer: MINIMAL_PDF })
    await expect(page.locator('text=PDF enregistré')).toBeVisible({ timeout: 15_000 })
    await goToInvoices(page)

    // "Remplacer" is now shown — upload second PDF
    const row = page.locator('tr', { hasText: 'FAC-PDF-013' })
    await expect(row.locator('button:has-text("Remplacer")')).toBeVisible()

    const fileInputReplace = page.locator('input[aria-label="Choisir un PDF pour la facture FAC-PDF-013"]')
    await fileInputReplace.setInputFiles({ name: 'second.pdf', mimeType: 'application/pdf', buffer: MINIMAL_PDF })

    await expect(page.locator('text=PDF enregistré')).toBeVisible({ timeout: 15_000 })
    // Still shows "Voir PDF" after replacement
    await expect(row.locator('button:has-text("Voir PDF")')).toBeVisible()
  })
})

test.describe('T-016-014 — F40: Upload fichier trop volumineux', () => {
  test('T-016-014: Storage error shown as toast, spinner disappears', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)

    await createInvoiceViaUI(page, 'FAC-PDF-014')
    await goToInvoices(page)

    // Mock Storage to return a size-limit error
    await page.route('**/storage/v1/object/**', (route) => {
      if (route.request().method() === 'POST' || route.request().method() === 'PUT') {
        return route.fulfill({
          status:      413,
          contentType: 'application/json',
          body:        JSON.stringify({ message: 'Payload too large' }),
        })
      }
      return route.continue()
    })

    const fileInput = page.locator('input[aria-label="Choisir un PDF pour la facture FAC-PDF-014"]')
    await fileInput.setInputFiles({ name: 'large.pdf', mimeType: 'application/pdf', buffer: MINIMAL_PDF })

    // Spinner disappears once uploadingId is reset
    await expect(page.locator('text=Envoi…')).not.toBeVisible({ timeout: 10_000 })
    // Error toast (AppToast with type="error" sets aria-live="assertive")
    await expect(page.locator('[role="alert"][aria-live="assertive"]')).toBeVisible({ timeout: 5_000 })
  })
})

// ── F41 — Statut + filtre ─────────────────────────────────────────────────────

test.describe('T-016-020 — F41: Changement de statut happy path', () => {
  test('T-016-020: badge updates to Envoyée, toast shown, persists after reload', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)

    await createInvoiceViaUI(page, 'FAC-STS-020')
    await goToInvoices(page)

    const row = page.locator('tr', { hasText: 'FAC-STS-020' })
    await expect(row.locator('span:has-text("En attente")')).toBeVisible()

    await changeInvoiceStatus(page, 'FAC-STS-020', 'Envoyée')

    await expect(page.locator('text=Statut mis à jour')).toBeVisible({ timeout: 5_000 })
    await expect(row.locator('span:has-text("Envoyée")')).toBeVisible()

    // Reload — status persisted
    await goToInvoices(page)
    const rowAfterReload = page.locator('tr', { hasText: 'FAC-STS-020' })
    await expect(rowAfterReload.locator('span:has-text("Envoyée")')).toBeVisible()
  })
})

test.describe('T-016-021 — F41: Rollback statut sur erreur réseau', () => {
  test('T-016-021: badge stays at En attente when PATCH fails', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)

    await createInvoiceViaUI(page, 'FAC-STS-021')
    await goToInvoices(page)

    const row = page.locator('tr', { hasText: 'FAC-STS-021' })
    await expect(row.locator('span:has-text("En attente")')).toBeVisible()

    // Block only PATCH calls to invoices — SELECT for fetchInvoices already ran
    await page.route('**/rest/v1/invoices**', (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({
          status:      500,
          contentType: 'application/json',
          body:        JSON.stringify({ code: '500', message: 'Réseau indisponible', details: null, hint: null }),
        })
      }
      return route.continue()
    })

    await changeInvoiceStatus(page, 'FAC-STS-021', 'Envoyée')

    // Error toast must appear (AppToast error variant has aria-live="assertive")
    await expect(page.locator('[role="alert"][aria-live="assertive"]')).toBeVisible({ timeout: 5_000 })

    // Badge must stay at En attente — scope to trigger button to avoid strict mode violation:
    // AppSelect dropdown stays open after the error, so the listbox option span "En attente"
    // is also a child of the tr. Scoping to button[aria-haspopup="listbox"] excludes it.
    const statusTrigger = row.locator('button[aria-haspopup="listbox"]')
    await expect(statusTrigger).toContainText('En attente')
    await expect(statusTrigger).not.toContainText('Envoyée')
  })
})

test.describe('T-016-022 — F41: Filtre par statut (client-side, zéro requête)', () => {
  test('T-016-022: filter changes do not trigger new network requests', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)

    // Seed invoices with different statuses via UI
    await createInvoiceViaUI(page, 'FAC-FLT-A')
    await goToInvoices(page)
    await changeInvoiceStatus(page, 'FAC-FLT-A', 'Envoyée')
    await expect(page.locator('text=Statut mis à jour')).toBeVisible()

    await createInvoiceViaUI(page, 'FAC-FLT-B')
    await goToInvoices(page)
    await changeInvoiceStatus(page, 'FAC-FLT-B', 'Payée')
    await expect(page.locator('text=Statut mis à jour')).toBeVisible()

    await createInvoiceViaUI(page, 'FAC-FLT-C')
    await goToInvoices(page)

    // All 3 visible under "Toutes"
    await expect(page.locator('td:has-text("FAC-FLT-A")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-FLT-B")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-FLT-C")')).toBeVisible()

    // Count requests during filter interactions
    let requestCount = 0
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/invoices')) requestCount++
    })

    // Filter: En attente
    await page.click('button:has-text("En attente")')
    await expect(page.locator('td:has-text("FAC-FLT-C")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-FLT-A")')).toHaveCount(0)
    await expect(page.locator('td:has-text("FAC-FLT-B")')).toHaveCount(0)

    // Filter: Envoyée
    await page.click('button:has-text("Envoyée")')
    await expect(page.locator('td:has-text("FAC-FLT-A")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-FLT-B")')).toHaveCount(0)
    await expect(page.locator('td:has-text("FAC-FLT-C")')).toHaveCount(0)

    // Filter: Payée
    await page.click('button:has-text("Payée")')
    await expect(page.locator('td:has-text("FAC-FLT-B")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-FLT-A")')).toHaveCount(0)
    await expect(page.locator('td:has-text("FAC-FLT-C")')).toHaveCount(0)

    // Filter: Toutes
    await page.click('button:has-text("Toutes")')
    await expect(page.locator('td:has-text("FAC-FLT-A")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-FLT-B")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-FLT-C")')).toBeVisible()

    // Zero supabase calls during all filter interactions
    expect(requestCount).toBe(0)
  })
})

// ── UI State Coverage ─────────────────────────────────────────────────────────

test.describe('UI States — Empty state (global)', () => {
  test('shows AppEmptyState when invoices table returns empty array', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    await page.route('**/rest/v1/invoices**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )

    await page.goto('/invoices')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=Aucune facture pour le moment')).toBeVisible()
    // Two "Nouvelle facture" buttons exist (header + empty state CTA) — both are valid
    await expect(page.locator('button:has-text("Nouvelle facture")').first()).toBeVisible()
  })
})

test.describe('UI States — Empty state (filtered)', () => {
  test('shows filtered empty state when filter matches 0 invoices', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    // Return exactly one en_attente invoice so global state is not empty
    await page.route('**/rest/v1/invoices**', (route) =>
      route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify([
          {
            id: 'mock-id', reference: 'FAC-MOCK', client: 'Mock Corp',
            amount: 100, currency: 'EUR', invoice_date: '2026-05-18',
            due_date: null, notes: null, status: 'en_attente',
            pdf_path: null, created_by: 'admin-uuid', created_at: '2026-05-18T00:00:00Z',
          },
        ]),
      }),
    )

    await page.goto('/invoices')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')

    // Filter to "Payée" which has 0 matches
    await page.click('button:has-text("Payée")')

    await expect(page.locator('text=Aucune facture trouvée')).toBeVisible()
    await expect(page.locator('text=Essayez un autre statut.')).toBeVisible()
  })
})

// ── Security ──────────────────────────────────────────────────────────────────

test.describe('S-016-001 — Sécurité: Route protection employee', () => {
  test('S-016-001: employee accessing /invoices gets 403 page', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await page.goto('/invoices')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')

    // Nuxt renders a 403 error page — invoice content must NOT be visible
    await expect(page.locator('h1:has-text("Factures"), button:has-text("Nouvelle facture")')).toHaveCount(0)
    // 403 content visible
    await expect(page.locator('body')).toContainText('403')
  })
})

test.describe('S-016-002 — Sécurité: Route protection manager', () => {
  test('S-016-002: manager accessing /invoices gets 403 page', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.manager)
    await page.goto('/invoices')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1:has-text("Factures"), button:has-text("Nouvelle facture")')).toHaveCount(0)
    await expect(page.locator('body')).toContainText('403')
  })
})

test.describe('S-016-007 — Sécurité: XSS dans le formulaire facture', () => {
  test('S-016-007: XSS payloads in reference/client rendered as escaped text', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)
    await openCreateModal(page)

    const xssRef    = '<script>window.__xss016=1</script>'
    const xssClient = '<img src=x onerror="window.__xss016=2">'

    await page.fill('#inv-reference', xssRef)
    await page.fill('#inv-client',    xssClient)
    await page.fill('#inv-amount',    '100')
    await page.fill('#inv-date',      '2026-05-18')

    // Check that the script didn't fire while typing
    const injectedWhileTyping = await page.evaluate(() => (window as Record<string, unknown>).__xss016)
    expect(injectedWhileTyping).toBeUndefined()

    await page.locator('[role="dialog"] button:has-text("Créer la facture")').click()

    // After potential submission (may fail due to special chars or succeed)
    // Either way, __xss016 must remain undefined
    const injectedAfterSubmit = await page.evaluate(() => (window as Record<string, unknown>).__xss016)
    expect(injectedAfterSubmit).toBeUndefined()
  })
})

test.describe('S-016-005 — Sécurité: Pas d\'accès PDF public', () => {
  test('S-016-005: bucket is private — public URL returns error (no auth)', async ({ page }) => {
    await clearSession(page)
    // Request a known public path without any auth session
    const response = await page.request.get(
      'http://localhost:54321/storage/v1/object/public/invoices/nonexistent.pdf',
    )
    // Supabase private bucket: returns 400 or 404 — never 200
    expect([400, 404, 403, 401]).toContain(response.status())
  })
})

// ── Modal UI behaviour ────────────────────────────────────────────────────────

test.describe('Modal — Cancel and close behaviour', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToInvoices(page)
    await openCreateModal(page)
  })

  test('Annuler closes modal without API call', async ({ page }) => {
    await page.fill('#inv-reference', 'FAC-CANCEL')

    let apiCalled = false
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('invoices')) apiCalled = true
    })

    await page.locator('[role="dialog"] button:has-text("Annuler")').click()
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    expect(apiCalled).toBe(false)
  })

  test('Escape key closes modal', async ({ page }) => {
    await page.keyboard.press('Escape')
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })

  test('Clicking backdrop closes modal', async ({ page }) => {
    await page.mouse.click(10, 10)
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })
})

// ── T-016S — Recherche par référence (nice-to-have) ──────────────────────────
//
// All tests in this block mock the Supabase SELECT so they run without
// live DB state. Three fixtures are used:
//   s1: INV-2025-001 (en_attente)
//   s2: INV-2025-002 (envoyee)
//   s3: FAC-001      (en_attente)

const SEARCH_FIXTURES = [
  {
    id: 'mock-s1', reference: 'INV-2025-001', client: 'Alpha Corp',
    amount: 1000, currency: 'EUR', invoice_date: '2026-05-01',
    due_date: null, notes: null, status: 'en_attente',
    pdf_path: null, created_by: 'admin-uuid', created_at: '2026-05-01T00:00:00Z',
  },
  {
    id: 'mock-s2', reference: 'INV-2025-002', client: 'Beta Corp',
    amount: 2000, currency: 'EUR', invoice_date: '2026-05-02',
    due_date: null, notes: null, status: 'envoyee',
    pdf_path: null, created_by: 'admin-uuid', created_at: '2026-05-02T00:00:00Z',
  },
  {
    id: 'mock-s3', reference: 'FAC-001', client: 'Gamma Corp',
    amount: 500, currency: 'EUR', invoice_date: '2026-05-03',
    due_date: null, notes: null, status: 'en_attente',
    pdf_path: null, created_by: 'admin-uuid', created_at: '2026-05-03T00:00:00Z',
  },
]

async function loadInvoicesWithFixtures(page: Page) {
  await page.route('**/rest/v1/invoices**', (route) =>
    route.fulfill({
      status:      200,
      contentType: 'application/json',
      body:        JSON.stringify(SEARCH_FIXTURES),
    }),
  )
  await page.goto('/invoices')
  await waitForHydration(page)
  await page.waitForLoadState('networkidle')
}

test.describe('T-016S-001 — Hint text appears with 1–2 characters', () => {
  test('T-016S-001: hint visible for 1 char, hidden at 0 and 3', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    const hint = page.locator('text=Saisissez au moins 3 caractères')

    // 0 chars — hint not visible
    await expect(hint).not.toBeVisible()

    // 1 char — hint appears
    await page.fill('#invoice-search', 'I')
    await expect(hint).toBeVisible()

    // 2 chars — hint still visible
    await page.fill('#invoice-search', 'IN')
    await expect(hint).toBeVisible()

    // 3 chars — hint disappears
    await page.fill('#invoice-search', 'INV')
    await expect(hint).not.toBeVisible()
  })

  test('T-016S-001: list is not filtered while hint is visible (< 3 chars)', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    await page.fill('#invoice-search', 'IN')

    await expect(page.locator('td:has-text("INV-2025-001")')).toBeVisible()
    await expect(page.locator('td:has-text("INV-2025-002")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-001")')).toBeVisible()
  })
})

test.describe('T-016S-002 — Search activates at 3 characters', () => {
  test('T-016S-002: at 3 chars only matching refs visible, no network call', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    let searchRequestCount = 0
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/invoices')) searchRequestCount++
    })

    await page.fill('#invoice-search', 'INV')

    await expect(page.locator('td:has-text("INV-2025-001")')).toBeVisible()
    await expect(page.locator('td:has-text("INV-2025-002")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-001")')).toHaveCount(0)
    expect(searchRequestCount).toBe(0)
  })
})

test.describe('T-016S-003 — Case-insensitive matching', () => {
  test('T-016S-003: lowercase query matches uppercase references', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    await page.fill('#invoice-search', 'inv')

    await expect(page.locator('td:has-text("INV-2025-001")')).toBeVisible()
    await expect(page.locator('td:has-text("INV-2025-002")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-001")')).toHaveCount(0)
  })

  test('T-016S-003: uppercase query and lowercase query return identical results', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    await page.fill('#invoice-search', 'fac')
    await expect(page.locator('td:has-text("FAC-001")')).toBeVisible()
    await expect(page.locator('td:has-text("INV-2025-001")')).toHaveCount(0)

    await page.fill('#invoice-search', 'FAC')
    await expect(page.locator('td:has-text("FAC-001")')).toBeVisible()
    await expect(page.locator('td:has-text("INV-2025-001")')).toHaveCount(0)
  })
})

test.describe('T-016S-004 — Substring matching', () => {
  test('T-016S-004: query matching middle of reference returns correct rows', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    await page.fill('#invoice-search', '2025')

    await expect(page.locator('td:has-text("INV-2025-001")')).toBeVisible()
    await expect(page.locator('td:has-text("INV-2025-002")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-001")')).toHaveCount(0)
  })
})

test.describe('T-016S-005 — Search + status filter combined (AND logic)', () => {
  test('T-016S-005: search within active status filter — only overlap shown', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    // Activate "Envoyée" filter — only INV-2025-002 qualifies
    await page.click('button:has-text("Envoyée")')
    await expect(page.locator('td:has-text("INV-2025-002")')).toBeVisible()
    await expect(page.locator('td:has-text("INV-2025-001")')).toHaveCount(0)

    // Type "INV" — INV-2025-002 is still visible (matches both filter and search)
    await page.fill('#invoice-search', 'INV')
    await expect(page.locator('td:has-text("INV-2025-002")')).toBeVisible()
    await expect(page.locator('td:has-text("INV-2025-001")')).toHaveCount(0)
  })

  test('T-016S-005: filter hides a row that search would otherwise match', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    // INV-2025-001 is en_attente; activate "Envoyée" filter — it disappears
    // Search "INV" would match it, but filter takes precedence
    await page.click('button:has-text("Envoyée")')
    await page.fill('#invoice-search', 'INV')

    await expect(page.locator('td:has-text("INV-2025-001")')).toHaveCount(0)
  })
})

test.describe('T-016S-006 — Empty state: search only', () => {
  test('T-016S-006: no match → correct description, no table rows', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    await page.fill('#invoice-search', 'XYZ')

    await expect(page.locator('text=Aucune facture trouvée')).toBeVisible()
    await expect(page.locator('text=Aucune référence ne correspond à « XYZ ».')).toBeVisible()
    await expect(page.locator('table')).toHaveCount(0)
  })
})

test.describe('T-016S-007 — Empty state: search + active status filter', () => {
  test('T-016S-007: combined empty state message mentions the status constraint', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    await page.click('button:has-text("Envoyée")')
    await page.fill('#invoice-search', 'XYZ')

    await expect(page.locator('text=Aucune facture trouvée')).toBeVisible()
    await expect(page.locator('text=Aucune facture « XYZ » avec ce statut.')).toBeVisible()
  })

  test('T-016S-007: switching filter back to "Toutes" reverts to search-only message', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    await page.click('button:has-text("Envoyée")')
    await page.fill('#invoice-search', 'XYZ')
    await expect(page.locator('text=Aucune facture « XYZ » avec ce statut.')).toBeVisible()

    // Switch back to Toutes
    await page.click('button:has-text("Toutes")')
    await expect(page.locator('text=Aucune référence ne correspond à « XYZ ».')).toBeVisible()
    await expect(page.locator('text=Aucune facture « XYZ » avec ce statut.')).not.toBeVisible()
  })
})

test.describe('T-016S-008 — Clearing search restores full list', () => {
  test('T-016S-008: clearing input shows all invoices without a network request', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    await page.fill('#invoice-search', 'INV')
    await expect(page.locator('td:has-text("FAC-001")')).toHaveCount(0)

    let requestCount = 0
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/invoices')) requestCount++
    })

    await page.fill('#invoice-search', '')

    await expect(page.locator('td:has-text("INV-2025-001")')).toBeVisible()
    await expect(page.locator('td:has-text("INV-2025-002")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-001")')).toBeVisible()
    expect(requestCount).toBe(0)
  })
})

test.describe('T-016S-009 — Whitespace trimming', () => {
  test('T-016S-009: query with surrounding spaces trims before matching', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    // "  INV  " trims to "INV" (3 chars) — search should activate
    await page.fill('#invoice-search', '  INV  ')

    await expect(page.locator('td:has-text("INV-2025-001")')).toBeVisible()
    await expect(page.locator('td:has-text("INV-2025-002")')).toBeVisible()
    await expect(page.locator('td:has-text("FAC-001")')).toHaveCount(0)
  })
})

test.describe('S-016S-001 — Sécurité: XSS dans le champ de recherche', () => {
  test('S-016S-001: script and img payloads do not execute when typed in search', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    await page.fill('#invoice-search', '<script>window.__xssSearch=1</script>')

    const injected = await page.evaluate(() => (window as Record<string, unknown>).__xssSearch)
    expect(injected).toBeUndefined()

    await page.fill('#invoice-search', '<img src=x onerror="window.__xssSearch=2">')

    const injectedImg = await page.evaluate(() => (window as Record<string, unknown>).__xssSearch)
    expect(injectedImg).toBeUndefined()
  })

  test('S-016S-001: XSS payload in empty-state message is escaped text, not HTML', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await loadInvoicesWithFixtures(page)

    const payload = '<img src=x onerror="window.__xssMsg=1">'
    await page.fill('#invoice-search', payload)

    // The empty state description renders the trimmed query via Vue interpolation ({{ }}).
    // Verify the raw tag characters are escaped in the DOM.
    const innerHTML = await page.locator('text=Aucune référence').evaluate(el => el.innerHTML)
    expect(innerHTML).not.toContain('<img')
    expect(innerHTML).toContain('&lt;img')

    const injected = await page.evaluate(() => (window as Record<string, unknown>).__xssMsg)
    expect(injected).toBeUndefined()
  })
})

// ── Nav link visibility ───────────────────────────────────────────────────────

test.describe('Nav link — Factures visible for admin only', () => {
  test('admin sidebar shows "Factures" link', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await expect(page.locator('nav a:has-text("Factures"), a:has-text("Factures")')).toBeVisible()
  })

  test('manager sidebar does NOT show "Factures" link', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.manager)
    await expect(page.locator('a:has-text("Factures")')).toHaveCount(0)
  })

  test('employee sidebar does NOT show "Factures" link', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await expect(page.locator('a:has-text("Factures")')).toHaveCount(0)
  })
})
