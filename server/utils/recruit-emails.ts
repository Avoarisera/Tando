import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * TND-30 — e-mails to candidates, from the templates HR edits (email_templates).
 * Variables: {prenom} {nom} {poste} {entreprise} {date} {lieu} {lien_suivi}.
 * Unknown variables stay as typed; values are plain text (no HTML injection: the
 * mailer escapes the text when it builds the HTML part).
 */
export type TemplateKey = 'acknowledgement' | 'rejection' | 'invitation' | 'offer'
export type TemplateVars = Partial<Record<'prenom' | 'nom' | 'poste' | 'entreprise' | 'date' | 'lieu' | 'lien_suivi', string>>

export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{(prenom|nom|poste|entreprise|date|lieu|lien_suivi)\}/g, (m, k: keyof TemplateVars) => vars[k] ?? m)
    // lines left empty by a missing optional variable (e.g. no place) collapse
    .replace(/\n{3,}/g, '\n\n')
}

const FALLBACK: Record<TemplateKey, { subject: string, body: string }> = {
  acknowledgement: { subject: 'Votre candidature — {poste}', body: 'Bonjour {prenom},\n\nMerci pour votre candidature au poste « {poste} » chez {entreprise}. Nous l’avons bien reçue et revenons vers vous dans tous les cas.\n\nSuivre ou retirer votre candidature : {lien_suivi}\n\nL’équipe {entreprise}' },
  rejection: { subject: 'Votre candidature — {poste}', body: 'Bonjour {prenom},\n\nMerci pour votre candidature au poste « {poste} ». Nous ne donnerons pas suite pour ce poste.\n\nBien cordialement,\nL’équipe {entreprise}' },
  invitation: { subject: 'Entretien — {poste}', body: 'Bonjour {prenom},\n\nNous serions ravis d’échanger avec vous :\n\n{date}\n{lieu}\n\nL’équipe {entreprise}' },
  offer: { subject: 'Notre proposition — {poste}', body: 'Bonjour {prenom},\n\nNous sommes heureux de vous proposer de rejoindre {entreprise} au poste « {poste} ».\n\nL’équipe {entreprise}' },
}

/** Template from the database (falls back to the built-in text), rendered */
export async function buildEmail(supabase: SupabaseClient, key: TemplateKey, vars: TemplateVars) {
  const { data } = await supabase.from('email_templates').select('subject, body').eq('key', key).maybeSingle()
  const tpl = (data as { subject: string, body: string } | null) ?? FALLBACK[key]
  return { subject: renderTemplate(tpl.subject, vars), text: renderTemplate(tpl.body, vars) }
}

/** Privacy line appended to every candidate e-mail */
export const PRIVACY_FOOTER = '\n\n—\nVos données sont utilisées uniquement pour ce recrutement et supprimées au plus tard deux ans après notre dernier échange. Pour les consulter ou les faire supprimer, utilisez votre lien de suivi ou répondez à cet e-mail.'

export function trackUrl(origin: string, token: string) {
  return `${origin}/carrieres/suivi/${token}`
}
