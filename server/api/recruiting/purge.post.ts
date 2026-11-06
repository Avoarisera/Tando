import { serverSupabaseServiceRole } from '#supabase/server'
import { requireRecruiter } from '../../utils/require-recruiter'
import { runCandidatePurge } from '../../utils/candidate-purge'

/** Run the GDPR purge now (HR), or read when it last ran (`?dry=1`) — TND-30 lot 3 */
export default defineEventHandler(async (event) => {
  const { recruiter } = await requireRecruiter(event)
  if (!recruiter) throw createError({ statusCode: 403, statusMessage: 'Réservé au RH' })
  const supabase = serverSupabaseServiceRole(event)
  if (getQuery(event).dry === '1') {
    const { data } = await supabase.from('job_runs').select('last_run_at, result').eq('name', 'candidate_purge').maybeSingle()
    return { last: data ?? null }
  }
  const r = await runCandidatePurge(supabase, { force: true })
  return { last: { last_run_at: new Date().toISOString(), result: r } }
})
