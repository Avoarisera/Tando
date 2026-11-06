/**
 * E2E tests — Évaluations 360° (TND-29, lot 2): nomination by the employee,
 * approval by the manager, colleague forms, anonymous aggregate from 3 answers,
 * HR reminder.
 *
 * REQUIRES: local stack + app, and SUPABASE_URL / SUPABASE_SERVICE_KEY in the env:
 * the seed has a single colleague for Emma, so two temporary colleagues are
 * created (and deleted) through the service role. Skipped otherwise.
 */
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? ''
const LOCAL = /127\.0\.0\.1|localhost/.test(URL) && !!SERVICE
const PASSWORD = 'Waka2026!'
const ACCOUNTS = {
  admin: { email: 'admin@waka.com', password: PASSWORD },
  manager: { email: 'manager@waka.com', password: PASSWORD },
  emma: { email: 'employee1@waka.com', password: PASSWORD },
  eddy: { email: 'employee2@waka.com', password: PASSWORD },
}
const RUN = Date.now().toString(36)
const CYCLE = `360 E2E ${RUN}`
const PEERS = [
  { first: 'Paula', last: `Pair${RUN}`, email: `paula-${RUN}@waka.com`, id: '' },
  { first: 'Pierre', last: `Pair${RUN}`, email: `pierre-${RUN}@waka.com`, id: '' },
]

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
async function fill(page: Page, level: number, text: string) {
  await page.waitForSelector('.wb-rf-comp')
  for (const c of await page.locator('.wb-rf-comp').all()) await c.locator(`[data-level="${level}"]`).click()
  for (const ta of await page.locator('[data-q] textarea').all()) await ta.fill(text)
}
async function answerAsPeer(page: Page, account: { email: string, password: string }, level: number, text: string) {
  await signIn(page, account, '/mes-evaluations')
  await page.locator('[data-section="peer-requests"] .wb-me-c', { hasText: CYCLE }).first().click()
  await expect(page.getByText(/est anonyme/)).toBeVisible()
  await expect(page.locator('.wb-rf-obj')).toHaveCount(0) // short form: no objectives
  await fill(page, level, text)
  await page.locator('[data-action="submit-review"]').click()
  await page.locator('[data-action="confirm-submit"]').click()
  await expect(page.getByText('Évaluation envoyée : elle n’est plus modifiable.')).toBeVisible()
}

