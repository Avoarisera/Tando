import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMail } from './mailer'

/**
 * TND-32 — e-mail copy of the review notifications. Each notification is mailed
 * once (emailed_at), only when recent (48 h): re-running never sends twice and
 * never digs up old news. Called right after an action and by the 15-min cron.
 */
export const REVIEW_MAIL_KINDS = ['review_requested', 'review_peers_proposed', 'review_peer_requested', 'review_shared'] as const
type Kind = typeof REVIEW_MAIL_KINDS[number]
export interface ReviewNotif { kind: Kind, data: { cycle?: string, packet_id?: string, role?: string, who?: string } }

/** Subject and body of one e-mail (pure, unit-tested) */
export function reviewMail(n: ReviewNotif, firstName: string, site: string): { subject: string, text: string } {
  const cycle = n.data.cycle ?? ''
  const who = n.data.who ?? ''
  const hello = `Bonjour${firstName ? ` ${firstName}` : ''},`
  const end = '\n\nÀ bientôt,\nL’équipe WakaBods'
  const packet = `${site}/mes-evaluations/${n.data.packet_id ?? ''}`
  switch (n.kind) {
    case 'review_requested':
      return n.data.role === 'manager'
        ? { subject: `Évaluation de ${who} à rédiger — ${cycle}`, text: `${hello}\n\nLa campagne « ${cycle} » est lancée. Vous avez l’évaluation de ${who} à rédiger. Appuyez-vous sur des exemples concrets de la période.\n\nVous verrez son auto-évaluation une fois la vôtre envoyée, pour ne pas être influencé·e.\n\nRédiger l’évaluation : ${packet}${end}` }
        : { subject: `Votre auto-évaluation est ouverte — ${cycle}`, text: `${hello}\n\nLa campagne « ${cycle} » est lancée. Votre auto-évaluation vous attend : elle s’enregistre au fur et à mesure, vous pouvez la reprendre quand vous voulez.\n\nRien n’est visible par votre manager avant qu’il ait envoyé la sienne, ni par vous avant le partage du dossier par les RH.\n\nCommencer : ${packet}${end}` }
    case 'review_peers_proposed':
      return { subject: `${who} propose ses collègues — ${cycle}`, text: `${hello}\n\n${who} a proposé les collègues qui lui donneront un retour pour la campagne « ${cycle} ». Vérifiez la liste, ajustez-la si besoin, puis validez-la : ils recevront la demande.\n\nValider la liste : ${packet}${end}` }
    case 'review_peer_requested':
      return { subject: `Votre retour est demandé sur ${who} — ${cycle}`, text: `${hello}\n\nVous êtes sollicité·e pour donner un retour sur ${who} (campagne « ${cycle} »). Le formulaire est court : quelques compétences et une ou deux questions.\n\nVotre réponse est anonyme : elle n’est montrée qu’à partir de 3 réponses, sans votre nom, mélangée aux autres.\n\nDonner mon retour : ${site}/mes-evaluations/collegue/${n.data.packet_id ?? ''}${end}` }
    case 'review_shared':
      return { subject: `Votre dossier d’évaluation est disponible — ${cycle}`, text: `${hello}\n\nVotre dossier « ${cycle} » est partagé : vous pouvez lire l’ensemble des retours et la conclusion des RH, puis indiquer que vous en avez pris connaissance (avec un commentaire si vous le souhaitez).\n\nLire mon dossier : ${packet}${end}` }
  }
}

/** Mail the pending review notifications; returns how many e-mails left */
export async function mailPendingReviewNotifications(supabase: SupabaseClient, site: string): Promise<{ sent: number, failed: number, notConfigured: boolean }> {
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  const { data: rows } = await supabase.from('notifications').select('id, user_id, kind, data')
    .in('kind', REVIEW_MAIL_KINDS as unknown as string[]).is('emailed_at', null).gte('created_at', since).order('created_at').limit(500)
  if (!rows?.length) return { sent: 0, failed: 0, notConfigured: false }
  const ids = [...new Set(rows.map(r => r.user_id as string))]
  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const emails = new Map((users?.users ?? []).map(u => [u.id, u.email ?? '']))
  const { data: names } = await supabase.from('profiles').select('id, first_name').in('id', ids)
  let sent = 0
  let failed = 0
  for (const r of rows) {
    const to = emails.get(r.user_id as string)
    if (!to) { await supabase.from('notifications').update({ emailed_at: new Date().toISOString() }).eq('id', r.id); continue }
    const mail = reviewMail(r as unknown as ReviewNotif, names?.find(x => x.id === r.user_id)?.first_name ?? '', site)
    const res = await sendMail(supabase, { to, ...mail })
    if (res.reason === 'not_configured') return { sent, failed, notConfigured: true }
    if (res.sent) { sent++; await supabase.from('notifications').update({ emailed_at: new Date().toISOString() }).eq('id', r.id) }
    else failed++
  }
  return { sent, failed, notConfigured: false }
}
