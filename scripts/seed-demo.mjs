/**
 * Démo « équipe de 30 personnes » : 4 équipes avec leur manager, soldes de l'année,
 * et des demandes de congé dans tous les états (passées, en cours aujourd'hui,
 * à venir, en attente du manager, validées par le manager, refusées avec motif,
 * annulation demandée, annulées, demi-journées, maladie, vacances de Noël).
 * Vélocité (Linear) n'est pas touchée.
 *
 * Toutes les données de démo sont repérables : e-mails en @demo.tando.app,
 * équipes préfixées « Démo · ».
 *
 *   node --env-file=.env scripts/seed-demo.mjs           # crée / recrée la démo
 *   node --env-file=.env scripts/seed-demo.mjs --reset   # supprime la démo uniquement
 *
 * Variables : SUPABASE_URL + SUPABASE_SECRET_KEY (clé service, jamais côté navigateur).
 * Mot de passe des comptes de démo : DEMO_PASSWORD (défaut « Demo2026! »).
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? process.env.NUXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.NUXT_SUPABASE_SECRET_KEY
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo2026!'
const DOMAIN = 'demo.tando.app'
const TEAM_PREFIX = 'Démo · '

if (!URL || !KEY) {
  console.error('SUPABASE_URL et SUPABASE_SECRET_KEY sont requis.')
  process.exit(1)
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

// ── Petits outils ────────────────────────────────────────────────────────────
let seed = 20261105
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const pick = arr => arr[Math.floor(rnd() * arr.length)]
const pad = n => String(n).padStart(2, '0')
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d) }
const dow = s => new Date(`${s}T12:00:00`).getDay()
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '')
const TODAY = iso(new Date())
const YEAR = Number(TODAY.slice(0, 4))
/** next working day on or after s (week-ends and FR public holidays skipped) */
let HOLIDAYS = new Set()
const nextWorkday = (s) => { let d = s; while (dow(d) === 0 || dow(d) === 6 || HOLIDAYS.has(d)) d = addDays(d, 1); return d }

async function must(promise, what) {
  const { data, error } = await promise
  if (error) throw new Error(`${what} : ${error.message}`)
  return data
}

// ── Équipe de démo ───────────────────────────────────────────────────────────
const TEAMS = [
  { name: 'Produit', people: ['Camille Laurent*', 'Hugo Bernard', 'Léa Moreau', 'Nathan Petit', 'Chloé Garnier', 'Lucas Fontaine', 'Manon Rousseau', 'Paul Renaud'] },
  { name: 'Tech', people: ['Thomas Mercier*', 'Inès Dubois', 'Jules Lefèvre', 'Sarah Benali', 'Maxime Girard', 'Élise Faure', 'Yanis Haddad', 'Clara Roux', 'Antoine Vidal', 'Zoé Lambert'] },
  { name: 'Commercial', people: ['Julie Martin*', 'Romain Chevalier', 'Laura Blanc', 'Karim Mansouri', 'Pauline Robin', 'Bastien Leroy'] },
  { name: 'Support', people: ['Nadia Kone*', 'Victor Perrin', 'Emma Gauthier', 'Samuel Dupont', 'Alice Morel', 'Mehdi Ait'] },
]

async function reset() {
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const demo = (list?.users ?? []).filter(u => u.email?.endsWith(`@${DOMAIN}`))
  const ids = demo.map(u => u.id)
  if (ids.length) {
    await must(sb.from('notifications').delete().in('user_id', ids), 'notifications')
    await must(sb.from('notifications').delete().in('actor_id', ids), 'notifications (acteur)')
    await must(sb.from('leave_requests').delete().in('user_id', ids), 'demandes')
    await must(sb.from('leave_balances').delete().in('user_id', ids), 'soldes')
    for (const id of ids) {
      await sb.from('profiles').delete().eq('id', id)
      const { error } = await sb.auth.admin.deleteUser(id)
      if (error) throw new Error(`compte ${id} : ${error.message}`)
    }
  }
  await must(sb.from('teams').delete().like('name', `${TEAM_PREFIX}%`), 'équipes')
  console.log(`Démo supprimée : ${ids.length} comptes.`)
}

