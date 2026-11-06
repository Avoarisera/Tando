import type { SupabaseClient } from '@supabase/supabase-js'

/** Columns a visitor may see (never the hiring manager, creator or internal stages) */
export const PUBLIC_OPENING_COLUMNS = 'id, slug, title, location, contract_type, remote, salary_min, salary_max, salary_period, salary_currency, summary, missions, profile, benefits, process_steps, questions, cover_letter, published_at, teams (name)'

export async function companyInfo(supabase: SupabaseClient) {
  const { data } = await supabase.from('company_settings').select('legal_name, careers_intro').eq('id', true).maybeSingle()
  return { name: (data?.legal_name as string | undefined) || 'WakaBods', intro: (data?.careers_intro as string | undefined) ?? '' }
}
