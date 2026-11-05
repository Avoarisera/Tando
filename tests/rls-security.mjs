/**
 * Security regression tests — lot 0 (TND-11 → TND-19).
 *
 * Each test tries an attack that must be refused. Run ONLY against a local
 * Supabase stack (it writes and then rolls back test rows with the service key):
 *
 *   SUPABASE_URL=http://127.0.0.1:54421 SUPABASE_KEY=<anon> SUPABASE_SERVICE_KEY=<service> \
 *     node tests/rls-security.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_KEY
const SERVICE = process.env.SUPABASE_SERVICE_KEY

if (!URL || !ANON || !SERVICE) {
  console.error('SUPABASE_URL, SUPABASE_KEY and SUPABASE_SERVICE_KEY are required')
  process.exit(2)
}
if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error(`Refusing to run against a non-local database: ${URL}`)
  process.exit(2)
}

const PASSWORD = 'Waka2026!'
const IDS = {
  manager: '00000000-0000-0000-0000-000000000002',
  emma: '00000000-0000-0000-0000-000000000003',
  eddy: '00000000-0000-0000-0000-000000000004',
  congePaye: '00000000-0000-0000-0000-000000000020',
}

const service = createClient(URL, SERVICE, { auth: { persistSession: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false } })

async function signIn(email) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return client
}

let pass = 0
let fail = 0
const created = []

function check(id, label, refused, detail = '') {
  if (refused) { pass++; console.log(`  PASS  ${id} ${label}`) }
  else { fail++; console.log(`  FAIL  ${id} ${label}${detail ? ` — ${detail}` : ''}`) }
}

// Dates in December of the current year: seeded balances exist for this year only.
// (Run outside December, or adapt, so that these dates are in the future.)
const Y = new Date().getFullYear()
const dec = (day) => `${Y}-12-${String(day).padStart(2, '0')}`

async function main() {
  const emma = await signIn('employee1@waka.com')
  const manager = await signIn('manager@waka.com')
  const admin = await signIn('admin@waka.com')

  console.log('\nTND-11 — fonctions admin sans connexion')
  {
    const { data, error } = await anon.rpc('get_dashboard_snapshot')
    check('TND-11a', 'anon ne lit pas le tableau de bord', !!error && !data, error ? '' : 'données renvoyées')
    const { error: e2 } = await anon.rpc('upsert_leave_type_balances', {
      p_leave_type_id: IDS.congePaye, p_year: 2099, p_allocated_days: 99,
    })
    const { data: leaked } = await service.from('leave_balances').select('id').eq('year', 2099)
    check('TND-11b', 'anon ne réécrit pas les soldes', !!e2 && (leaked ?? []).length === 0)
    if ((leaked ?? []).length) await service.from('leave_balances').delete().eq('year', 2099)
    const { error: e3 } = await anon.rpc('create_leave_request', {
      p_leave_type_id: IDS.congePaye, p_start_date: dec(21), p_end_date: dec(22),
    })
    check('TND-11c', 'anon ne crée pas de demande', !!e3)
    const { data: ok } = await admin.rpc('get_dashboard_snapshot')
    check('TND-11d', 'l\'admin lit toujours le tableau de bord', !!ok?.employees)
  }

  console.log('\nTND-12 — insertion directe d\'une demande approuvée')
  {
    const { data, error } = await emma.from('leave_requests').insert({
      user_id: IDS.emma, leave_type_id: IDS.congePaye,
      start_date: dec(1), end_date: dec(2), days_count: 1, status: 'approved',
    }).select('id')
    if (data?.[0]?.id) created.push(data[0].id)
    check('TND-12a', 'un employé ne peut pas insérer directement', !!error)
  }

  console.log('\nTND-13 — droits sur les tables')
  {
    const { error } = await anon.from('profiles').select('id').limit(1)
    // with RLS alone anon gets [] (no error); after revoke it gets a permission error
    check('TND-13a', 'anon n\'a aucun droit de lecture sur profiles', !!error)
  }

  console.log('\nTND-14 — validation manager')
  {
    const { data: rid } = await emma.rpc('create_leave_request', {
      p_leave_type_id: IDS.congePaye, p_start_date: dec(7), p_end_date: dec(11),
    })
    if (rid) created.push(rid)
    const { data: upd, error } = await manager.from('leave_requests')
      .update({ status: 'manager_approved', days_count: 1 }).eq('id', rid).select('days_count')
    const tampered = !error && upd?.[0]?.days_count === 1
    check('TND-14a', 'le manager ne peut pas changer days_count en validant', !tampered)

    const { data: own } = await manager.rpc('create_leave_request', {
      p_leave_type_id: IDS.congePaye, p_start_date: dec(14), p_end_date: dec(15),
    })
    if (own) created.push(own)
    let selfApproved = false
    if (own) {
      // try both paths: the new RPC (after fix) and a direct UPDATE (before fix)
      await manager.rpc('review_leave_request', { p_request_id: own, p_decision: 'approve' })
      await manager.from('leave_requests').update({ status: 'manager_approved' }).eq('id', own)
      const { data: row } = await service.from('leave_requests').select('status').eq('id', own).single()
      selfApproved = row?.status === 'manager_approved'
    }
    check('TND-14b', 'le manager ne peut pas valider sa propre demande', !selfApproved)
  }

  console.log('\nTND-15 — données personnelles des collègues')
  {
    const { data, error } = await emma.from('profiles').select('id, birth_date').eq('id', IDS.eddy)
    check('TND-15a', 'un employé ne lit pas birth_date d\'un collègue', !!error || (data ?? []).length === 0)
  }

  console.log('\nTND-19 — solde et demandes en attente')
  {
    const { data: bal } = await service.from('leave_balances')
      .select('allocated_days, used_days').eq('user_id', IDS.eddy).eq('leave_type_id', IDS.congePaye)
      .eq('year', Y).single()
    const eddy = await signIn('employee2@waka.com')
    const remaining = (bal?.allocated_days ?? 25) - (bal?.used_days ?? 0)
    const big = Math.min(Math.max(Math.ceil(remaining / 2) + 2, 1), 15)
    const r1 = await eddy.rpc('create_leave_request', {
      p_leave_type_id: IDS.congePaye, p_start_date: dec(1), p_end_date: dec(big),
    })
    if (r1.data) created.push(r1.data)
    const r2 = await eddy.rpc('create_leave_request', {
      p_leave_type_id: IDS.congePaye, p_start_date: dec(big + 1), p_end_date: dec(Math.min(big * 2, 31)),
    })
    if (r2.data) created.push(r2.data)
    check('TND-19a', 'pas de dépassement de solde via les demandes en attente', !r1.error && !!r2.error,
      r1.error ? `1re demande refusée: ${r1.error.message}` : '')
    const past = await eddy.rpc('create_leave_request', {
      p_leave_type_id: IDS.congePaye, p_start_date: `${Y}-01-05`, p_end_date: `${Y}-01-06`,
    })
    if (past.data) created.push(past.data)
    check('TND-19b', 'date de début passée refusée côté serveur', !!past.error)
  }

  console.log('\nNon-régression — usages légitimes')
  {
    // employee → manager → admin, balance debited exactly once
    const { data: before } = await service.from('leave_balances').select('used_days')
      .eq('user_id', IDS.emma).eq('leave_type_id', IDS.congePaye).eq('year', Y).single()
    const { data: rid, error: cErr } = await emma.rpc('create_leave_request', {
      p_leave_type_id: IDS.congePaye, p_start_date: dec(28), p_end_date: dec(29), p_comment: 'test lot 0',
    })
    if (rid) created.push(rid)
    check('OK-01', 'un employé crée une demande via le RPC', !cErr && !!rid, cErr?.message)
    const m = await manager.rpc('review_leave_request', { p_request_id: rid, p_decision: 'approve' })
    check('OK-02', 'le manager valide (→ manager_approved)', m.data === 'manager_approved', m.error?.message)
    const a = await admin.rpc('review_leave_request', { p_request_id: rid, p_decision: 'approve' })
    check('OK-03', 'l\'admin approuve (→ approved)', a.data === 'approved', a.error?.message)
    const { data: after } = await service.from('leave_balances').select('used_days')
      .eq('user_id', IDS.emma).eq('leave_type_id', IDS.congePaye).eq('year', Y).single()
    check('OK-04', 'le solde est débité de 2 jours', (after?.used_days ?? 0) - (before?.used_days ?? 0) === 2)
    const again = await admin.rpc('review_leave_request', { p_request_id: rid, p_decision: 'reject' })
    check('OK-05', 'une demande traitée ne peut plus être re-traitée', !!again.error)
    // rejected requests refund nothing because nothing was debited; approved one: clean up via service
    await service.from('leave_balances').update({ used_days: before?.used_days ?? 0 })
      .eq('user_id', IDS.emma).eq('leave_type_id', IDS.congePaye).eq('year', Y)

    const { data: me, error: meErr } = await emma.from('profiles')
      .select('id, first_name, last_name, role, team_id, joined_at, created_at').eq('id', IDS.emma).single()
    check('OK-06', 'un employé lit son propre profil', !meErr && me?.id === IDS.emma, meErr?.message)

    const { data: cal, error: calErr } = await emma.from('leave_requests')
      .select('id, status, profiles!user_id (id, first_name, last_name, teams (id, name))')
      .eq('status', 'approved')
    check('OK-07', 'calendrier employé : congés approuvés de l\'équipe avec le profil', !calErr && (cal ?? []).length > 0, calErr?.message)

    const { data: team, error: tErr } = await manager.from('leave_balances')
      .select('*, profiles!user_id (id, first_name, last_name)').eq('year', Y)
    check('OK-08', 'le manager lit les soldes de son équipe', !tErr && (team ?? []).length > 0, tErr?.message)

    const { data: bal } = await admin.from('leave_balances').select('id, allocated_days')
      .eq('user_id', IDS.eddy).eq('leave_type_id', IDS.congePaye).eq('year', Y).single()
    const { error: bErr } = await admin.from('leave_balances').update({ allocated_days: bal.allocated_days }).eq('id', bal.id)
    check('OK-09', 'l\'admin modifie un quota', !bErr, bErr?.message)
    const { error: eBalErr, data: eBal } = await emma.from('leave_balances').update({ allocated_days: 99 }).eq('id', bal.id).select('id')
    check('OK-10', 'un employé ne modifie pas un quota', !!eBalErr || (eBal ?? []).length === 0)

    const { error: ltErr } = await admin.from('leave_types').update({ is_active: true }).eq('id', IDS.congePaye)
    check('OK-11', 'l\'admin modifie un type de congé', !ltErr, ltErr?.message)

    const { error: invErr } = await admin.from('invoices').select('id, reference, pdf_path').limit(1)
    check('OK-12', 'l\'admin lit les factures', !invErr, invErr?.message)
    const { data: invE } = await emma.from('invoices').select('id')
    check('OK-13', 'un employé ne voit aucune facture', (invE ?? []).length === 0)

    const { error: wsErr } = await admin.from('workspaces')
      .select('id, name, last_synced_at, created_at, selected_teams, sync_status')
    check('OK-14', 'l\'admin lit les workspaces', !wsErr, wsErr?.message)
    const { error: keyErr } = await admin.from('workspaces').select('linear_api_key')
    check('OK-15', 'la clé API Linear n\'est pas lisible depuis le navigateur', !!keyErr)
  }

  console.log('\nTND-05 — effectif')
  {
    const { data } = await admin.rpc('get_dashboard_snapshot')
    const ids = (data?.employees ?? []).map((e) => e.id)
    check('TND-05a', 'les managers comptent dans l\'effectif', ids.includes(IDS.manager))
  }
}

try {
  await main()
} catch (e) {
  fail++
  console.error('ERROR', e)
} finally {
  if (created.length) await service.from('leave_requests').delete().in('id', created)
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