async function create() {
  await reset()

  const { data: admin } = await sb.from('profiles').select('id').eq('role', 'admin').order('joined_at').limit(1).single()
  if (!admin) throw new Error('Aucun admin dans la base : créez-en un avant la démo.')

  const types = await must(sb.from('leave_types').select('id, name').eq('is_active', true), 'types')
  const T = name => types.find(t => t.name === name)?.id
  const CP = T('Congé payé'); const RTT = T('RTT'); const SICK = T('Congé maladie')
  if (!CP) throw new Error('Le type « Congé payé » est introuvable.')

  const hol = await must(sb.from('public_holidays').select('day').eq('country', 'FR'), 'fériés')
  const holidays = new Set(hol.map(h => h.day))
  HOLIDAYS = holidays
  const working = (a, b) => { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) if (dow(d) % 6 !== 0 && !holidays.has(d)) n++; return n }

  // Comptes, profils, équipes
  const people = []
  for (const team of TEAMS) {
    const [tm] = await must(sb.from('teams').insert({ name: `${TEAM_PREFIX}${team.name}` }).select('id'), 'équipe')
    for (const raw of team.people) {
      const isManager = raw.endsWith('*')
      const full = raw.replace('*', '')
      const [first, ...rest] = full.split(' ')
      const last = rest.join(' ')
      const email = `${slug(first)}.${slug(last)}@${DOMAIN}`
      const { data: u, error } = await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { first_name: first, last_name: last } })
      if (error) throw new Error(`${email} : ${error.message}`)
      const joined = `${YEAR - 1 - Math.floor(rnd() * 3)}-${pad(1 + Math.floor(rnd() * 12))}-01`
      await must(sb.from('profiles').upsert({ id: u.user.id, first_name: first, last_name: last, role: isManager ? 'manager' : 'employee', team_id: tm.id, joined_at: joined, country: 'FR' }), `profil ${email}`)
      people.push({ id: u.user.id, first, last, email, team: team.name, teamId: tm.id, isManager })
    }
  }
  const managerOf = teamId => people.find(p => p.teamId === teamId && p.isManager)

  // Soldes : année en cours et suivante (les congés de Noël débordent sur janvier)
  const balances = []
  for (const p of people) for (const y of [YEAR, YEAR + 1]) {
    for (const t of types) {
      const allocated = t.id === CP ? 25 : t.id === RTT ? 10 : t.id === SICK ? 30 : 0
      if (allocated) balances.push({ user_id: p.id, leave_type_id: t.id, year: y, allocated_days: allocated, used_days: 0 })
    }
  }
  await must(sb.from('leave_balances').insert(balances), 'soldes')

  // Demandes
  const reqs = []
  const add = (p, type, start, end, status, extra = {}) => {
    start = nextWorkday(start)
    if (end < start) end = start
    const halfDay = extra.start_half || extra.end_half
    const days = halfDay && start === end ? 0.5 : working(start, end)
    if (!days) return
    const mgr = managerOf(p.teamId)
    const at = new Date().toISOString()
    // sent some days ago (so "waiting for N days" alerts show), never in the future
    const sent = new Date(Date.now() - (extra.sentDaysAgo ?? 1 + Math.floor(rnd() * 3)) * 86_400_000).toISOString()
    const row = { created_at: sent, user_id: p.id, leave_type_id: type, start_date: start, end_date: end, days_count: days, status, comment: extra.comment ?? null, start_half: !!extra.start_half, end_half: !!extra.end_half, review_comment: extra.review_comment ?? null }
    if (['approved', 'manager_approved', 'rejected', 'cancel_requested', 'cancelled'].includes(status) && !p.isManager && mgr) Object.assign(row, { manager_reviewed_by: mgr.id, manager_reviewed_at: at })
    if (['approved', 'rejected', 'cancel_requested', 'cancelled'].includes(status)) Object.assign(row, { admin_reviewed_by: admin.id, admin_reviewed_at: at })
    if (status === 'cancel_requested') row.cancel_requested_at = at
    if (status === 'cancelled') row.cancelled_at = at
    reqs.push(row)
  }

  const COMMENTS = ['Vacances en famille', 'Week-end prolongé', 'Mariage d’un proche', 'Déménagement', 'Voyage prévu depuis longtemps', 'Rendez-vous administratif', null, null]
  people.forEach((p, i) => {
    // Été et rentrée : 1 à 2 congés passés approuvés
    const summer = addDays(`${YEAR}-07-01`, Math.floor(rnd() * 50))
    add(p, CP, summer, addDays(summer, 4 + Math.floor(rnd() * 7)), 'approved', { comment: pick(COMMENTS) })
    if (rnd() < 0.5) { const s = addDays(`${YEAR}-09-15`, Math.floor(rnd() * 30)); add(p, RTT, s, s, 'approved') }

    // Profils variés pour la démo, selon la position dans la liste
    const r = i % 10
    if (r === 0) add(p, CP, addDays(TODAY, -2), addDays(TODAY, 3), 'approved', { comment: 'Vacances' }) // absent aujourd'hui
    if (r === 1) add(p, SICK ?? CP, addDays(TODAY, -1), addDays(TODAY, 1), 'approved') // maladie en cours
    if (r === 2) add(p, CP, addDays(TODAY, 9), addDays(TODAY, 13), 'pending', { comment: pick(COMMENTS), sentDaysAgo: i < 10 ? 6 : 2 }) // attend le manager (une depuis 6 jours)
    if (r === 3) add(p, RTT ?? CP, addDays(TODAY, 6), addDays(TODAY, 6), 'pending', { end_half: true }) // demi-journée en attente
    if (r === 4) add(p, CP, addDays(TODAY, 15), addDays(TODAY, 19), 'manager_approved', { comment: pick(COMMENTS) }) // validée par le manager
    if (r === 5) add(p, CP, addDays(TODAY, 20), addDays(TODAY, 24), 'approved') // à venir
    if (r === 6) add(p, CP, addDays(TODAY, 12), addDays(TODAY, 16), 'approved') // chevauche r=2 (même période)
    if (r === 7 && i < 20) add(p, CP, addDays(TODAY, 8), addDays(TODAY, 9), 'rejected', { review_comment: 'Mise en production cette semaine-là, merci de décaler.' })
    if (r === 8) add(p, CP, addDays(TODAY, 27), addDays(TODAY, 31), i < 10 ? 'cancel_requested' : 'cancelled')
    if (r === 9) add(p, RTT ?? CP, addDays(TODAY, 3), addDays(TODAY, 3), 'approved', { start_half: true }) // après-midi
    // Noël : la moitié de l'équipe pose la semaine du 21 au 31 décembre
    if (rnd() < 0.5) add(p, CP, `${YEAR}-12-21`, `${YEAR}-12-31`, rnd() < 0.8 ? 'approved' : 'pending', { comment: 'Fêtes de fin d’année' })
  })

  // Le trigger de solde vérifie chaque ligne : on insère une par une pour un message clair
  let ok = 0
  for (const row of reqs) {
    const { error } = await sb.from('leave_requests').insert(row)
    if (error) console.warn(`  ignorée (${row.start_date} → ${row.end_date}, ${row.status}) : ${error.message}`)
    else ok++
  }

  // Une insertion directe crée toujours une notif « demande envoyée » : on ne garde
  // que celles des demandes qui attendent vraiment quelqu'un.
  const { data: done } = await sb.from('leave_requests').select('id').in('user_id', people.map(p => p.id)).not('status', 'in', '(pending,manager_approved,cancel_requested)')
  const doneIds = (done ?? []).map(r => r.id)
  for (let k = 0; k < doneIds.length; k += 100) await must(sb.from('notifications').delete().in('request_id', doneIds.slice(k, k + 100)), 'notifications')

  console.log(`Démo créée : ${people.length} personnes, ${TEAMS.length} équipes, ${ok}/${reqs.length} demandes.`)
  console.log(`Connexion : <prénom>.<nom>@${DOMAIN} — managers : ${people.filter(p => p.isManager).map(p => p.email).join(', ')}`)
}

try {
  if (process.argv.includes('--reset')) await reset()
  else await create()
}
catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
