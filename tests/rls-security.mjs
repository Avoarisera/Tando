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
    // Pin Eddy's remaining balance to 4 working days for the test, restored below
    const { data: bal } = await service.from('leave_balances')
      .select('id, allocated_days, used_days').eq('user_id', IDS.eddy).eq('leave_type_id', IDS.congePaye)
      .eq('year', Y).single()
    await service.from('leave_balances').update({ allocated_days: Number(bal.used_days) + 4 }).eq('id', bal.id)
    const eddy = await signIn('employee2@waka.com')
    // Tue 1 → Thu 3 December = 3 working days; Mon 14 → Wed 16 = 3 more: 6 > 4
    const r1 = await eddy.rpc('create_leave_request', {
      p_leave_type_id: IDS.congePaye, p_start_date: dec(1), p_end_date: dec(3),
    })
    if (r1.data) created.push(r1.data)
    const r2 = await eddy.rpc('create_leave_request', {
      p_leave_type_id: IDS.congePaye, p_start_date: dec(14), p_end_date: dec(16),
    })
    if (r2.data) created.push(r2.data)
    await service.from('leave_balances').update({ allocated_days: bal.allocated_days }).eq('id', bal.id)
    check('TND-19a', 'pas de dépassement de solde via les demandes en attente', !r1.error && !!r2.error,
      r1.error ? `1re demande refusée: ${r1.error.message}` : '')
    const past = await eddy.rpc('create_leave_request', {
      p_leave_type_id: IDS.congePaye, p_start_date: `${Y}-01-05`, p_end_date: `${Y}-01-06`,
    })
    if (past.data) created.push(past.data)
    check('TND-19b', 'date de début passée refusée côté serveur', !!past.error)
  }

  console.log('\nR8 — jours ouvrés, annulation, motif, notifications, administration')
  {
    const eddy = await signIn('employee2@waka.com')
    // A. working days: Mon 21 → Mon 28 December has Christmas (FR) and a weekend
    const { data: n } = await emma.rpc('preview_leave_days', { p_start: dec(21), p_end: dec(28) })
    check('R8-A1', 'jours ouvrés : week-end et Noël exclus (21→28 déc. = 5 j)', Number(n) === 5, `reçu ${n}`)
    const { data: half } = await emma.rpc('preview_leave_days', { p_start: dec(21), p_end: dec(21), p_start_half: true })
    check('R8-A2', 'une demi-journée compte 0,5 j', Number(half) === 0.5, `reçu ${half}`)
    const wkend = await emma.rpc('create_leave_request', { p_leave_type_id: IDS.congePaye, p_start_date: dec(26), p_end_date: dec(27) })
    if (wkend.data) created.push(wkend.data)
    check('R8-A3', 'une période sans jour ouvré est refusée', !!wkend.error)

    // B. cancel / edit
    const { data: rid } = await emma.rpc('create_leave_request', { p_leave_type_id: IDS.congePaye, p_start_date: dec(16), p_end_date: dec(17) })
    if (rid) created.push(rid)
    const foreignCancel = await eddy.rpc('cancel_leave_request', { p_request_id: rid })
    const { data: still } = await service.from('leave_requests').select('status').eq('id', rid).single()
    check('R8-B1', 'un employé n\'annule pas la demande d\'un autre', !!foreignCancel.error && still?.status === 'pending')
    const foreignEdit = await eddy.rpc('update_leave_request', { p_request_id: rid, p_leave_type_id: IDS.congePaye, p_start_date: dec(16), p_end_date: dec(18) })
    check('R8-B2', 'un employé ne modifie pas la demande d\'un autre', !!foreignEdit.error)
    const edit = await emma.rpc('update_leave_request', { p_request_id: rid, p_leave_type_id: IDS.congePaye, p_start_date: dec(16), p_end_date: dec(18) })
    check('R8-B3', 'on modifie sa demande en attente (3 j)', !edit.error && Number(edit.data) === 3, edit.error?.message)
    const direct = await emma.from('leave_requests').update({ end_date: dec(31) }).eq('id', rid).select('id')
    check('R8-B4', 'pas de modification directe des dates', !!direct.error || (direct.data ?? []).length === 0)
    const own = await emma.rpc('cancel_leave_request', { p_request_id: rid })
    check('R8-B5', 'on annule sa demande en attente', own.data === 'cancelled', own.error?.message)
    // approved and started: cannot be cancelled
    const { data: past } = await service.from('leave_requests').insert({
      user_id: IDS.eddy, leave_type_id: IDS.congePaye, start_date: `${Y}-01-05`, end_date: `${Y}-01-06`, days_count: 2, status: 'approved',
    }).select('id').single()
    if (past?.id) created.push(past.id)
    const started = await eddy.rpc('cancel_leave_request', { p_request_id: past?.id })
    check('R8-B6', 'un congé commencé ne s\'annule pas', !!started.error)
    const notAdmin = await manager.rpc('review_cancellation', { p_request_id: past?.id, p_decision: 'approve' })
    check('R8-B7', 'seul l\'admin traite une annulation', !!notAdmin.error)

    // C. reason
    const { data: r2 } = await emma.rpc('create_leave_request', { p_leave_type_id: IDS.congePaye, p_start_date: dec(2), p_end_date: dec(2) })
    if (r2) created.push(r2)
    const noReason = await manager.rpc('review_leave_request', { p_request_id: r2, p_decision: 'reject' })
    check('R8-C1', 'refuser sans motif est impossible', !!noReason.error)
    const withReason = await manager.rpc('review_leave_request', { p_request_id: r2, p_decision: 'reject', p_comment: 'Lancement produit' })
    const { data: rr } = await emma.from('leave_requests').select('status, review_comment').eq('id', r2).single()
    check('R8-C2', 'le motif est enregistré et visible par la personne', !withReason.error && rr?.review_comment === 'Lancement produit', withReason.error?.message)

    // D. notifications
    const { data: mine } = await emma.from('notifications').select('user_id, kind')
    check('R8-D1', 'la personne est notifiée du refus', (mine ?? []).some(x => x.kind === 'rejected'))
    check('R8-D2', 'on ne lit que ses notifications', (mine ?? []).every(x => x.user_id === IDS.emma))
    const { data: mgr } = await manager.from('notifications').select('kind, request_id').eq('request_id', r2)
    check('R8-D3', 'le manager est notifié de la nouvelle demande', (mgr ?? []).some(x => x.kind === 'request_submitted'))
    const forge = await emma.from('notifications').insert({ user_id: IDS.manager, kind: 'approved' })
    check('R8-D4', 'personne ne crée de notification à la main', !!forge.error)
    const read = await emma.rpc('mark_notifications_read')
    check('R8-D5', 'on marque ses notifications comme lues', !read.error && Number(read.data) >= 1, read.error?.message)

    // E/F/G administration
    const promote = await emma.rpc('admin_update_profile', { p_id: IDS.emma, p_first_name: 'Emma', p_last_name: 'Employée', p_role: 'admin', p_team_id: null, p_country: 'FR', p_joined_at: null })
    check('R8-E1', 'un employé ne se nomme pas admin', !!promote.error)
    const { data: adminRow } = await service.from('profiles').select('id').eq('role', 'admin').limit(1).single()
    const demoteSelf = await admin.rpc('admin_update_profile', { p_id: adminRow?.id, p_first_name: 'Alice', p_last_name: 'Admin', p_role: 'employee', p_team_id: null, p_country: 'FR', p_joined_at: null })
    check('R8-E2', 'l\'admin ne retire pas son propre rôle', !!demoteSelf.error)
    const team = await manager.rpc('admin_upsert_team', { p_id: null, p_name: 'Équipe pirate' })
    check('R8-E3', 'un manager ne crée pas d\'équipe', !!team.error)
    const grab = await manager.rpc('admin_save_team', { p_id: null, p_name: 'Équipe pirate 2', p_manager_id: IDS.manager, p_member_ids: [IDS.emma] })
    check('TM-1', 'un manager ne compose pas d\'équipe (admin_save_team)', !!grab.error)
    const { data: anyTeam } = await service.from('teams').select('id').limit(1).single()
    const del = await emma.rpc('admin_delete_team', { p_id: anyTeam?.id })
    check('TM-2', 'un employé ne supprime pas d\'équipe', !!del.error)
    const withAdmin = await admin.rpc('admin_save_team', { p_id: null, p_name: 'Équipe avec admin', p_manager_id: null, p_member_ids: [adminRow?.id] })
    check('TM-3', 'un admin ne peut pas être membre d\'une équipe', !!withAdmin.error)
    const { count: teamsLeft } = await service.from('teams').select('id', { count: 'exact', head: true }).eq('id', anyTeam?.id)
    check('TM-4', 'l\'équipe n\'a pas été supprimée par l\'employé', teamsLeft === 1)
    const { data: settingsE } = await emma.from('company_settings').select('iban')
    check('R8-F1', 'un employé ne lit pas les paramètres (IBAN)', (settingsE ?? []).length === 0)
    const { data: settingsA, error: sErr } = await admin.from('company_settings').select('legal_name').single()
    check('R8-F2', 'l\'admin lit les paramètres', !sErr && settingsA !== null, sErr?.message)
    const ref = await emma.rpc('claim_invoice_reference')
    check('R8-G1', 'un employé ne réserve pas de numéro de facture', !!ref.error)
    const { data: lines } = await emma.from('invoice_lines').select('id')
    check('R8-G2', 'un employé ne lit aucune ligne de facture', (lines ?? []).length === 0)
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
