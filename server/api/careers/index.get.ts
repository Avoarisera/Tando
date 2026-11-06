import { serverSupabaseServiceRole } from '#supabase/server'
import { companyInfo, PUBLIC_OPENING_COLUMNS } from '../../utils/public-openings'

/** Public careers page (TND-30): company name, intro and published openings. No session needed. */
export default defineEventHandler(async (event) => {
  const supabase = serverSupabaseServiceRole(event)
  const [company, { data, error }] = await Promise.all([
    companyInfo(supabase),
    supabase.from('job_openings').select(PUBLIC_OPENING_COLUMNS).eq('status', 'published').order('published_at', { ascending: false }),
  ])
  if (error) throw createError({ statusCode: 500, statusMessage: 'Offres indisponibles' })
  setHeader(event, 'Cache-Control', 'public, max-age=60')
  return { company, openings: data ?? [] }
})
