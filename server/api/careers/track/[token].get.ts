import { loadTracked } from '../../../utils/candidate-track'
import { publicStep } from '../../../utils/candidate-step'
import { companyInfo } from '../../../utils/public-openings'

/** Candidate follow-up page data (TND-30 lot 2): no session, the token is the key */
export default defineEventHandler(async (event) => {
  const { supabase, app } = await loadTracked(event)
  const company = await companyInfo(supabase)
  return {
    company: company.name,
    first_name: app.candidates?.first_name ?? '',
    job: app.job_openings?.title ?? '',
    slug: app.job_openings?.status === 'published' ? app.job_openings.slug : null,
    applied_at: app.created_at,
    step: publicStep(app.stage, app.status),
  }
})
