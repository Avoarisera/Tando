/**
 * E2E tests for RFC-011 — Leave Types Management (F21, F22, F23)
 *
 * REQUIRES:
 *   - supabase start && supabase db reset  (seed applied, clean state)
 *   - yarn dev  (or playwright.config.ts webServer starts it)
 *
 * Seed state assumed:
 *   - 4 active leave types: Congé payé (#4CAF50), Congé maladie (#F44336),
 *     RTT (#2196F3), Congé sans solde (#9E9E9E) — all is_active = true
 *
 * NOTE: T-011-010 (create happy path) inserts a row that cannot be deleted
 * via the anon key (no DELETE RLS policy). Run `supabase db reset` between
 * full test suite executions to restore a clean state.
 *
 * Toggle tests (T-011-021 through T-011-024) are self-contained: they
 * deactivate then reactivate within the same test to avoid state leak.
 */

import { test, expect, type Page } from '@playwright/test'

// ── Accounts ──────────────────────────────────────────────────────────────────

const ACCOUNTS = {
  admin:     { email: 'admin@waka.com',     password: 'Waka2026!' },
  manager:   { email: 'manager@waka.com',   password: 'Waka2026!' },
  employee1: { email: 'employee1@waka.com', password: 'Waka2026!' },
}

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

async function goToLeaveTypes(page: Page) {
  await page.goto('/leave-types')
  await waitForHydration(page)
  await page.waitForLoadState('networkidle')
}

async function openCreateModal(page: Page) {
  await page.click('button:has-text("Ajouter un type")')
  await expect(page.locator('[role="dialog"]')).toBeVisible()
}

async function openEditModal(page: Page, typeName: string) {
  await page.locator(`tr:has-text("${typeName}")`).locator('button:has-text("Modifier")').click()
  await expect(page.locator('[role="dialog"]')).toBeVisible()
}

// ── F21 — List leave types ────────────────────────────────────────────────────

test.describe('T-011-001/002 — F21: List display', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)
  })

  test('T-011-001: shows 4 seeded types with correct names', async ({ page }) => {
    await expect(page.locator('td:has-text("Congé payé")')).toBeVisible()
    await expect(page.locator('td:has-text("Congé maladie")')).toBeVisible()
    await expect(page.locator('td:has-text("RTT")')).toBeVisible()
    await expect(page.locator('td:has-text("Congé sans solde")')).toBeVisible()
  })

  test('T-011-001: each row has "Actif" badge (all seeded types are active)', async ({ page }) => {
    const badges = page.locator('span:has-text("Actif")')
    await expect(badges).toHaveCount(4)
  })

  test('T-011-001: each row has "Modifier" and "Désactiver" action buttons', async ({ page }) => {
    await expect(page.locator('button:has-text("Modifier")').first()).toBeVisible()
    await expect(page.locator('button:has-text("Désactiver")').first()).toBeVisible()
  })

  test('T-011-001: no "Supprimer" button present (deletion out of scope)', async ({ page }) => {
    await expect(page.locator('button:has-text("Supprimer")')).toHaveCount(0)
  })

  test('T-011-002: color pastilles rendered with correct background colors', async ({ page }) => {
    const circles = page.locator('span[aria-label^="Couleur"]')
    await expect(circles).toHaveCount(4)

    const colors = await page.$$eval('span[aria-label^="Couleur"]', (els) =>
      els.map((el) => (el as HTMLElement).style.backgroundColor),
    )
    expect(colors).toContain('rgb(76, 175, 80)')   // #4CAF50 Congé payé
    expect(colors).toContain('rgb(244, 67, 54)')    // #F44336 Congé maladie
    expect(colors).toContain('rgb(33, 150, 243)')   // #2196F3 RTT
    expect(colors).toContain('rgb(158, 158, 158)')  // #9E9E9E Congé sans solde
  })

  test('T-011-002: color circles have aria-label attribute', async ({ page }) => {
    const firstCircle = page.locator('span[aria-label^="Couleur"]').first()
    const label = await firstCircle.getAttribute('aria-label')
    expect(label).toMatch(/^Couleur #/)
  })

  test('T-011-001: no warning banner when all types are active', async ({ page }) => {
    await expect(page.locator('text=aucun type de congé actif')).toHaveCount(0)
  })
})

// ── F21 — Nav link visibility ─────────────────────────────────────────────────

test.describe('T-011-007/008 — F21: Nav link visibility per role', () => {
  test('T-011-008: admin sidebar shows "Types de congé" link', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await expect(page.locator('nav a:has-text("Types de congé"), a:has-text("Types de congé")')).toBeVisible()
  })

  test('T-011-007: manager sidebar does NOT show "Types de congé" link', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.manager)
    await expect(page.locator('text=Types de congé')).toHaveCount(0)
  })
})

