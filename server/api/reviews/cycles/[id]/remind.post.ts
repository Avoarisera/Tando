import { requireRecruiter } from '../../../../utils/require-recruiter'
import { sendMail } from '../../../../utils/mailer'

/**
 * HR reminder (TND-29 lot 2): everyone still late in an active campaign — self
 * review, manager review, peer feedback — gets an in-app notification and, when
 * the SMTP is configured, an e-mail. Never says who else is late.
 */
export default defineEventHandler(async (event) => {
  const { supabase, user, recruiter } = await requireRecruiter(event)
  if (!recruiter) throw createError({ statusCode: 403, statusMessage: 'Réservé au RH' })
  const id = getRouterParam(event, 'id') ?? ''
  const { data: cycle } = await supabase.from('review_cycles').select('id, name, status, peers_enabled, self_due, manager_due, peer_due').eq('id', id).maybeSingle()
  if (!cycle || cycle.status !== 'active') throw createError({ statusCode: 400, statusMessage: 'Campagne non active' })
  const { data: packets } = await supabase.from('review_packets').select('id, employee_id, manager_id').eq('cycle_id', id).is('shared_at', null)
  const ids = (packets ?? []).map(p => p.id)
  const { data: resp } = ids.length ? await supabase.from('review_responses').select('packet_id, author_id, role').in('packet_id', ids).not('submitted_at', 'is', null) : { data: [] }
  const { data: noms } = ids.length && cycle.peers_enabled ? await supabase.from('review_nominations').select('packet_id, peer_id').in('packet_id', ids).eq('status', 'approved') : { data: [] }
  const done = new Set((resp ?? []).map(r => `${r.packet_id}:${r.author_id}:${r.role}`))
  const late = new Map<string, Set<string>>() // person → tasks
  const add = (who: string | null, task: string) => { if (who) late.set(who, (late.get(who) ?? new Set()).add(task)) }
  for (const p of packets ?? []) {
    if (!done.has(`${p.id}:${p.employee_id}:self`)) add(p.employee_id, 'self')
    if (p.manager_id && !done.has(`${p.id}:${p.manager_id}:manager`)) add(p.manager_id, 'manager')
  }
  for (const n of noms ?? []) if (!done.has(`${n.packet_id}:${n.peer_id}:peer`)) add(n.peer_id, 'peer')
  if (!late.size) return { people: 0, emailed: 0 }

  const people = [...late.keys()]
  await supabase.from('notifications').insert(people.map(u => ({ user_id: u, kind: 'review_reminder', actor_id: user.id, data: { cycle: cycle.name, tasks: [...late.get(u)!] } })))
  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const emails = new Map((users?.users ?? []).map(u => [u.id, u.email ?? '']))
  const { data: names } = await supabase.from('profiles').select('id, first_name').in('id', people)
  const origin = getRequestURL(event).origin
  let emailed = 0
  for (const u of people) {
    const to = emails.get(u)
    if (!to) continue
    const first = names?.find(n => n.id === u)?.first_name ?? ''
    const tasks = [...late.get(u)!].map(k => ({ self: '• votre auto-évaluation', manager: '• l’évaluation de votre équipe', peer: '• les retours demandés par vos collègues' }[k])).join('\n')
    const r = await sendMail(supabase, {
      to,
      subject: `Rappel — ${cycle.name}`,
      text: `Bonjour ${first},\n\nPetit rappel pour la campagne « ${cycle.name} ». Il vous reste à compléter :\n${tasks}\n\nTout se trouve dans Mes évaluations : ${origin}/mes-evaluations\n\nMerci !`,
    })
    if (r.sent) emailed++
  }
  return { people: people.length, emailed }
})
