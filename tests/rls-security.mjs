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
    // TND-23: going over the balance no longer blocks the request…
    check('TND-23a', 'une demande au-delà du solde est acceptée en attente (plus bloquée)', !r1.error && !r2.error,
      r1.error?.message ?? r2.error?.message ?? '')
    const admin = await signIn('admin@waka.com')
    const manager = await signIn('manager@waka.com')
    if (r1.data) await admin.rpc('review_leave_request', { p_request_id: r1.data, p_decision: 'approve' })
    // …but a plain approval cannot overdraw it
    const plain = r2.data ? await admin.rpc('review_leave_request', { p_request_id: r2.data, p_decision: 'approve' }) : { error: { message: 'pas de demande' } }
    check('TND-23b', 'une approbation normale ne fait pas passer le solde en négatif', !!plain.error)
    const byManager = r2.data ? await manager.rpc('approve_leave_exception', { p_request_id: r2.data, p_reason: 'manager' }) : { error: {} }
    check('TND-23c', 'un manager ne peut pas accorder d\'exception', !!byManager.error)
    const byEmployee = r2.data ? await eddy.rpc('approve_leave_exception', { p_request_id: r2.data, p_reason: 'moi' }) : { error: {} }
    check('TND-23d', 'un employé ne peut pas s\'accorder une exception', !!byEmployee.error)
    const noReason = r2.data ? await admin.rpc('approve_leave_exception', { p_request_id: r2.data, p_reason: '  ' }) : { error: {} }
    check('TND-23e', 'le motif de l\'exception est obligatoire', !!noReason.error)
    const ok = r2.data ? await admin.rpc('approve_leave_exception', { p_request_id: r2.data, p_reason: 'Avance sur l\'an prochain' }) : { error: { message: 'pas de demande' } }
    const { data: after } = await service.from('leave_balances').select('allocated_days, used_days').eq('id', bal.id).single()
    const { data: req } = await service.from('leave_requests').select('status, is_exception').eq('id', r2.data ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
    check('TND-23f', 'l\'admin approuve à titre exceptionnel : demande marquée, solde négatif',
      !ok.error && req?.status === 'approved' && req?.is_exception === true && Number(after.allocated_days) - Number(after.used_days) < 0, ok.error?.message ?? '')
    // restore Eddy's balance (deleting the requests at the end does not give the days back)
    await service.from('leave_balances').update({ allocated_days: bal.allocated_days, used_days: bal.used_days }).eq('id', bal.id)
    // TND-23: a type without balance needs no balance row
    const { data: sick } = await service.from('leave_types').select('id').eq('tracks_balance', false).limit(1).maybeSingle()
    if (sick) {
      await service.from('leave_balances').delete().eq('user_id', IDS.eddy).eq('leave_type_id', sick.id).eq('year', Y)
      const s1 = await eddy.rpc('create_leave_request', { p_leave_type_id: sick.id, p_start_date: dec(21), p_end_date: dec(22) })
      if (s1.data) created.push(s1.data)
      check('TND-23g', 'un type sans décompte se pose sans solde configuré', !s1.error, s1.error?.message ?? '')
    }
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
    const { data: adm } = await admin.from('notifications').select('kind').eq('request_id', r2)
    check('R8-D6', 'l\'admin est notifié dès l\'envoi de la demande', (adm ?? []).some(x => x.kind === 'request_submitted'))
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

  console.log('\nTND-26 — espace manager')
  {
    // Fixture: a workspace with two Linear teams; the manager's team is linked to « API » only
    const { data: ws } = await service.from('workspaces').insert({ user_id: (await admin.auth.getUser()).data.user.id, name: 'sec-ws', linear_api_key: 'lin_secret_sec' }).select('id').single()
    await service.from('linear_teams').insert([{ id: 'sec-api', workspace_id: ws.id, name: 'API' }, { id: 'sec-ui', workspace_id: ws.id, name: 'UI' }])
    await service.from('linear_issues').insert([
      { id: 'sec-i1', workspace_id: ws.id, identifier: 'API-1', title: 'a', team_id: 'sec-api', status: 'Done', assignee_id: 'sec-u-emma' },
      { id: 'sec-i2', workspace_id: ws.id, identifier: 'UI-1', title: 'b', team_id: 'sec-ui', status: 'Done', assignee_id: 'sec-u-emma' },
      { id: 'sec-i3', workspace_id: ws.id, identifier: 'API-2', title: 'c', team_id: 'sec-api', status: 'Done', assignee_id: 'sec-u-other' },
      { id: 'sec-i4', workspace_id: ws.id, identifier: 'API-3', title: 'd', team_id: 'sec-api', status: 'Done' },
    ])
    await service.from('linear_users').insert([{ id: 'sec-u-emma', workspace_id: ws.id, display_name: 'emma' }, { id: 'sec-u-other', workspace_id: ws.id, display_name: 'other' }])
    await service.from('profiles').update({ linear_user_id: 'sec-u-emma' }).eq('id', IDS.emma)
    const { data: mgr } = await service.from('profiles').select('team_id').eq('id', IDS.manager).single()
    const { error: linkE } = await manager.from('team_linear_teams').insert({ team_id: mgr.team_id, workspace_id: ws.id, linear_team_id: 'sec-ui' })
    check('TND-26a', 'un manager ne relie pas lui-même son équipe à Linear', !!linkE)
    await admin.from('team_linear_teams').insert({ team_id: mgr.team_id, workspace_id: ws.id, linear_team_id: 'sec-api' })
    try {
      const { data: mi } = await manager.from('linear_issues').select('id').eq('workspace_id', ws.id)
      const got = (mi ?? []).map(r => r.id)
      check('TND-26b', 'le manager lit les tickets de l\'équipe Linear reliée', got.includes('sec-i1'))
      check('TND-26c', 'le manager ne lit pas les tickets d\'une équipe non reliée', !got.includes('sec-i2'))
      check('TND-26j', 'le manager ne lit pas les tickets d\'une personne hors de son équipe', !got.includes('sec-i3') && !got.includes('sec-i4'))
      const { data: mu } = await manager.from('linear_users').select('id').eq('workspace_id', ws.id)
      check('TND-26k', 'le manager ne voit que les comptes Linear de son équipe', (mu ?? []).length === 1 && mu[0].id === 'sec-u-emma')
      const { data: mw } = await manager.from('workspaces').select('id').eq('id', ws.id)
      check('TND-26d', 'le manager ne lit pas le workspace (clé API)', (mw ?? []).length === 0)
      const { data: ek } = await emma.from('linear_issues').select('id').eq('workspace_id', ws.id)
      check('TND-26e', 'un employé ne lit aucun ticket Linear', (ek ?? []).length === 0)
      const { data: vt } = await manager.rpc('velocity_teams')
      check('TND-26f', 'velocity_teams du manager : seulement l\'équipe reliée', (vt ?? []).length === 1 && vt[0].team_id === 'sec-api' && !('linear_api_key' in vt[0]))
      const { data: snap } = await manager.rpc('get_dashboard_snapshot')
      check('TND-26g', 'le tableau de bord du manager se limite à son équipe', !!snap && (snap.employees ?? []).every(e => e.team_name === (snap.employees[0]?.team_name)))
      const { error: snapE } = await emma.rpc('get_dashboard_snapshot')
      check('TND-26h', 'un employé n\'a pas de tableau de bord', !!snapE)
      const { error: luE } = await manager.rpc('admin_set_linear_user', { p_id: IDS.emma, p_linear_user_id: 'x' })
      check('TND-26i', 'un manager ne relie pas une personne à Linear', !!luE)
    }
    finally {
      await service.from('profiles').update({ linear_user_id: null }).eq('id', IDS.emma)
      await service.from('linear_users').delete().eq('workspace_id', ws.id)
      await service.from('team_linear_teams').delete().eq('workspace_id', ws.id)
      await service.from('linear_issues').delete().eq('workspace_id', ws.id)
      await service.from('linear_teams').delete().eq('workspace_id', ws.id)
      await service.from('workspaces').delete().eq('id', ws.id)
    }
  }

  console.log('\nTND-30 — recrutement')
  {
    const { data: mgr } = await service.from('profiles').select('id').eq('id', IDS.manager).single()
    const { data: ops } = await service.from('job_openings').insert([
      { slug: `sec-pub-${Date.now()}`, title: 'Sec publiée', status: 'published', hiring_manager_id: null },
      { slug: `sec-draft-${Date.now()}`, title: 'Sec brouillon', status: 'draft' },
      { slug: `sec-mgr-${Date.now()}`, title: 'Sec manager', status: 'published', hiring_manager_id: mgr.id },
    ]).select('id, title')
    const [pub, draft, mine] = ops
    const { data: cand } = await service.from('candidates').insert({ email: `sec.${Date.now()}@example.com`, first_name: 'Sec', last_name: 'Cand' }).select('id').single()
    const { data: apps } = await service.from('applications').insert([
      { opening_id: pub.id, candidate_id: cand.id },
      { opening_id: mine.id, candidate_id: cand.id },
    ]).select('id, opening_id')
    try {
      const { data: aOpen } = await anon.from('job_openings').select('id, title').in('id', [pub.id, draft.id])
      check('TND-30a', 'un visiteur lit les offres publiées, pas les brouillons', (aOpen ?? []).length === 1 && aOpen[0].id === pub.id)
      const { error: aMgr } = await anon.from('job_openings').select('hiring_manager_id').eq('id', pub.id)
      check('TND-30b', 'un visiteur ne lit pas le manager recruteur ni les colonnes internes', !!aMgr)
      const { data: aApps } = await anon.from('applications').select('id')
      const { data: aCand } = await anon.from('candidates').select('id')
      check('TND-30c', 'un visiteur ne lit ni candidatures ni candidats', (aApps ?? []).length === 0 && (aCand ?? []).length === 0)
      const { error: aIns } = await anon.from('applications').insert({ opening_id: pub.id, candidate_id: cand.id })
      check('TND-30d', 'un visiteur ne crée pas de candidature en direct (route serveur obligatoire)', !!aIns)
      const { data: eApps } = await emma.from('applications').select('id')
      check('TND-30e', 'un employé ne lit aucune candidature', (eApps ?? []).length === 0)
      const { error: eOp } = await emma.from('job_openings').insert({ slug: `sec-x-${Date.now()}`, title: 'Pirate' })
      check('TND-30f', 'un employé ne crée pas d\'offre', !!eOp)
      const { data: mApps } = await manager.from('applications').select('id, opening_id')
      check('TND-30g', 'le manager recruteur ne voit que les candidatures de ses offres', (mApps ?? []).length === 1 && mApps[0].opening_id === mine.id)
      const { error: mNote } = await manager.from('application_events').insert({ application_id: apps.find(a => a.opening_id === pub.id).id, actor_id: mgr.id, kind: 'note', data: { text: 'x' } })
      check('TND-30h', 'le manager n\'écrit pas de note sur une offre qui n\'est pas la sienne', !!mNote)
      const { error: eHr } = await emma.rpc('admin_set_hr', { p_id: IDS.emma, p_is_hr: true })
      check('TND-30i', 'un employé ne se donne pas l\'accès RH', !!eHr)
      const { data: aFile, error: aFileErr } = await anon.storage.from('applications').list(pub.id)
      check('TND-30j', 'le stockage des CV est privé', !!aFileErr || (aFile ?? []).length === 0)
      const { data: aRows } = await admin.from('applications').select('id').in('id', apps.map(a => a.id))
      check('TND-30k', 'l\'admin (RH) lit toutes les candidatures', (aRows ?? []).length === 2)
    }
    finally {
      await service.from('applications').delete().in('id', apps.map(a => a.id))
      await service.from('candidates').delete().eq('id', cand.id)
      await service.from('job_openings').delete().in('id', ops.map(o => o.id))
    }
  }

  console.log('\nTND-30 lot 2 — entretiens, évaluations, modèles')
  {
    const adminId = (await admin.auth.getUser()).data.user.id
    const { data: op } = await service.from('job_openings').insert({ slug: `sec-l2-${Date.now()}`, title: 'Sec lot 2', status: 'published', criteria: [{ id: 'c1', label: 'Tech' }] }).select('id').single()
    const { data: c1 } = await service.from('candidates').insert({ email: `l2a.${Date.now()}@example.com`, first_name: 'A', last_name: 'One' }).select('id').single()
    const { data: c2 } = await service.from('candidates').insert({ email: `l2b.${Date.now()}@example.com`, first_name: 'B', last_name: 'Two' }).select('id').single()
    const { data: a1 } = await service.from('applications').insert({ opening_id: op.id, candidate_id: c1.id }).select('id').single()
    const { data: a2 } = await service.from('applications').insert({ opening_id: op.id, candidate_id: c2.id }).select('id').single()
    const { data: itv } = await service.from('interviews').insert({ application_id: a1.id, stage_key: 'tech', starts_at: new Date(Date.now() + 86400000).toISOString() }).select('id').single()
    await service.from('interview_participants').insert({ interview_id: itv.id, profile_id: IDS.emma })
    // a recruiter's submitted scorecard on a1
    await service.from('scorecards').insert({ application_id: a1.id, author_id: adminId, stage_key: 'tech', ratings: { c1: 2 }, recommendation: 'no', submitted_at: new Date().toISOString() })
    try {
      const { data: eApps } = await emma.from('applications').select('id').eq('opening_id', op.id)
      check('TND-30l', 'l\'intervenante invitée voit le candidat qu\'elle rencontre, pas les autres', (eApps ?? []).length === 1 && eApps[0].id === a1.id)
      const { data: eOp } = await emma.from('job_openings').select('id, criteria').eq('id', op.id)
      check('TND-30m', 'elle lit l\'offre (critères) de ce candidat', (eOp ?? []).length === 1)
      const { data: before } = await emma.from('scorecards').select('id').eq('application_id', a1.id)
      check('TND-30n', 'elle ne voit pas les évaluations des autres avant d\'envoyer la sienne', (before ?? []).length === 0)
      const { error: insE } = await emma.from('scorecards').insert({ application_id: a1.id, author_id: IDS.emma, stage_key: 'tech', ratings: { c1: 4 }, recommendation: 'yes', submitted_at: new Date().toISOString() })
      const { data: after } = await emma.from('scorecards').select('id, author_id').eq('application_id', a1.id)
      check('TND-30o', 'après envoi, elle voit les évaluations des autres', !insE && (after ?? []).length === 2)
      const { data: upd } = await emma.from('scorecards').update({ recommendation: 'strong_yes' }).eq('author_id', IDS.emma).select('id')
      check('TND-30p', 'une évaluation envoyée n\'est plus modifiable', (upd ?? []).length === 0)
      const { error: forge } = await emma.from('scorecards').insert({ application_id: a1.id, author_id: adminId, stage_key: 'hr', ratings: {}, recommendation: 'yes' })
      check('TND-30q', 'personne n\'écrit une évaluation au nom d\'un autre', !!forge)
      const { error: other } = await emma.from('scorecards').insert({ application_id: a2.id, author_id: IDS.emma, stage_key: 'tech', ratings: {} })
      check('TND-30r', 'pas d\'évaluation sur un candidat qu\'on ne rencontre pas', !!other)
      const { data: eddyApps } = await (await signIn('employee2@waka.com')).from('applications').select('id').eq('opening_id', op.id)
      check('TND-30s', 'un employé non invité ne voit aucun candidat', (eddyApps ?? []).length === 0)
      const { data: eTpl } = await emma.from('email_templates').select('key')
      const { data: eTplUp } = await emma.from('email_templates').update({ subject: 'pirate' }).eq('key', 'rejection').select('key')
      check('TND-30t', 'un employé ne lit ni ne modifie les modèles d\'e-mails', (eTpl ?? []).length === 0 && (eTplUp ?? []).length === 0)
      const { data: aTpl } = await admin.from('email_templates').select('key')
      check('TND-30u', 'le RH lit les 4 modèles', (aTpl ?? []).length === 4)
    }
    finally {
      await service.from('applications').delete().in('id', [a1.id, a2.id])
      await service.from('candidates').delete().in('id', [c1.id, c2.id])
      await service.from('job_openings').delete().eq('id', op.id)
    }
  }

  console.log('\nTND-30 lots 3–4 — purge RGPD, réglages e-mail')
  {
    const { data: ms, error: msErr } = await admin.from('mail_settings').select('*')
    check('TND-30v', 'même un admin ne lit pas les réglages e-mail en direct (route serveur seulement)', !!msErr || (ms ?? []).length === 0)
    const { data: k, error: kErr } = await admin.rpc('get_mail_secret')
    check('TND-30w', 'le mot de passe SMTP n\'est lisible par aucun utilisateur connecté', !!kErr && !k)
    const { error: setErr } = await admin.rpc('set_mail_secret', { p_secret: 'pirate' })
    check('TND-30x', 'aucun utilisateur connecté ne remplace le mot de passe en direct', !!setErr)
    const { data: jr, error: jrErr } = await admin.from('job_runs').select('*')
    check('TND-30y', 'le journal des tâches n\'est pas lisible depuis le navigateur', !!jrErr || (jr ?? []).length === 0)
    // purge date follows the last contact (+ 2 years)
    const { data: op } = await service.from('job_openings').insert({ slug: `sec-l3-${Date.now()}`, title: 'Sec lot 3', status: 'published' }).select('id').single()
    const { data: c } = await service.from('candidates').insert({ email: `l3.${Date.now()}@example.com`, first_name: 'Old', last_name: 'One' }).select('id').single()
    const { data: a } = await service.from('applications').insert({ opening_id: op.id, candidate_id: c.id, last_contact_at: '2023-01-15T10:00:00Z', status: 'rejected' }).select('id, purge_after').single()
    try {
      check('TND-30z', 'la date de suppression suit le dernier contact (+ 2 ans)', a.purge_after === '2025-01-15')
    }
    finally {
      await service.from('applications').delete().eq('id', a.id)
      await service.from('candidates').delete().eq('id', c.id)
      await service.from('job_openings').delete().eq('id', op.id)
    }
  }

  console.log('\nTND-29 — évaluations')
  {
    const eddy = await signIn('employee2@waka.com')
    const { data: tpl } = await service.from('review_templates').select('id').eq('kind', 'annual').limit(1).single()
    const { data: cy } = await admin.from('review_cycles').insert({ name: `Sec revue ${Date.now()}`, period_start: '2026-01-01', period_end: '2026-12-31', template_id: tpl.id }).select('id').single()
    const { error: eLaunch } = await emma.rpc('launch_review_cycle', { p_cycle: cy.id, p_people: [IDS.emma] })
    check('TND-29a', 'un employé ne lance pas de campagne', !!eLaunch)
    const { data: n } = await admin.rpc('launch_review_cycle', { p_cycle: cy.id, p_people: [IDS.emma, IDS.eddy] })
    const { data: packets } = await service.from('review_packets').select('id, employee_id, manager_id').eq('cycle_id', cy.id)
    const pE = packets.find(p => p.employee_id === IDS.emma)
    const pD = packets.find(p => p.employee_id === IDS.eddy)
    try {
      check('TND-29b', 'le lancement crée un dossier par personne avec son manager d\'équipe', n === 2 && pE.manager_id === IDS.manager)
      const { data: direct } = await emma.from('review_packets').select('id')
      check('TND-29c', 'un employé ne lit aucun dossier en direct', (direct ?? []).length === 0)
      const { data: mineE } = await emma.rpc('my_review_packets')
      check('TND-29d', 'l\'employée ne voit que son dossier (et pas celui d\'un collègue)', (mineE ?? []).filter(x => x.cycle_id === cy.id).length === 1)
      // Emma submits her self review
      const { error: selfErr } = await emma.from('review_responses').insert({ packet_id: pE.id, author_id: IDS.emma, role: 'self', ratings: { quality: 4 }, submitted_at: new Date().toISOString() })
      check('TND-29e', 'l\'employée envoie son auto-évaluation', !selfErr, selfErr?.message)
      const { error: asMgr } = await emma.from('review_responses').insert({ packet_id: pE.id, author_id: IDS.emma, role: 'manager', ratings: {} })
      check('TND-29f', 'l\'employée ne remplit pas la partie du manager', !!asMgr)
      const { error: onOther } = await emma.from('review_responses').insert({ packet_id: pD.id, author_id: IDS.emma, role: 'self', ratings: {} })
      check('TND-29g', 'personne ne remplit le dossier d\'un collègue', !!onOther)
      const { data: upd } = await emma.from('review_responses').update({ ratings: { quality: 1 } }).eq('packet_id', pE.id).eq('role', 'self').select('id')
      check('TND-29h', 'une auto-évaluation envoyée n\'est plus modifiable', (upd ?? []).length === 0)
      const { data: mgrSeesBefore } = await manager.from('review_responses').select('id').eq('packet_id', pE.id).eq('role', 'self')
      check('TND-29i', 'le manager ne voit pas l\'auto-évaluation avant d\'envoyer la sienne', (mgrSeesBefore ?? []).length === 0)
      await manager.from('review_responses').insert({ packet_id: pE.id, author_id: IDS.manager, role: 'manager', ratings: { quality: 2 }, submitted_at: new Date().toISOString() })
      const { data: mgrSeesAfter } = await manager.from('review_responses').select('id').eq('packet_id', pE.id).eq('role', 'self')
      check('TND-29j', 'après envoi, le manager voit l\'auto-évaluation', (mgrSeesAfter ?? []).length === 1)
      const { data: empSeesMgr } = await emma.from('review_responses').select('id').eq('packet_id', pE.id).eq('role', 'manager')
      check('TND-29k', 'l\'employée ne voit pas l\'évaluation du manager avant le partage', (empSeesMgr ?? []).length === 0)
      const { data: eddySees } = await eddy.from('review_responses').select('id').eq('packet_id', pE.id)
      check('TND-29l', 'un collègue ne voit rien du dossier', (eddySees ?? []).length === 0)
      const { error: eConclude } = await emma.rpc('hr_conclude_review', { p_packet: pE.id, p_rating: 4, p_strengths: 'moi', p_improvements: '', p_objectives: [] })
      const { error: mShare } = await manager.rpc('share_review', { p_packet: pE.id })
      check('TND-29m', 'ni l\'employée ni le manager ne concluent ou ne partagent', !!eConclude && !!mShare)
      await admin.rpc('hr_conclude_review', { p_packet: pE.id, p_rating: 3, p_strengths: 'Fiable', p_improvements: 'Autonomie', p_objectives: [] })
      const { data: beforeShare } = await emma.rpc('my_review_packets')
      const bs = (beforeShare ?? []).find(x => x.id === pE.id)
      check('TND-29n', 'la conclusion RH reste cachée tant que le dossier n\'est pas partagé', bs && bs.hr_rating === null && bs.hr_strengths === '')
      const { error: earlyAck } = await emma.rpc('acknowledge_review', { p_packet: pE.id, p_comment: 'x' })
      check('TND-29o', 'pas de signature avant le partage', !!earlyAck)
      await admin.rpc('share_review', { p_packet: pE.id })
      const { data: afterShare } = await emma.rpc('my_review_packets')
      const as = (afterShare ?? []).find(x => x.id === pE.id)
      const { data: empSeesMgr2 } = await emma.from('review_responses').select('id').eq('packet_id', pE.id).eq('role', 'manager')
      check('TND-29p', 'après partage, l\'employée voit la conclusion et l\'évaluation du manager', as?.hr_rating === 3 && (empSeesMgr2 ?? []).length === 1)
      const { error: eddyAck } = await eddy.rpc('acknowledge_review', { p_packet: pE.id, p_comment: 'pirate' })
      check('TND-29q', 'personne ne signe le dossier d\'un autre', !!eddyAck)
      const { error: ack } = await emma.rpc('acknowledge_review', { p_packet: pE.id, p_comment: 'Lu' })
      const { error: ack2 } = await emma.rpc('acknowledge_review', { p_packet: pE.id, p_comment: 'encore' })
      check('TND-29r', 'l\'employée signe une seule fois', !ack && !!ack2)
      const { error: lateWrite } = await emma.from('review_responses').insert({ packet_id: pE.id, author_id: IDS.emma, role: 'self', ratings: {} })
      check('TND-29s', 'plus aucune saisie après le partage', !!lateWrite)
    }
    finally {
      await service.from('review_cycles').delete().eq('id', cy.id)
      await service.from('notifications').delete().in('kind', ['review_requested', 'review_shared'])
    }
  }

  console.log('\nTND-29 lot 2 — retours des collègues (anonymat)')
  {
    const eddy = await signIn('employee2@waka.com')
    // two temporary colleagues: 3 peers are needed for anonymity
    const temp = []
    for (const n of [1, 2]) {
      const email = `sec-peer${n}-${Date.now()}@waka.com`
      const { data: u } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
      await service.from('profiles').insert({ id: u.user.id, first_name: `Pair${n}`, last_name: 'Test', role: 'employee', joined_at: '2024-01-01' })
      temp.push({ id: u.user.id, client: await signIn(email) })
    }
    const [p1, p2] = temp
    const { data: tpl } = await service.from('review_templates').select('id').eq('kind', 'annual').limit(1).single()
    const { data: cy } = await admin.from('review_cycles').insert({ name: `Sec 360 ${Date.now()}`, period_start: '2026-01-01', period_end: '2026-12-31', template_id: tpl.id, peers_enabled: true }).select('id').single()
    await admin.rpc('launch_review_cycle', { p_cycle: cy.id, p_people: [IDS.emma] })
    const { data: pk } = await service.from('review_packets').select('id').eq('cycle_id', cy.id).single()
    const peerRow = (who, rating, txt) => ({ packet_id: pk.id, author_id: who, role: 'peer', ratings: { collaboration: rating }, comments: { collaboration: txt }, answers: { keep: txt }, submitted_at: new Date().toISOString() })
    try {
      const { error: ePropose } = await emma.rpc('propose_peers', { p_packet: pk.id, p_peers: [IDS.eddy, p1.id, p2.id] })
      check('TND-29t', 'l\'employée ne propose plus ses collègues (TND-33 : choix RH)', !!ePropose)
      const { error: tooFew } = await admin.rpc('approve_peers', { p_packet: pk.id, p_peers: [IDS.eddy, p1.id] })
      check('TND-29u', 'moins de 3 collègues est refusé', !!tooFew)
      const { error: selfPick } = await admin.rpc('approve_peers', { p_packet: pk.id, p_peers: [IDS.emma, IDS.eddy, p1.id] })
      const { error: mgrPick } = await admin.rpc('approve_peers', { p_packet: pk.id, p_peers: [IDS.manager, IDS.eddy, p1.id] })
      check('TND-29v', 'ni la personne ni son manager comme collègue', !!selfPick && !!mgrPick)
      const { error: early } = await eddy.from('review_responses').insert(peerRow(IDS.eddy, 3, 'trop tôt'))
      check('TND-29w', 'un collègue non choisi ne répond pas', !!early)
      const { error: selfApprove } = await emma.rpc('approve_peers', { p_packet: pk.id, p_peers: [IDS.eddy, p1.id, p2.id] })
      const { error: mgrApprove } = await manager.rpc('approve_peers', { p_packet: pk.id, p_peers: [IDS.eddy, p1.id, p2.id] })
      const { error: peerApprove } = await eddy.rpc('approve_peers', { p_packet: pk.id, p_peers: [IDS.eddy, p1.id, p2.id] })
      check('TND-29x', 'ni l\'employée, ni le manager, ni un collègue ne choisissent la liste', !!selfApprove && !!mgrApprove && !!peerApprove)
      const { error: okApprove } = await admin.rpc('approve_peers', { p_packet: pk.id, p_peers: [IDS.eddy, p1.id, p2.id] })
      check('TND-29y', 'le RH choisit les collègues', !okApprove, okApprove?.message)
      const [{ data: nE }, { data: nM }, { data: cE }] = await Promise.all([
        emma.from('review_nominations').select('peer_id').eq('packet_id', pk.id),
        manager.from('review_nominations').select('peer_id').eq('packet_id', pk.id),
        emma.rpc('review_nomination_list', { p_packet: pk.id }),
      ])
      check('TND-29z', 'ni l\'employée ni le manager ne voient qui est sollicité', !(nE ?? []).length && !(nM ?? []).length && !(cE ?? []).length)
      const { data: sum } = await admin.rpc('cycle_peer_summary', { p_cycle: cy.id })
      const { data: sumE } = await emma.rpc('cycle_peer_summary', { p_cycle: cy.id })
      check('TND-29aa', 'le suivi des collègues par dossier est réservé au RH', sum?.[0]?.chosen === 3 && !(sumE ?? []).length)
      const { data: reqs } = await eddy.rpc('my_peer_requests')
      check('TND-29ab', 'le collègue voit la demande, sans les réponses des autres', (reqs ?? []).some(r => r.packet_id === pk.id))
      const { error: eddyWrite } = await eddy.from('review_responses').insert(peerRow(IDS.eddy, 4, 'Très fiable en revue de code'))
      check('TND-29ac', 'le collègue validé envoie son retour', !eddyWrite, eddyWrite?.message)
      const { error: mgrAsPeer } = await manager.from('review_responses').insert(peerRow(IDS.manager, 1, 'usurpation'))
      const { error: asOther } = await p1.client.from('review_responses').insert(peerRow(IDS.eddy, 1, 'au nom d\'un autre'))
      check('TND-29ad', 'personne d\'autre n\'écrit un retour collègue (ni au nom d\'un autre)', !!mgrAsPeer && !!asOther)
      const reads = await Promise.all([emma, manager, admin, p1.client].map(c => c.from('review_responses').select('id').eq('packet_id', pk.id).eq('role', 'peer')))
      const { data: own } = await eddy.from('review_responses').select('id').eq('packet_id', pk.id).eq('role', 'peer')
      check('TND-29ae', 'un retour collègue n\'est lisible que par son auteur (pas l\'employée, le manager, le RH ni un autre collègue)', reads.every(r => (r.data ?? []).length === 0) && (own ?? []).length === 1)
      const { data: fb1 } = await admin.rpc('peer_feedback', { p_packet: pk.id })
      check('TND-29af', 'sous 3 réponses, rien n\'est montré au RH', fb1?.shown === false && fb1.count === 1 && !fb1.comments && !fb1.averages)
      const { error: empEarly } = await emma.rpc('peer_feedback', { p_packet: pk.id })
      const { error: mgrEarly } = await manager.rpc('peer_feedback', { p_packet: pk.id })
      check('TND-29ag', 'avant le partage, ni l\'employée ni le manager ne lisent la synthèse', !!empEarly && !!mgrEarly)
      const { data: stE } = await emma.rpc('peer_status', { p_packet: pk.id })
      const { data: stH } = await admin.rpc('peer_status', { p_packet: pk.id })
      check('TND-29ah', 'qui a répondu : visible du RH seulement', (stE ?? []).length === 0 && (stH ?? []).filter(x => x.answered).length === 1)
      await p1.client.from('review_responses').insert(peerRow(p1.id, 2, 'Communique peu sur ses blocages'))
      await p2.client.from('review_responses').insert(peerRow(p2.id, 3, 'Toujours disponible'))
      const { data: fb3 } = await admin.rpc('peer_feedback', { p_packet: pk.id })
      const flat = JSON.stringify(fb3)
      check('TND-29ai', 'à 3 réponses : moyenne et commentaires, sans aucun identifiant d\'auteur', fb3?.shown === true && Number(fb3.averages?.collaboration) === 3 && fb3.comments?.collaboration?.length === 3 && ![IDS.eddy, p1.id, p2.id].some(id => flat.includes(id)))
      await admin.rpc('hr_conclude_review', { p_packet: pk.id, p_rating: 3, p_strengths: 'x', p_improvements: 'y', p_objectives: [] })
      await admin.rpc('share_review', { p_packet: pk.id })
      const { data: fbE } = await emma.rpc('peer_feedback', { p_packet: pk.id })
      const { data: fbD } = await eddy.rpc('peer_feedback', { p_packet: pk.id }).then(r => r, () => ({ data: null }))
      check('TND-29aj', 'après partage, l\'employée voit la synthèse anonyme ; un collègue jamais', fbE?.shown === true && !fbD?.shown)
      const { error: lateEdit } = await eddy.from('review_responses').update({ comments: { collaboration: 'changé' } }).eq('packet_id', pk.id).eq('author_id', IDS.eddy).select('id').then(r => ({ error: (r.data ?? []).length ? null : 'blocked' }))
      check('TND-29ak', 'un retour envoyé n\'est plus modifiable', !!lateEdit)
    }
    finally {
      await service.from('review_cycles').delete().eq('id', cy.id)
      await service.from('notifications').delete().in('kind', ['review_requested', 'review_shared', 'review_peers_proposed', 'review_peer_requested'])
      for (const u of temp) { await service.from('profiles').delete().eq('id', u.id); await service.auth.admin.deleteUser(u.id) }
    }
  }
}

async function tnd32() {
  console.log('\nTND-32 — modèles d’offre et e-mails')
  const emma = await signIn('employee1@waka.com')
  const { data: seen } = await emma.from('job_templates').select('id')
  check('TND-32a', 'un employé ne lit pas les modèles d’offre', (seen ?? []).length === 0)
  const { error: w } = await emma.from('job_templates').insert({ name: 'pirate', content: {} })
  check('TND-32b', 'un employé ne crée pas de modèle d’offre', !!w)
  const { data: anonSeen } = await anon.from('job_templates').select('id')
  check('TND-32c', 'un visiteur ne lit pas les modèles d’offre', (anonSeen ?? []).length === 0)
  const { data: upd, error: col } = await emma.from('notifications').update({ emailed_at: null }).eq('user_id', IDS.emma).select('id')
  check('TND-32d', 'un utilisateur ne modifie pas l’état d’envoi des e-mails', !!col || (upd ?? []).length === 0)
}

try {
  await main()
  await tnd32()
} catch (e) {
  fail++
  console.error('ERROR', e)
} finally {
  if (created.length) await service.from('leave_requests').delete().in('id', created)
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