test.describe.serial('TND-29 lot 2 — Retours des collègues', () => {
  test.skip(!LOCAL, 'needs the local stack and its service key')
  const service = LOCAL ? createClient(URL, SERVICE, { auth: { persistSession: false } }) : null

  test.beforeAll(async () => {
    for (const p of PEERS) {
      const { data } = await service!.auth.admin.createUser({ email: p.email, password: PASSWORD, email_confirm: true })
      p.id = data.user!.id
      await service!.from('profiles').insert({ id: p.id, first_name: p.first, last_name: p.last, role: 'employee', joined_at: '2024-01-01' })
    }
  })
  test.afterAll(async () => {
    await service!.from('review_cycles').delete().eq('name', CYCLE)
    for (const p of PEERS) if (p.id) { await service!.from('profiles').delete().eq('id', p.id); await service!.auth.admin.deleteUser(p.id) }
  })

  test('T-TND29-101: HR launches a 360° campaign for Emma', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/evaluations')
    await page.locator('[data-action="new-cycle"]').click()
    await page.fill('#cy-name', CYCLE)
    await expect(page.getByLabel('Inclure des retours de collègues (360°)')).toBeChecked()
    await page.locator('[data-action="create-cycle"]').click()
    await page.waitForURL(/\/evaluations\/campagne\//)
    await expect(page.locator('.wb-cy-g li', { hasText: 'Marc Manager' })).toBeVisible()
    for (const name of await page.locator('.wb-cy-g li').allInnerTexts()) {
      if (!/Emma/.test(name)) await page.getByLabel(name.trim(), { exact: true }).uncheck()
    }
    await page.locator('[data-action="launch"]').click()
    await page.locator('[data-action="confirm-launch"]').click()
    await expect(page.locator('tbody tr')).toHaveCount(1)
  })

  test('T-TND29-102: Emma proposes 3 colleagues (not herself, not her manager)', async ({ page }) => {
    await signIn(page, ACCOUNTS.emma, '/mes-evaluations')
    await page.locator('.wb-me-c.is-todo[data-packet="self"]', { hasText: CYCLE }).click()
    const box = page.locator('[data-section="peers"]')
    await expect(box.locator('[data-peer="Marc Manager"]')).toHaveCount(0)
    await expect(box.locator('[data-peer="Emma Employée"]')).toHaveCount(0)
    await expect(box.locator('[data-action="save-peers"]')).toBeDisabled()
    for (const n of ['Eddy Employé', ...PEERS.map(p => `${p.first} ${p.last}`)]) await box.locator(`[data-peer="${n}"] input`).check()
    await box.locator('[data-action="save-peers"]').click()
    await expect(box.getByText('En attente de validation')).toBeVisible()
  })

  test('T-TND29-103: Marc validates the list; the colleagues get the request', async ({ page }) => {
    await signIn(page, ACCOUNTS.manager, '/mes-evaluations')
    await page.locator('.wb-me-c.is-todo[data-packet="Emma Employée"]', { hasText: CYCLE }).click()
    const box = page.locator('[data-section="peers"]')
    await expect(box.locator('.wb-pn-chip.is-on')).toHaveCount(3)
    await box.locator('[data-action="save-peers"]').click()
    await expect(box.getByText('Liste validée').first()).toBeVisible()
  })

  test('T-TND29-104: Eddy answers; below 3 answers HR sees nothing but who answered', async ({ page }) => {
    await answerAsPeer(page, ACCOUNTS.eddy, 4, 'Très fiable en revue de code')
    await signIn(page, ACCOUNTS.admin, '/evaluations')
    await page.locator(`a[data-cycle="${CYCLE}"]`).click()
    await page.locator('tr[data-packet="Emma Employée"] a').click()
    await expect(page.locator('[data-badge="peers"]')).toHaveText('Collègues : 1/3')
    await expect(page.locator('[data-section="peer-status"] [data-peer="Eddy Employé"] .wb-c-success')).toBeVisible()
    await expect(page.locator('[data-peers="hidden"]')).toBeVisible()
    await expect(page.getByText('Très fiable en revue de code')).toHaveCount(0)
  })

  test('T-TND29-105: from 3 answers HR reads the anonymous aggregate', async ({ page }) => {
    await answerAsPeer(page, { email: PEERS[0]!.email, password: PASSWORD }, 2, 'Communique peu sur ses blocages')
    await answerAsPeer(page, { email: PEERS[1]!.email, password: PASSWORD }, 3, 'Toujours disponible pour aider')
    await signIn(page, ACCOUNTS.admin, '/evaluations')
    await page.locator(`a[data-cycle="${CYCLE}"]`).click()
    await page.locator('tr[data-packet="Emma Employée"] a').click()
    await expect(page.locator('[data-badge="peers"]')).toHaveText('Collègues : 3/3')
    await expect(page.locator('.wb-rs2-scale .wb-rs2-dot.is-peer').first()).toBeVisible()
    const answers = page.locator('[data-section="peer-answers"]')
    await expect(answers).toContainText('Très fiable en revue de code')
    await expect(answers).toContainText('Toujours disponible pour aider')
    await expect(answers).not.toContainText('Eddy')
  })

  test('T-TND29-106: HR reminds the late people (Emma and Marc have not answered)', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin, '/evaluations')
    await page.locator(`a[data-cycle="${CYCLE}"]`).click()
    await page.locator('[data-action="remind"]').click()
    await expect(page.getByText(/2 personnes relancées/)).toBeVisible()
  })
})
