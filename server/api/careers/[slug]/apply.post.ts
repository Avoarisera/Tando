import { siteUrl } from '../../../utils/site-url'
import { serverSupabaseServiceRole } from '#supabase/server'
import { cleanFileName, createRateLimiter, extOf, MAX_FILE_BYTES, sniffMime, validateApplication, type AcceptedMime, type ApplicationFields, type OpeningForm } from '../../../utils/careers'
import { sendMail } from '../../../utils/mailer'
import { buildEmail, PRIVACY_FOOTER, trackUrl } from '../../../utils/recruit-emails'
import { companyInfo } from '../../../utils/public-openings'

/**
 * Public application (TND-30), multipart/form-data, no session:
 * fields + `cv` (required) + `cover_letter_file` (optional) + `answers` (JSON).
 * Honeypot, rate limit per IP, optional Turnstile, real file type check, then
 * candidate upsert (by e-mail), application, files in the private bucket,
 * acknowledgement e-mail and in-app notification to the recruiters.
 */
// 5 applications per IP per 10 minutes (CAREERS_MAX_PER_IP raises it for local E2E runs only)
const perIp = createRateLimiter(Number(process.env.CAREERS_MAX_PER_IP) || 5, 10 * 60 * 1000)
const perEmail = createRateLimiter(3, 24 * 60 * 60 * 1000)

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true // not configured: honeypot + rate limit only
  if (!token) return false
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  }).catch(() => null)
  const body = res ? await res.json().catch(() => null) as { success?: boolean } | null : null
  return body?.success === true
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!perIp(ip)) throw createError({ statusCode: 429, statusMessage: 'Trop de candidatures envoyées. Réessayez dans quelques minutes.' })

  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, statusMessage: 'Formulaire invalide' })
  const field = (name: string) => parts.find(p => p.name === name && !p.filename)?.data.toString('utf8').trim() ?? ''
  const file = (name: string) => parts.find(p => p.name === name && p.filename && p.data.length)

  let answers: Record<string, string> = {}
  try {
    const raw = JSON.parse(field('answers') || '{}') as unknown
    if (raw && typeof raw === 'object') answers = Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k.slice(0, 20), (v as string).trim()]))
  }
  catch { answers = {} }

  const f: ApplicationFields = {
    first_name: field('first_name'), last_name: field('last_name'), email: field('email').toLowerCase(),
    phone: field('phone') || null, linkedin_url: field('linkedin_url') || null,
    cover_letter_text: field('cover_letter_text') || null, answers,
    consent: field('consent') === 'true', consent_pool: field('consent_pool') === 'true', website: field('website'),
  }
  // honeypot filled → pretend success, store nothing
  if (f.website) return { ok: true }
  if (!(await verifyTurnstile(field('cf-turnstile-response') || undefined, ip))) throw createError({ statusCode: 400, statusMessage: 'Vérification anti-robot échouée. Rechargez la page.' })

  const supabase = serverSupabaseServiceRole(event)
  const { data: opening } = await supabase.from('job_openings')
    .select('id, title, cover_letter, questions, hiring_manager_id').eq('slug', slug).eq('status', 'published').maybeSingle()
  if (!opening) throw createError({ statusCode: 404, statusMessage: 'Cette offre n’est plus ouverte.' })

  const cv = file('cv')
  const letter = file('cover_letter_file')
  const errors = validateApplication(f, { cover_letter: opening.cover_letter, questions: (opening.questions ?? []) as OpeningForm['questions'] }, { cv: !!cv, coverLetter: !!letter })
  const files: { kind: 'cv' | 'cover_letter', name: string, mime: AcceptedMime, data: Buffer }[] = []
  for (const [kind, p] of [['cv', cv], ['cover_letter', letter]] as const) {
    if (!p) continue
    const mime = sniffMime(p.data, p.filename ?? '')
    if (!mime) errors.push(`${kind}_type`)
    else if (p.data.length > MAX_FILE_BYTES) errors.push(`${kind}_size`)
    else files.push({ kind, name: cleanFileName(p.filename ?? kind), mime, data: p.data })
  }
  if (errors.length) throw createError({ statusCode: 422, statusMessage: 'Certains champs sont à corriger', data: { errors } })
  if (!perEmail(f.email)) throw createError({ statusCode: 429, statusMessage: 'Vous avez déjà envoyé plusieurs candidatures aujourd’hui.' })

  // candidate (deduplicated by e-mail; latest details win)
  const { data: cand, error: candErr } = await supabase.from('candidates')
    .upsert({ email: f.email, first_name: f.first_name, last_name: f.last_name, phone: f.phone, linkedin_url: f.linkedin_url, updated_at: new Date().toISOString() }, { onConflict: 'email' })
    .select('id').single()
  if (candErr || !cand) throw createError({ statusCode: 500, statusMessage: 'Candidature impossible pour le moment' })

  const { data: app, error: appErr } = await supabase.from('applications').insert({
    opening_id: opening.id, candidate_id: cand.id, answers: f.answers, cover_letter_text: f.cover_letter_text,
    consent_pool: f.consent_pool, source: (field('source') || 'careers').slice(0, 40),
  }).select('id, track_token').single()
  if (appErr?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'Vous avez déjà postulé à cette offre avec cette adresse.' })
  if (appErr || !app) throw createError({ statusCode: 500, statusMessage: 'Candidature impossible pour le moment' })

  // files: private bucket, path not guessable
  for (const x of files) {
    const path = `${opening.id}/${app.id}/${x.kind}-${crypto.randomUUID()}.${extOf(x.mime)}`
    const { error: upErr } = await supabase.storage.from('applications').upload(path, x.data, { contentType: x.mime, upsert: false })
    if (upErr) {
      await supabase.from('applications').delete().eq('id', app.id)
      throw createError({ statusCode: 500, statusMessage: 'L’envoi du fichier a échoué. Réessayez.' })
    }
    await supabase.from('application_files').insert({ application_id: app.id, kind: x.kind, storage_path: path, file_name: x.name, mime_type: x.mime, size_bytes: x.data.length })
  }

  const company = await companyInfo(supabase)
  const mail = await buildEmail(supabase, 'acknowledgement', { prenom: f.first_name, nom: f.last_name, poste: opening.title, entreprise: company.name, lien_suivi: trackUrl(siteUrl(event), app.track_token) })
  const sent = await sendMail(supabase, { to: f.email, subject: mail.subject, text: mail.text + PRIVACY_FOOTER })
  await supabase.from('application_events').insert([
    { application_id: app.id, kind: 'submitted', data: { source: 'careers' } },
    { application_id: app.id, kind: 'email', data: { template: 'acknowledgement', sent: sent.sent, reason: sent.reason ?? null } },
  ])

  // notify recruiters (admins, HR) and the hiring manager
  const { data: staff } = await supabase.from('profiles').select('id').or(`role.eq.admin,is_hr.eq.true${opening.hiring_manager_id ? `,id.eq.${opening.hiring_manager_id}` : ''}`)
  if (staff?.length) {
    await supabase.from('notifications').insert(staff.map(s => ({
      user_id: s.id, kind: 'application_received',
      data: { first_name: f.first_name, last_name: f.last_name, job: opening.title, opening_id: opening.id, application_id: app.id },
    })))
  }
  return { ok: true, track: app.track_token }
})