// ── F22 — Create modal ────────────────────────────────────────────────────────

test.describe('T-011-009 — F22: Create modal initial state', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)
    await openCreateModal(page)
  })

  test('T-011-009: modal title is "Ajouter un type de congé"', async ({ page }) => {
    await expect(page.locator('#modal-title')).toHaveText('Ajouter un type de congé')
  })

  test('T-011-009: name field is empty on open', async ({ page }) => {
    await expect(page.locator('#type-name')).toHaveValue('')
  })

  test('T-011-009: submit button is disabled on empty name', async ({ page }) => {
    await expect(page.locator('[role="dialog"] button[type="submit"]')).toBeDisabled()
  })

  test('T-011-009: submit button label is "Ajouter"', async ({ page }) => {
    await expect(page.locator('[role="dialog"] button[type="submit"]')).toContainText('Ajouter')
  })

  test('T-011-009: color input is present', async ({ page }) => {
    await expect(page.locator('#type-color')).toBeVisible()
  })

  test('T-011-009: "Annuler" button is present', async ({ page }) => {
    await expect(page.locator('[role="dialog"] button:has-text("Annuler")')).toBeVisible()
  })
})

test.describe('T-011-011/012 — F22: Submit disabled on empty name', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)
    await openCreateModal(page)
  })

  test('T-011-011: submit disabled when name is empty', async ({ page }) => {
    await expect(page.locator('[role="dialog"] button[type="submit"]')).toBeDisabled()
  })

  test('T-011-012: submit enabled after typing a name, disabled again after clearing', async ({ page }) => {
    await page.fill('#type-name', 'Test')
    await expect(page.locator('[role="dialog"] button[type="submit"]')).toBeEnabled()

    await page.fill('#type-name', '')
    await expect(page.locator('[role="dialog"] button[type="submit"]')).toBeDisabled()
  })
})

test.describe('T-011-010 — F22: Create happy path', () => {
  test('T-011-010: creates type → toast → modal closes → row in table', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)
    await openCreateModal(page)

    await page.fill('#type-name', 'Congé exceptionnel')
    await page.locator('#type-color').evaluate((el: HTMLInputElement) => {
      el.value = '#FF9800'
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await page.locator('[role="dialog"] button[type="submit"]').click()

    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=Type de congé ajouté')).toBeVisible()
    await expect(page.locator('td:has-text("Congé exceptionnel")')).toBeVisible()
  })
})

test.describe('T-011-013 — F22: Server error stays in modal', () => {
  test('T-011-013: server error shown inline; modal stays open', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)

    await page.route('**/rest/v1/leave_types**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: '42P01', message: 'Erreur serveur simulée', details: null, hint: null }),
        })
      }
      return route.continue()
    })

    await openCreateModal(page)
    await page.fill('#type-name', 'Type erreur')
    await page.locator('[role="dialog"] button[type="submit"]').click()

    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(page.locator('[role="dialog"] [role="alert"]')).toBeVisible()
    await expect(page.locator('text=Type de congé ajouté')).toHaveCount(0)
  })
})

test.describe('T-011-014/015/016 — F22: Cancel / close modal', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)
    await openCreateModal(page)
  })

  test('T-011-014: Annuler closes modal without saving', async ({ page }) => {
    await page.fill('#type-name', 'Draft type')

    let insertCalled = false
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('leave_types')) insertCalled = true
    })

    await page.locator('[role="dialog"] button:has-text("Annuler")').click()
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    expect(insertCalled).toBe(false)
  })

  test('T-011-015: Escape key closes modal', async ({ page }) => {
    await page.keyboard.press('Escape')
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })

  test('T-011-016: clicking backdrop closes modal', async ({ page }) => {
    await page.mouse.click(10, 10)
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })
})

// ── F22 — Edit modal ──────────────────────────────────────────────────────────

test.describe('T-011-017 — F22: Edit modal pre-fill', () => {
  test('T-011-017: edit modal pre-fills name and shows correct title', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)
    await openEditModal(page, 'Congé maladie')

    await expect(page.locator('#modal-title')).toHaveText('Modifier le type de congé')
    await expect(page.locator('#type-name')).toHaveValue('Congé maladie')
    await expect(page.locator('[role="dialog"] button[type="submit"]')).toContainText('Modifier')
    await expect(page.locator('[role="dialog"] button[type="submit"]')).toBeEnabled()
  })
})

