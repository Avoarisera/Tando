import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMail } from './mailer'
import { professionalDue, reminderPhase } from '../../app/utils/reviews'

type Task = 'self' | 'manager' | 'peer'
interface Cycle { id: string, name: string, status: string, peers_enabled: boolean, self_due: string | null, manager_due: string | null, peer_due: string | null }

async function emailsOf(supabase: SupabaseClient, ids: string[]) {
  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const emails = new Map((users?.users ?? []).map(u => [u.id, u.email ?? '']))
  const { data: names } = await supabase.from('profiles').select('id, first_name').in('id', ids)
  return { emails, first: (id: string) => names?.find(n => n.id === id)?.first_name ?? '' }
}

/**
 * Everyone still late in an active campaign (self review, manager review, peer
 * feedback — or only the given tasks) gets an in-app notification and an e-mail.
 * Never says who else is late. Shared by the HR button and the cron (TND-35).
 */
export async function remindLate(supabase: SupabaseClient, cycle: Cycle, site: string, actorId: string | null, only?: Task[]) {
  const { data: packets } = await supabase.from('review_packets').select('id, employee_id, manager_id').eq('cycle_id', cycle.id).is('shared_at', null)
  const ids = (packets ?? []).map(p => p.id)
  if (!ids.length) return { people: 0, emailed: 0 }
  const { data: resp } = await supabase.from('review_responses').select('packet_id, author_id, role').in('packet_id', ids).not('submitted_at', 'is', null)
  const { data: noms } = cycle.peers_enabled ? await supabase.from('review_nominations').select('packet_id, peer_id').in('packet_id', ids).eq('status', 'approved') : { data: [] }
  const done = new Set((resp ?? []).map(r => `${r.packet_id}:${r.author_id}:${r.role}`))
  const late = new Map<string, Set<Task>>()
  const add = (who: string | null, task: Task) => { if (who && (!only || only.includes(task))) late.set(who, (late.get(who) ?? new Set()).add(task)) }
  for (const p of packets ?? []) {
    if (!done.has(`${p.id}:${p.employee_id}:self`)) add(p.employee_id, 'self')
    if (p.manager_id && !done.has(`${p.id}:${p.manager_id}:manager`)) add(p.manager_id, 'manager')
  }
  for (const n of noms ?? []) if (!done.has(`${n.packet_id}:${n.peer_id}:peer`)) add(n.peer_id, 'peer')
  if (!late.size) return { people: 0, emailed: 0 }

  const people = [...late.keys()]
  await supabase.from('notifications').insert(people.map(u => ({ user_id: u, kind: 'review_reminder', actor_id: actorId, emailed_at: new Date().toISOString(), data: { cycle: cycle.name, tasks: [...late.get(u)!] } })))
  const { emails, first } = await emailsOf(supabase, people)
  const label: Record<Task, string> = { self: '• votre auto-évaluation', manager: '• l’évaluation de votre équipe', peer: '• les retours demandés par vos collègues' }
  const due: Record<Task, string | null> = { self: cycle.self_due, manager: cycle.manager_due, peer: cycle.peer_due }
  let emailed = 0
  for (const u of people) {
    const to = emails.get(u)
    if (!to) continue
    const tasks = [...late.get(u)!].map(k => `${label[k]}${due[k] ? ` (à rendre le ${due[k]!.split('-').reverse().join('/')})` : ''}`).join('\n')
    const r = await sendMail(supabase, {
      to,
      subject: `Rappel — ${cycle.name}`,
      text: `Bonjour ${first(u)},\n\nPetit rappel pour la campagne « ${cycle.name} ». Il vous reste à compléter :\n${tasks}\n\nTout se trouve dans Mes évaluations : ${site}/mes-evaluations\n\nMerci !`,
    })
    if (r.sent) emailed++
  }
  return { people: people.length, emailed }
}

/** Cron: reminders at D-3 and D+1 of each due date, each phase once per campaign */
export async function runAutoReminders(supabase: SupabaseClient, site: string, today = new Date().toISOString().slice(0, 10)) {
  const { data: cycles } = await supabase.from('review_cycles').select('id, name, status, peers_enabled, self_due, manager_due, peer_due').eq('status', 'active')
  const sent: { cycle: string, task: Task, phase: string, people: number }[] = []
  for (const c of (cycles ?? []) as Cycle[]) {
    for (const task of ['self', 'peer', 'manager'] as Task[]) {
      if (task === 'peer' && !c.peers_enabled) continue
      const phase = reminderPhase({ self: c.self_due, manager: c.manager_due, peer: c.peer_due }[task], today)
      if (!phase) continue
      const name = `rr-${c.id}-${task}-${phase}`
      const { data: run } = await supabase.from('job_runs').select('name').eq('name', name).maybeSingle()
      if (run) continue
      const r = await remindLate(supabase, c, site, null, [task])
      await supabase.from('job_runs').upsert({ name, last_run_at: new Date().toISOString(), result: r })
      sent.push({ cycle: c.name, task, phase, people: r.people })
    }
  }
  return sent
}

/** Cron: once a week, tell HR how many professional interviews are due within 30 days or late */
export async function runProfessionalReminder(supabase: SupabaseClient, site: string, opts: { force?: boolean, today?: string } = {}) {
  const today = opts.today ?? new Date().toISOString().slice(0, 10)
  const { data: run } = await supabase.from('job_runs').select('last_run_at').eq('name', 'ep_reminder').maybeSingle()
  if (!opts.force && run && Date.now() - Date.parse(run.last_run_at as string) < 6.5 * 24 * 3_600_000) return { skipped: true as const }
  const { data: people } = await supabase.from('profiles').select('id, joined_at, role, is_hr')
  const { data: shared } = await supabase.from('review_packets').select('employee_id, shared_at, review_cycles!inner (content)').not('shared_at', 'is', null)
  const last = (id: string, key: 'professional' | 'bilan') => (shared ?? [])
    .filter(s => s.employee_id === id && (s.review_cycles as unknown as { content: Record<string, unknown> | null })?.content?.[key] === true)
    .map(s => String(s.shared_at).slice(0, 10)).sort().pop() ?? null
  let due = 0
  for (const p of (people ?? []).filter(x => x.role !== 'admin')) {
    const d = professionalDue({ joined_at: p.joined_at as string, last_ep: last(p.id, 'professional'), last_bilan: last(p.id, 'bilan') }, today, 30)
    if (d.epStatus !== 'ok' || d.bilanStatus !== 'ok') due++
  }
  await supabase.from('job_runs').upsert({ name: 'ep_reminder', last_run_at: new Date().toISOString(), result: { due } })
  if (!due) return { skipped: false as const, due, hr: 0 }
  const hr = (people ?? []).filter(x => x.role === 'admin' || x.is_hr === true).map(x => x.id as string)
  await supabase.from('notifications').insert(hr.map(u => ({ user_id: u, kind: 'review_ep_due', emailed_at: new Date().toISOString(), data: { count: due } })))
  const { emails, first } = await emailsOf(supabase, hr)
  for (const u of hr) {
    const to = emails.get(u)
    if (to) await sendMail(supabase, { to, subject: `${due} entretien${due > 1 ? 's' : ''} professionnel${due > 1 ? 's' : ''} à prévoir`, text: `Bonjour ${first(u)},\n\n${due} personne${due > 1 ? 's ont' : ' a'} un entretien professionnel (tous les 2 ans) ou un bilan à 6 ans en retard ou à prévoir dans les 30 jours.\n\nL’échéancier : ${site}/evaluations?vue=professionnel\n\nMerci !` })
  }
  return { skipped: false as const, due, hr: hr.length }
}
