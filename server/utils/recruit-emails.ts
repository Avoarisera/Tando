/**
 * TND-30 — e-mails to candidates (French; the careers page is in French).
 * Plain, warm and short: they are read on a phone.
 */
interface Ctx { firstName: string, jobTitle: string, company: string }

export function acknowledgementEmail(c: Ctx) {
  return {
    subject: `Votre candidature — ${c.jobTitle}`,
    text: `Bonjour ${c.firstName},

Merci pour votre candidature au poste « ${c.jobTitle} » chez ${c.company}. Nous l’avons bien reçue.

Nous lisons chaque candidature avec attention et revenons vers vous, quelle que soit la suite, en général sous deux semaines.

Bien cordialement,
L’équipe ${c.company}

—
Vos données sont utilisées uniquement pour ce recrutement et supprimées au plus tard deux ans après notre dernier échange. Pour les consulter ou les faire supprimer, répondez simplement à cet e-mail.`,
  }
}

export function rejectionEmail(c: Ctx) {
  return {
    subject: `Votre candidature — ${c.jobTitle}`,
    text: `Bonjour ${c.firstName},

Merci de l’intérêt que vous portez à ${c.company} et du temps consacré à votre candidature au poste « ${c.jobTitle} ».

Après examen attentif, nous ne donnerons pas suite pour ce poste. Cette décision ne remet pas en cause la qualité de votre parcours.

Nous vous souhaitons pleine réussite dans vos recherches.

Bien cordialement,
L’équipe ${c.company}`,
  }
}
