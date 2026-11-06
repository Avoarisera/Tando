import { serverSupabaseServiceRole } from '#supabase/server'
import { companyInfo, PUBLIC_OPENING_COLUMNS } from '../../utils/public-openings'

/** One published opening for the public page (TND-30) */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw createError({ statusCode: 404, statusMessage: 'Offre introuvable' })
  const supabase = serverSupabaseServiceRole(event)
  const [company, { data }] = await Promise.all([
    companyInfo(supabase),
    supabase.from('job_openings').select(PUBLIC_OPENING_COLUMNS).eq('slug', slug).eq('status', 'published').maybeSingle(),
  ])
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Offre introuvable' })
  return { company, opening: data }
})
