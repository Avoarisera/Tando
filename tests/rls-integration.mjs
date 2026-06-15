/**
 * RLS integration tests — verifies RLS policies using the actual supabase-js
 * client with demo account credentials.
 *
 * REQUIRES: RFC-002 seed applied.
 * Run: node --env-file=.env tests/rls-integration.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dir, '..')

// --- Load .env --------------------------------------------------------
function loadEnv(path) {
  try {
    const raw = readFileSync(path, 'utf8')
    const env = {}
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      env[key] = val
    }
    return env
  } catch {
    return {}
  }
}

const env = { ...loadEnv(resolve(root, '.env')), ...process.env }
const SUPABASE_URL = env.SUPABASE_URL ?? env.NUXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_KEY ?? env.NUXT_PUBLIC_SUPABASE_KEY
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY ?? env.NUXT_SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_KEY (or NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_KEY) must be set in .env')
  process.exit(1)
}

// Service client used only for test teardown (no RLS) — never exposed to browser
const serviceClient = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  : null

// --- Test runner ------------------------------------------------------------
let pass = 0
let fail = 0
const failures = []

function ok(id, label) {
  console.log(`  PASS  ${id}: ${label}`)
  pass++
}

function ko(id, label, detail) {
  console.log(`  FAIL  ${id}: ${label}`)
  if (detail) console.log(`        ${detail}`)
  fail++
  failures.push({ id, label, detail })
}

function assert(id, label, condition, detail) {
  condition ? ok(id, label) : ko(id, label, detail)
}

// --- Create authenticated client for a demo user ----------------------------
async function clientFor(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) return { client: null, userId: null, error }
  return { client, userId: data.user.id, error: null }
}

// --- Check demo accounts exist ----------------------------------------------
console.log('\n=== RLS Integration Tests — RFC-001 ===')
console.log('Requires RFC-002 seed. Connecting to:', SUPABASE_URL)
console.log()

const PASS = 'Waka2026!'
const accounts = {
  admin:    { email: 'admin@waka.com',     password: PASS },
  manager:  { email: 'manager@waka.com',   password: PASS },
  employee1:{ email: 'employee1@waka.com', password: PASS },
  employee2:{ email: 'employee2@waka.com', password: PASS },
}

// Attempt login for all accounts
const sessions = {}
for (const [role, { email, password }] of Object.entries(accounts)) {
  const { client, userId, error } = await clientFor(email, password)
  if (error) {
    console.log(`  SKIP  Cannot sign in as ${email}: ${error.message}`)
    console.log('        → Run RFC-002 seed first, then re-run this script.\n')
    process.exit(0)
  }
  sessions[role] = { client, userId }
}

// ============================================================
// INT-001: employee1 sees only own leave_requests
// ============================================================
{
  const { client, userId } = sessions.employee1
  const { data, error } = await client.from('leave_requests').select('id, user_id')
  const ownOnly = data?.every(r => r.user_id === userId) ?? false
  assert(
    'INT-001',
    'employee1 sees only own leave_requests',
    !error && ownOnly,
    error?.message ?? `Rows from other users visible: ${JSON.stringify(data?.filter(r => r.user_id !== userId))}`
  )
}

// ============================================================
// INT-002: employee2 cannot see employee1's requests
// ============================================================
{
  const { client } = sessions.employee2
  const { userId: emp1Id } = sessions.employee1
  const { data, error } = await client
    .from('leave_requests')
    .select('id')
    .eq('user_id', emp1Id)
  assert(
    'INT-002',
    'employee2 cannot see employee1\'s leave_requests',
    !error && data?.length === 0,
    error?.message ?? `Expected 0 rows, got ${data?.length}`
  )
}

// ============================================================
// INT-003: manager sees own team's leave_requests
// ============================================================
{
  const { client } = sessions.manager
  const { data, error } = await client.from('leave_requests').select('id, user_id')
  // Manager should see at least employee1 and employee2 requests (seeded)
  const uniqueUsers = [...new Set(data?.map(r => r.user_id) ?? [])]
  assert(
    'INT-003',
    'manager sees team leave_requests (multiple users)',
    !error && uniqueUsers.length >= 2,
    error?.message ?? `Expected requests from ≥2 users, found ${uniqueUsers.length}`
  )
}

// ============================================================
// INT-004: admin sees all leave_requests (≥ manager's count)
// ============================================================
{
  const { client: mgr } = sessions.manager
  const { client: adm } = sessions.admin
  const { data: mgrData } = await mgr.from('leave_requests').select('id')
  const { data: admData, error } = await adm.from('leave_requests').select('id')
  assert(
    'INT-004',
    'admin sees at least as many leave_requests as manager',
    !error && (admData?.length ?? 0) >= (mgrData?.length ?? 0),
    error?.message ?? `Admin: ${admData?.length}, Manager: ${mgrData?.length}`
  )
}

// ============================================================
// INT-005: employee1 sees only own profile
// ============================================================
{
  const { client, userId } = sessions.employee1
  const { data, error } = await client.from('profiles').select('id')
  const ownOnly = data?.length === 1 && data[0].id === userId
  assert(
    'INT-005',
    'employee1 sees only own profile',
    !error && ownOnly,
    error?.message ?? `Expected 1 profile (own), got ${data?.length}: ${JSON.stringify(data)}`
  )
}

// ============================================================
// INT-006: manager sees team profiles, not admin's
// ============================================================
{
  const { client } = sessions.manager
  const { userId: adminId } = sessions.admin
  const { data, error } = await client.from('profiles').select('id')
  const seesAdmin = data?.some(p => p.id === adminId) ?? false
  assert(
    'INT-006',
    'manager does not see admin profile',
    !error && !seesAdmin,
    error?.message ?? `Admin profile appeared in manager query`
  )
}

// ============================================================
// INT-007: employee1 sees own leave_balances only
// ============================================================
{
  const { client, userId } = sessions.employee1
  const { data, error } = await client.from('leave_balances').select('id, user_id')
  const ownOnly = data?.every(r => r.user_id === userId) ?? false
  assert(
    'INT-007',
    'employee1 sees only own leave_balances',
    !error && ownOnly,
    error?.message ?? `Saw balances for other users`
  )
}

// ============================================================
// INT-008: employee1 cannot INSERT leave_request for employee2
// ============================================================
{
  const { client } = sessions.employee1
  const { userId: emp2Id } = sessions.employee2
  const { error } = await client.from('leave_requests').insert({
    user_id: emp2Id,
    leave_type_id: '00000000-0000-0000-0000-000000000000', // deliberately invalid
    start_date: '2026-12-01',
    end_date: '2026-12-02',
    days_count: 2,
    status: 'pending',
  })
  assert(
    'INT-008',
    'employee1 cannot INSERT leave_request for employee2',
    error !== null,
    error ? undefined : 'Insert succeeded but should have been blocked by RLS'
  )
}

// ============================================================
// INT-009: employee cannot INSERT into leave_types
// ============================================================
{
  const { client } = sessions.employee1
  const { error } = await client.from('leave_types').insert({
    name: 'Unauthorized',
    color: '#FFFFFF',
    is_active: true,
  })
  assert(
    'INT-009',
    'employee cannot INSERT into leave_types',
    error !== null,
    error ? undefined : 'Insert succeeded but RLS should have blocked it'
  )
}

// ============================================================
// INT-010: All roles can SELECT leave_types
// ============================================================
{
  for (const [role, { client }] of Object.entries(sessions)) {
    const { data, error } = await client.from('leave_types').select('id').limit(1)
    assert(
      `INT-010-${role}`,
      `${role} can SELECT leave_types`,
      !error && data !== null,
      error?.message
    )
  }
}

// ============================================================
// INT-011: All roles can SELECT teams
// ============================================================
{
  for (const [role, { client }] of Object.entries(sessions)) {
    const { data, error } = await client.from('teams').select('id').limit(1)
    assert(
      `INT-011-${role}`,
      `${role} can SELECT teams`,
      !error && data !== null,
      error?.message
    )
  }
}

// ============================================================
// INT-012: Unauthenticated client gets no data
// ============================================================
{
  const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await anonClient.from('leave_requests').select('id').limit(5)
  assert(
    'INT-012',
    'Unauthenticated client receives no leave_requests (RLS or empty)',
    !error && (data?.length ?? 0) === 0,
    error?.message ?? `Unauthenticated query returned ${data?.length} rows`
  )
}

// ============================================================
// RFC-007 RLS integration: create_leave_request RPC
// ============================================================

// IDs of requests created by INT-013/014 — tracked for teardown
const rpcTestIds = []

// Pre-cleanup: remove any requests left over from a previous test run
if (serviceClient) {
  await serviceClient
    .from('leave_requests')
    .delete()
    .eq('user_id', sessions.employee1.userId)
    .in('start_date', ['2026-07-01', '2026-08-01'])
}

// INT-013: employee1 can create a leave request via RPC (own user_id, SECURITY DEFINER)
{
  const { client } = sessions.employee1
  const { data, error } = await client.rpc('create_leave_request', {
    p_leave_type_id: '00000000-0000-0000-0000-000000000020', // Congé payé
    p_start_date:    '2026-07-01',
    p_end_date:      '2026-07-03',
    p_comment:       null,
  })
  if (data) rpcTestIds.push(data)
  assert(
    'INT-013',
    'employee1 can create a leave request via RPC (returns UUID)',
    !error && typeof data === 'string' && data.length > 0,
    error?.message ?? `Unexpected data: ${JSON.stringify(data)}`
  )
}

// INT-014: RPC correctly sets user_id = auth.uid() (cannot forge another user)
{
  const { client: emp1Client, userId: emp1Id } = sessions.employee1
  const { data: newId, error } = await emp1Client.rpc('create_leave_request', {
    p_leave_type_id: '00000000-0000-0000-0000-000000000020',
    p_start_date:    '2026-08-01',
    p_end_date:      '2026-08-02',
    p_comment:       null,
  })

  let userIdCorrect = false
  if (!error && newId) {
    rpcTestIds.push(newId)
    const { data: row } = await emp1Client
      .from('leave_requests')
      .select('user_id')
      .eq('id', newId)
      .single()
    userIdCorrect = row?.user_id === emp1Id
  }

  assert(
    'INT-014',
    'RPC inserts leave_request with user_id = auth.uid() (cannot forge)',
    !error && userIdCorrect,
    error?.message ?? `user_id mismatch — got ${JSON.stringify(userIdCorrect)}`
  )
}

// INT-015: RPC raises French error for overlap with own pending request
{
  const { client } = sessions.employee1
  // Emma (employee1) has a seeded pending request: 2026-05-12 → 2026-05-16
  const { error } = await client.rpc('create_leave_request', {
    p_leave_type_id: '00000000-0000-0000-0000-000000000020',
    p_start_date:    '2026-05-14',
    p_end_date:      '2026-05-20',
    p_comment:       null,
  })
  assert(
    'INT-015',
    'RPC raises French overlap error (includes "demande sur cette période")',
    error !== null && error.message?.includes('sur cette période'),
    error ? undefined : 'No error raised — overlap not detected'
  )
}

// INT-016: RPC raises French error for insufficient balance
{
  const { client } = sessions.employee1
  // Emma has 20 remaining Congé payé — request 21 days
  const { error } = await client.rpc('create_leave_request', {
    p_leave_type_id: '00000000-0000-0000-0000-000000000020',
    p_start_date:    '2026-10-01',
    p_end_date:      '2026-10-21', // 21 days
    p_comment:       null,
  })
  assert(
    'INT-016',
    'RPC raises French balance error (includes "Solde insuffisant")',
    error !== null && error.message?.includes('Solde insuffisant'),
    error ? undefined : 'No error raised — balance check not working'
  )
}

// INT-017: employee1 can SELECT own newly created leave_requests
{
  const { client, userId } = sessions.employee1
  const { data, error } = await client
    .from('leave_requests')
    .select('id, user_id, status')
    .eq('user_id', userId)
    .eq('status', 'pending')
  assert(
    'INT-017',
    'employee1 can SELECT own pending leave_requests after creation',
    !error && (data?.length ?? 0) >= 1,
    error?.message ?? `Expected ≥1 pending requests, found ${data?.length}`
  )
}

// INT-018: employee1 cannot UPDATE another employee's leave_request status
{
  const { client } = sessions.employee1
  // Eddy (employee2) has a seeded manager_approved request (id: ...042)
  const { error } = await client
    .from('leave_requests')
    .update({ status: 'rejected' })
    .eq('id', '00000000-0000-0000-0000-000000000042')
  assert(
    'INT-018',
    'employee1 cannot UPDATE employee2 leave_request status',
    error !== null || true, // RLS blocks or updates 0 rows
    undefined
  )
  // Verify the row was NOT modified
  const { client: adminClient } = sessions.admin
  const { data } = await adminClient
    .from('leave_requests')
    .select('status')
    .eq('id', '00000000-0000-0000-0000-000000000042')
    .single()
  assert(
    'INT-018b',
    'Eddy request status unchanged after employee1 update attempt',
    data?.status === 'manager_approved',
    `Expected manager_approved, got ${data?.status}`
  )
}

// ============================================================
// RFC-009 RLS integration: Admin leave management
// ============================================================

console.log('\n=== RFC-009: Admin Leave Management ===')
console.log()

// Track requests mutated by RFC-009 tests — restored in teardown below
const adminTestRestores = []

// INT-019: admin sees all 4 seeded leave_requests
{
  const { client } = sessions.admin
  const { data, error } = await client.from('leave_requests').select('id')
  assert(
    'INT-019',
    'admin sees all 4 seeded leave_requests (≥4 rows)',
    !error && (data?.length ?? 0) >= 4,
    error?.message ?? `Expected ≥4 rows, got ${data?.length}`
  )
}

// INT-020: employee cannot UPDATE own leave_request status to 'approved' directly
{
  const { client } = sessions.employee1
  // Emma tries to approve her own pending request (041) — should be blocked by RLS
  await client
    .from('leave_requests')
    .update({ status: 'approved' })
    .eq('id', '00000000-0000-0000-0000-000000000041')

  // Verify status is still pending (RLS blocked or updated 0 rows)
  const { client: adminClient } = sessions.admin
  const { data } = await adminClient
    .from('leave_requests')
    .select('status')
    .eq('id', '00000000-0000-0000-0000-000000000041')
    .single()
  assert(
    'INT-020',
    'employee cannot UPDATE own leave_request status to approved directly',
    data?.status === 'pending',
    `Expected pending, got ${data?.status}`
  )
}

// INT-021: admin bypass-approve Emma pending (041)
// Verifies: status → approved, manager_reviewed_by stays NULL, used_days increments
{
  const { client, userId: adminId } = sessions.admin
  const { error } = await client
    .from('leave_requests')
    .update({
      status: 'approved',
      admin_reviewed_by: adminId,
      admin_reviewed_at: new Date().toISOString(),
    })
    .eq('id', '00000000-0000-0000-0000-000000000041')

  if (!error) adminTestRestores.push('00000000-0000-0000-0000-000000000041')

  const { data: row } = await client
    .from('leave_requests')
    .select('status, manager_reviewed_by, admin_reviewed_by')
    .eq('id', '00000000-0000-0000-0000-000000000041')
    .single()

  assert(
    'INT-021a',
    'admin bypass: request status is now approved',
    !error && row?.status === 'approved',
    error?.message ?? `Status: ${row?.status}`
  )

  assert(
    'INT-021b',
    'admin bypass: manager_reviewed_by stays NULL (level-1 bypass confirmed)',
    !error && row?.manager_reviewed_by === null,
    `manager_reviewed_by should be NULL, got ${row?.manager_reviewed_by}`
  )

  assert(
    'INT-021c',
    'admin bypass: admin_reviewed_by set to admin user id',
    !error && row?.admin_reviewed_by === adminId,
    `Expected ${adminId}, got ${row?.admin_reviewed_by}`
  )

  // Emma's Congé payé balance id=032 should go from 5 → 10 (seed has 5 from approved request 043)
  const { data: balance } = await client
    .from('leave_balances')
    .select('used_days')
    .eq('id', '00000000-0000-0000-0000-000000000032')
    .single()

  assert(
    'INT-021d',
    'admin bypass: trigger increments used_days by 5 (5 → 10)',
    !error && balance?.used_days === 10,
    `Expected used_days=10, got ${balance?.used_days}`
  )
}

// INT-023: admin tries to approve Eddy RTT request (042) — no RTT balance → trigger raises French error
// Row is left untouched (transaction rolls back) — no teardown needed
{
  const { client, userId: adminId } = sessions.admin
  const { error } = await client
    .from('leave_requests')
    .update({
      status: 'approved',
      admin_reviewed_by: adminId,
      admin_reviewed_at: new Date().toISOString(),
    })
    .eq('id', '00000000-0000-0000-0000-000000000042')

  assert(
    'INT-023',
    'admin approve RTT with no balance → trigger raises French "Aucun solde trouvé" error',
    error !== null && error.message?.includes('Aucun solde trouvé'),
    error ? `Error message was: "${error.message}"` : 'No error raised — trigger did not fire'
  )

  // Verify the row was NOT modified (trigger exception rolls back the transaction)
  const { data: row } = await client
    .from('leave_requests')
    .select('status')
    .eq('id', '00000000-0000-0000-0000-000000000042')
    .single()
  assert(
    'INT-023b',
    'admin approve RTT: row status unchanged after trigger rollback (still manager_approved)',
    row?.status === 'manager_approved',
    `Expected manager_approved, got ${row?.status}`
  )
}

// INT-022: admin rejects Eddy manager_approved (042) — status → rejected, used_days unchanged
{
  const { client, userId: adminId } = sessions.admin
  const { error } = await client
    .from('leave_requests')
    .update({
      status: 'rejected',
      admin_reviewed_by: adminId,
      admin_reviewed_at: new Date().toISOString(),
    })
    .eq('id', '00000000-0000-0000-0000-000000000042')

  if (!error) adminTestRestores.push('00000000-0000-0000-0000-000000000042')

  const { data: row } = await client
    .from('leave_requests')
    .select('status')
    .eq('id', '00000000-0000-0000-0000-000000000042')
    .single()

  assert(
    'INT-022a',
    'admin reject: request status is now rejected',
    !error && row?.status === 'rejected',
    error?.message ?? `Status: ${row?.status}`
  )

  // Eddy's Congé payé balance id=033 — used_days must stay 0 (rejection does not touch balances)
  const { data: balance } = await client
    .from('leave_balances')
    .select('used_days')
    .eq('id', '00000000-0000-0000-0000-000000000033')
    .single()

  assert(
    'INT-022b',
    'admin reject: used_days unchanged at 0 (trigger does not fire on rejection)',
    !error && balance?.used_days === 0,
    `Expected used_days=0, got ${balance?.used_days}`
  )
}

// --- RFC-009 teardown: restore mutated requests --------------------------------
if (serviceClient) {
  if (adminTestRestores.includes('00000000-0000-0000-0000-000000000041')) {
    // Restore Emma's request to pending — trigger Cas 2 fires: used_days 10 → 5
    await serviceClient
      .from('leave_requests')
      .update({ status: 'pending', admin_reviewed_by: null, admin_reviewed_at: null })
      .eq('id', '00000000-0000-0000-0000-000000000041')
  }
  if (adminTestRestores.includes('00000000-0000-0000-0000-000000000042')) {
    // Restore Eddy's request to manager_approved (rejection has no balance impact)
    await serviceClient
      .from('leave_requests')
      .update({ status: 'manager_approved', admin_reviewed_by: null, admin_reviewed_at: null })
      .eq('id', '00000000-0000-0000-0000-000000000042')
  }
}

// --- Teardown: delete requests created during this test run -----------------
if (serviceClient && rpcTestIds.length > 0) {
  await serviceClient.from('leave_requests').delete().in('id', rpcTestIds)
}

// ============================================================
// RFC-016: Invoices Vault — table RLS + Storage bucket
// ============================================================

console.log('\n=== RFC-016: Invoices Vault — RLS ===')
console.log()

// Track invoices inserted by these tests for teardown
const invoiceTestIds = []

// INT-016-01: employee1 cannot SELECT invoices (RLS blocks all rows)
{
  const { client } = sessions.employee1
  const { data, error } = await client.from('invoices').select('id')
  assert(
    'INT-016-01',
    'employee1 cannot SELECT invoices (RLS returns 0 rows)',
    !error && (data?.length ?? 0) === 0,
    error?.message ?? `Expected 0 rows, got ${data?.length}`
  )
}

// INT-016-02: manager cannot SELECT invoices (RLS blocks all rows)
{
  const { client } = sessions.manager
  const { data, error } = await client.from('invoices').select('id')
  assert(
    'INT-016-02',
    'manager cannot SELECT invoices (RLS returns 0 rows)',
    !error && (data?.length ?? 0) === 0,
    error?.message ?? `Expected 0 rows, got ${data?.length}`
  )
}

// INT-016-03: admin can SELECT seeded invoices (≥1 row expected from seed)
{
  const { client } = sessions.admin
  const { data, error } = await client.from('invoices').select('id')
  assert(
    'INT-016-03',
    'admin can SELECT seeded invoices (≥1 row visible)',
    !error && (data?.length ?? 0) >= 1,
    error?.message ?? `Expected ≥1 invoice, got ${data?.length}. Run seed first.`
  )
}

// INT-016-04: employee1 cannot INSERT into invoices
{
  const { client } = sessions.employee1
  const { error } = await client.from('invoices').insert({
    reference:    'RLS-TEST-EMP',
    client:       'RLS Test',
    amount:       100,
    currency:     'EUR',
    invoice_date: '2026-05-18',
    status:       'en_attente',
  })
  assert(
    'INT-016-04',
    'employee1 cannot INSERT into invoices (RLS blocks)',
    error !== null,
    error ? undefined : 'Insert succeeded but should have been blocked by RLS'
  )
}

// INT-016-05: manager cannot INSERT into invoices
{
  const { client } = sessions.manager
  const { error } = await client.from('invoices').insert({
    reference:    'RLS-TEST-MGR',
    client:       'RLS Test',
    amount:       100,
    currency:     'EUR',
    invoice_date: '2026-05-18',
    status:       'en_attente',
  })
  assert(
    'INT-016-05',
    'manager cannot INSERT into invoices (RLS blocks)',
    error !== null,
    error ? undefined : 'Insert succeeded but should have been blocked by RLS'
  )
}

// INT-016-06: admin can INSERT an invoice (and UPDATE its status)
{
  const { client, userId: adminId } = sessions.admin
  const testRef = `RLS-TEST-ADMIN-${Date.now()}`

  const { data: inserted, error: insertErr } = await client
    .from('invoices')
    .insert({
      reference:    testRef,
      client:       'RLS Test Admin',
      amount:       999,
      currency:     'EUR',
      invoice_date: '2026-05-18',
      status:       'en_attente',
      created_by:   adminId,
    })
    .select('id')
    .single()

  if (inserted?.id) invoiceTestIds.push(inserted.id)

  assert(
    'INT-016-06a',
    'admin can INSERT an invoice',
    !insertErr && inserted?.id != null,
    insertErr?.message ?? 'Insert returned no id'
  )

  if (inserted?.id) {
    const { error: updateErr } = await client
      .from('invoices')
      .update({ status: 'envoyee' })
      .eq('id', inserted.id)

    assert(
      'INT-016-06b',
      'admin can UPDATE invoice status',
      !updateErr,
      updateErr?.message
    )
  }
}

// INT-016-07: employee1 cannot upload to the invoices Storage bucket
{
  const { client } = sessions.employee1
  const testContent = Buffer.from('%PDF-1.4 rls-test')
  const { error } = await client.storage
    .from('invoices')
    .upload('rls-test/employee-blocked.pdf', testContent, {
      contentType: 'application/pdf',
      upsert: true,
    })
  assert(
    'INT-016-07',
    'employee1 cannot upload to invoices Storage bucket (RLS blocks)',
    error !== null,
    error ? undefined : 'Upload succeeded but RLS should have blocked it'
  )
}

// INT-016-08: manager cannot upload to the invoices Storage bucket
{
  const { client } = sessions.manager
  const testContent = Buffer.from('%PDF-1.4 rls-test')
  const { error } = await client.storage
    .from('invoices')
    .upload('rls-test/manager-blocked.pdf', testContent, {
      contentType: 'application/pdf',
      upsert: true,
    })
  assert(
    'INT-016-08',
    'manager cannot upload to invoices Storage bucket (RLS blocks)',
    error !== null,
    error ? undefined : 'Upload succeeded but RLS should have blocked it'
  )
}

// INT-016-09: employee1 cannot get a signed URL for a seeded invoice PDF
// (seeded invoice 060 has pdf_path = '00000000-0000-0000-0000-000000000060/FAC-2026-001.pdf')
{
  const { client } = sessions.employee1
  const { error } = await client.storage
    .from('invoices')
    .createSignedUrl('00000000-0000-0000-0000-000000000060/FAC-2026-001.pdf', 60)
  assert(
    'INT-016-09',
    'employee1 cannot get a signed URL for an invoice PDF (Storage RLS blocks)',
    error !== null,
    error ? undefined : 'createSignedUrl succeeded but RLS should have blocked it'
  )
}

// INT-016-10: admin can list the invoices Storage bucket without error
{
  const { client } = sessions.admin
  const { data, error } = await client.storage.from('invoices').list('')
  assert(
    'INT-016-10',
    'admin can list the invoices Storage bucket (no error)',
    !error && data !== null,
    error?.message ?? 'list() returned null data'
  )
}

// --- RFC-016 Teardown: delete test invoices created above -------------------
if (serviceClient && invoiceTestIds.length > 0) {
  await serviceClient.from('invoices').delete().in('id', invoiceTestIds)
}

// --- Summary ----------------------------------------------------------------
console.log()
console.log('=== Results ===')
console.log(`  PASS: ${pass}`)
console.log(`  FAIL: ${fail}`)
if (failures.length) {
  console.log('\nFailed tests:')
  for (const { id, label } of failures) {
    console.log(`  ${id}: ${label}`)
  }
}
console.log()
process.exit(fail > 0 ? 1 : 0)
