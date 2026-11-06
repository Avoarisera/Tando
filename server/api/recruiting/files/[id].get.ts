import { serverSupabaseServiceRole } from '#supabase/server'
import { requireRecruiter } from '../../../utils/require-recruiter'

/** Short-lived link to a CV / cover letter (TND-30): recruiters and the opening's hiring manager */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 404, statusMessage: 'Fichier introuvable' })
  // look the file up with the service role first, then check access to its opening
  const admin = serverSupabaseServiceRole(event)
  const { data: f } = await admin.from('application_files').select('storage_path, file_name, applications (opening_id)').eq('id', id).maybeSingle()
  const openingId = (f?.applications as { opening_id?: string } | null)?.opening_id
  if (!f || !openingId) throw createError({ statusCode: 404, statusMessage: 'Fichier introuvable' })
  const { data: f2 } = await admin.from('application_files').select('application_id').eq('id', id).single()
  const { supabase } = await requireRecruiter(event, openingId, f2?.application_id as string | undefined)
  const download = getQuery(event).download === '1'
  const { data, error } = await supabase.storage.from('applications').createSignedUrl(f.storage_path, 300, download ? { download: f.file_name } : undefined)
  if (error || !data) throw createError({ statusCode: 500, statusMessage: 'Lien indisponible' })
  return { url: data.signedUrl, name: f.file_name }
})
