import { loadTracked } from '../../../../utils/candidate-track'

/**
 * GDPR erasure from the follow-up link: the application, its files and, when it
 * was the last one, the candidate record are deleted for good.
 */
export default defineEventHandler(async (event) => {
  const { supabase, app } = await loadTracked(event)
  if (app.status === 'hired') throw createError({ statusCode: 409, statusMessage: 'Vous faites partie de l’équipe : contactez les RH pour vos données' })
  const { data: files } = await supabase.from('application_files').select('storage_path').eq('application_id', app.id)
  if (files?.length) await supabase.storage.from('applications').remove(files.map(f => f.storage_path))
  await supabase.from('notifications').delete().eq('kind', 'application_received').contains('data', { application_id: app.id })
  await supabase.from('applications').delete().eq('id', app.id)
  const { count } = await supabase.from('applications').select('id', { count: 'exact', head: true }).eq('candidate_id', app.candidate_id)
  if (!count) await supabase.from('candidates').delete().eq('id', app.candidate_id)
  return { ok: true }
})
