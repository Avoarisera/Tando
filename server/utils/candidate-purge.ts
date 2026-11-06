import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * GDPR purge (TND-30 lot 3, CNIL: 2 years after the last contact). Deletes the
 * applications whose purge date has passed — except hired people, whose data
 * belongs to the personnel file — with their files, then candidates left
 * without any application. Runs at most once a day (job_runs).
 */
export async function runCandidatePurge(supabase: SupabaseClient, opts: { force?: boolean } = {}) {
  const { data: run } = await supabase.from('job_runs').select('last_run_at').eq('name', 'candidate_purge').maybeSingle()
  if (!opts.force && run && Date.now() - Date.parse(run.last_run_at as string) < 20 * 3_600_000) return { skipped: true as const }

  const today = new Date().toISOString().slice(0, 10)
  const { data: expired } = await supabase.from('applications').select('id, candidate_id').lt('purge_after', today).neq('status', 'hired').limit(500)
  const ids = (expired ?? []).map(a => a.id as string)
  let files = 0
  if (ids.length) {
    const { data: f } = await supabase.from('application_files').select('storage_path').in('application_id', ids)
    const paths = (f ?? []).map(x => x.storage_path as string)
    for (let i = 0; i < paths.length; i += 100) await supabase.storage.from('applications').remove(paths.slice(i, i + 100))
    files = paths.length
    await supabase.from('applications').delete().in('id', ids)
  }
  // candidates without any application left
  const candIds = [...new Set((expired ?? []).map(a => a.candidate_id as string))]
  let candidates = 0
  for (const id of candIds) {
    const { count } = await supabase.from('applications').select('id', { count: 'exact', head: true }).eq('candidate_id', id)
    if (!count) { await supabase.from('candidates').delete().eq('id', id); candidates++ }
  }
  const result = { applications: ids.length, files, candidates, at: new Date().toISOString() }
  await supabase.from('job_runs').upsert({ name: 'candidate_purge', last_run_at: new Date().toISOString(), result })
  return { skipped: false as const, ...result }
}
