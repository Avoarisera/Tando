import { serverSupabaseServiceRole } from '#supabase/server'
import { requireRecruiter } from '../../../../utils/require-recruiter'

/** Cancel an interview (TND-30): the interviewers lose access to the candidate */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 404, statusMessage: 'Entretien introuvable' })
  const admin = serverSupabaseServiceRole(event)
  const { data: itv } = await admin.from('interviews').select('id, application_id, applications (opening_id)').eq('id', id).maybeSingle()
  const openingId = (itv?.applications as { opening_id?: string } | null)?.opening_id
  if (!itv || !openingId) throw createError({ statusCode: 404, statusMessage: 'Entretien introuvable' })
  const { supabase, user } = await requireRecruiter(event, openingId)
  await supabase.from('interviews').update({ status: 'cancelled' }).eq('id', id)
  await supabase.from('application_events').insert({ application_id: itv.application_id, actor_id: user.id, kind: 'interview', data: { cancelled: true } })
  return { ok: true }
})