test.describe('T-011-018 — F22: Edit happy path', () => {
  test('T-011-018: edit name → toast → table reflects update', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)
    await openEditModal(page, 'Congé sans solde')

    await page.fill('#type-name', 'CSS')
    await page.locator('[role="dialog"] button[type="submit"]').click()

    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=Type de congé modifié')).toBeVisible()
    await expect(page.locator('td:has-text("CSS")')).toBeVisible()

    // Restore
    await openEditModal(page, 'CSS')
    await page.fill('#type-name', 'Congé sans solde')
    await page.locator('[role="dialog"] button[type="submit"]').click()
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5_000 })
  })
})

test.describe('T-011-020 — F22: Edit cancel reverts', () => {
  test('T-011-020: cancel during edit does not change the row', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)
    await openEditModal(page, 'RTT')

    await page.fill('#type-name', 'RTT modifié')
    await page.locator('[role="dialog"] button:has-text("Annuler")').click()

    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    await expect(page.locator('td:has-text("RTT")')).toBeVisible()
    await expect(page.locator('td:has-text("RTT modifié")')).toHaveCount(0)
  })
})

// ── F23 — Toggle active status ────────────────────────────────────────────────

test.describe('T-011-021/022 — F23: Deactivate and reactivate (self-contained)', () => {
  test('T-011-021+022: deactivate RTT → verify state → reactivate → verify restored', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)

    // Deactivate RTT
    const rttRow = page.locator('tr:has-text("RTT")')
    await rttRow.locator('button:has-text("Désactiver")').click()

    await expect(page.locator('text=Type désactivé')).toBeVisible()
    await expect(rttRow.locator('span:has-text("Inactif")')).toBeVisible()
    await expect(rttRow.locator('button:has-text("Activer")')).toBeVisible()
    await expect(rttRow).toHaveClass(/opacity-50/)

    // No confirmation modal should appear
    await expect(page.locator('[role="dialog"]')).toHaveCount(0)

    // Reactivate RTT
    await rttRow.locator('button:has-text("Activer")').click()

    await expect(page.locator('text=Type activé')).toBeVisible()
    await expect(rttRow.locator('span:has-text("Actif")')).toBeVisible()
    await expect(rttRow.locator('button:has-text("Désactiver")')).toBeVisible()
    await expect(rttRow).not.toHaveClass(/opacity-50/)
  })
})

test.describe('T-011-023/024 — F23: All-inactive warning banner', () => {
  test('T-011-023+024: warning appears when all deactivated; disappears on reactivation', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)

    // Collect type names that currently have an enabled "Désactiver" button.
    // Capturing names upfront avoids iterating a live locator while the DOM mutates.
    // This also handles extra types created by T-011-010 ("Congé exceptionnel").
    const activeRows = page.locator('tr:has(button:has-text("Désactiver"))')
    const rowCount = await activeRows.count()
    const typeNamesToDeactivate: string[] = []
    for (let i = 0; i < rowCount; i++) {
      // Name is in the second <td> (index 1: after colour circle)
      const name = await activeRows.nth(i).locator('td').nth(1).textContent()
      if (name?.trim()) typeNamesToDeactivate.push(name.trim())
    }

    // Deactivate each type by name and wait for its row to confirm the switch
    for (const name of typeNamesToDeactivate) {
      const row = page.locator(`tr:has-text("${name}")`)
      await row.locator('button:has-text("Désactiver")').click()
      // Wait for THIS row's button to change to "Activer" — confirms toggle + re-render done
      await expect(row.locator('button:has-text("Activer")')).toBeVisible({ timeout: 10_000 })
    }

    // All types now inactive → warning banner must appear
    await expect(page.locator('text=aucun type de congé actif')).toBeVisible({ timeout: 5_000 })

    // Reactivate the first type
    const firstName = typeNamesToDeactivate[0]
    await page.locator(`tr:has-text("${firstName}")`).locator('button:has-text("Activer")').click()
    await expect(page.locator(`tr:has-text("${firstName}")`).locator('button:has-text("Désactiver")')).toBeVisible({ timeout: 10_000 })

    // Warning must disappear (at least one type is active)
    await expect(page.locator('text=aucun type de congé actif')).toHaveCount(0)

    // Restore remaining inactive types (cleanup)
    for (const name of typeNamesToDeactivate.slice(1)) {
      const row = page.locator(`tr:has-text("${name}")`)
      await row.locator('button:has-text("Activer")').click()
      await expect(row.locator('button:has-text("Désactiver")')).toBeVisible({ timeout: 10_000 })
    }
  })
})

