import { loadApplicationForAction } from '../../../../utils/recruit-actions'

/**
 * Talent pool (TND-30 lot 3): propose a candidate who agreed to be kept for
 * another opening. A new application is created (source « vivier ») with a copy
 * of their files. Recruiters only.
 */
export default defineEventHandler(async (event) => {
  const { supabase, user, recruiter, app } = await loadApplicationForAction(event)
  if (!recruiter) throw createError({ statusCode: 403, statusMessage: 'Réservé au RH' })
  const { opening_id: target } = await readBody<{ opening_id?: unknown }>(event)
  if (typeof target !== 'string' || !/^[0-9a-f-]{36}$/i.test(target) || target === app.opening_id) throw createError({ statusCode: 400, statusMessage: 'Offre invalide' })
  const { data: src } = await supabase.from('applications').select('candidate_id, consent_pool, cover_letter_text').eq('id', app.id).single()
  if (!src?.consent_pool) throw createError({ statusCode: 409, statusMessage: 'Ce candidat n’a pas accepté le vivier' })
  const { data: op } = await supabase.from('job_openings').select('id, title, status').eq('id', target).maybeSingle()
  if (!op || op.status === 'closed') throw createError({ statusCode: 400, statusMessage: 'Offre introuvable ou fermée' })

  const { data: created, error } = await supabase.from('applications').insert({
    opening_id: target, candidate_id: src.candidate_id, source: 'vivier', consent_pool: true, cover_letter_text: src.cover_letter_text,
  }).select('id').single()
  if (error?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'Ce candidat est déjà sur cette offre' })
  if (error || !created) throw createError({ statusCode: 500, statusMessage: 'Création impossible' })

  const { data: files } = await supabase.from('application_files').select('kind, storage_path, file_name, mime_type, size_bytes').eq('application_id', app.id)
  for (const f of files ?? []) {
    const ext = String(f.storage_path).split('.').pop()
    const path = `${target}/${created.id}/${f.kind}-${crypto.randomUUID()}.${ext}`
    const { error: cpErr } = await supabase.storage.from('applications').copy(f.storage_path, path)
    if (!cpErr) await supabase.from('application_files').insert({ application_id: created.id, kind: f.kind, storage_path: path, file_name: f.file_name, mime_type: f.mime_type, size_bytes: f.size_bytes })
  }
  await supabase.from('application_events').insert([
    { application_id: created.id, actor_id: user.id, kind: 'submitted', data: { source: 'vivier', from_application: app.id } },
    { application_id: app.id, actor_id: user.id, kind: 'note', data: { text: `Proposé·e pour l’offre « ${op.title} » (vivier)` } },
  ])
  return { id: created.id, opening_id: target }
})