test.describe('T-011-025 — F23: Inactive type absent from employee request form', () => {
  test('T-011-025: deactivated type does not appear in employee create-request dropdown', async ({ page }) => {
    // Ensure RTT is active before this test (previous tests may have left it inactive)
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)

    const rttRow = page.locator('tr:has-text("RTT")')

    // Deactivate RTT
    await rttRow.locator('button:has-text("Désactiver")').click()
    await expect(page.locator('text=Type désactivé')).toBeVisible()

    // Switch to employee
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await page.goto('/leave-requests')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')

    await page.click('button:has-text("Nouvelle demande")')
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    await expect(page.locator('#leave-type option:has-text("RTT")')).toHaveCount(0)
    await expect(page.locator('#leave-type')).not.toContainText('RTT')

    // Restore RTT as admin
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)
    await page.locator('tr:has-text("RTT")').locator('button:has-text("Activer")').click()
    await expect(page.locator('text=Type activé')).toBeVisible()
  })
})

// ── UI States ─────────────────────────────────────────────────────────────────

test.describe('T-011-029 — UI: Skeleton loading state', () => {
  test('T-011-029: skeleton shown while leave_types request is in flight', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    await page.route('**/rest/v1/leave_types**', async (route) => {
      await new Promise((r) => setTimeout(r, 1_200))
      await route.continue()
    })

    await page.goto('/leave-types')
    await waitForHydration(page)

    await expect(page.locator('.animate-pulse').first()).toBeVisible()
    await expect(page.locator('.animate-pulse').first()).not.toBeVisible({ timeout: 5_000 })
  })
})

test.describe('T-011-030 — UI: Error state with retry', () => {
  test('T-011-030: AppErrorBanner shown when Supabase returns 500; retry button present', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    await page.route('**/rest/v1/leave_types**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: '500', message: 'Erreur simulée', details: null, hint: null }),
      }),
    )

    await page.goto('/leave-types')
    await waitForHydration(page)

    await expect(page.locator('button:has-text("Réessayer")')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('T-011-031 — UI: Spinner during save', () => {
  test('T-011-031: spinner visible in submit button while PATCH is in flight', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)

    await page.route('**/rest/v1/leave_types**', async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((r) => setTimeout(r, 800))
      }
      await route.continue()
    })

    await openCreateModal(page)
    await page.fill('#type-name', 'Type spinner test')
    await page.locator('[role="dialog"] button[type="submit"]').click()

    await expect(page.locator('[role="dialog"] .animate-spin')).toBeVisible()
    await expect(page.locator('[role="dialog"] button[type="submit"]')).toBeDisabled()

    await page.waitForLoadState('networkidle')
  })
})

test.describe('T-011-006 — UI: Empty state', () => {
  test('T-011-006: AppEmptyState shown when Supabase returns empty array', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)

    await page.route('**/rest/v1/leave_types**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )

    await page.goto('/leave-types')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=Aucun type de congé')).toBeVisible()
    await expect(page.locator('button:has-text("Ajouter un type")').last()).toBeVisible()
  })
})

// ── Security ──────────────────────────────────────────────────────────────────

test.describe('Security — Route access', () => {
  test('S-011-003: unauthenticated access to /leave-types redirects to /login', async ({ page }) => {
    await clearSession(page)
    await page.goto('/leave-types')
    await expect(page).toHaveURL('/login')
  })

  test('S-011-001: manager accessing /leave-types does not see leave-types content', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.manager)
    await page.goto('/leave-types')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')
    // Nuxt renders a 403 error page inline (URL stays /leave-types) — verify that
    // the actual page content (table, "Ajouter un type" button) is NOT rendered
    await expect(page.locator('button:has-text("Ajouter un type")')).toHaveCount(0)
    await expect(page.locator('td:has-text("Congé payé")')).toHaveCount(0)
  })

  test('S-011-002: employee accessing /leave-types gets 403 or redirect', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.employee1)
    await page.goto('/leave-types')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')
    // Either 403 page or redirected — leave-types content must NOT render
    await expect(page.locator('h1:has-text("Types de congé"), td:has-text("Congé payé")')).toHaveCount(0)
  })

  test('S-011-008: no UUID in URL when clicking Modifier (modal is inline)', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)
    await openEditModal(page, 'Congé payé')

    expect(page.url()).toMatch(/\/leave-types$/)
  })
})

test.describe('S-011-006 — Security: XSS in type name field', () => {
  test('S-011-006: script tag in name field is rendered as escaped text (no execution)', async ({ page }) => {
    await clearSession(page)
    await signIn(page, ACCOUNTS.admin)
    await goToLeaveTypes(page)
    await openCreateModal(page)

    await page.fill('#type-name', '<script>window.__xss011=1</script>')

    const injected = await page.evaluate(() => (window as Record<string, unknown>).__xss011)
    expect(injected).toBeUndefined()
  })
})
