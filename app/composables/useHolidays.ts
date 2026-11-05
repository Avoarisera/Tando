/** Public holidays of a country (lot R8), as { 'YYYY-MM-DD': name } */
export function useHolidays() {
  const supabase = useSupabaseClient()
  const cache = useState<Record<string, Record<string, string>>>('public-holidays', () => ({}))
  const all = useState<{ country: string, day: string, name: string }[]>('public-holidays-rows', () => [])

  async function fetchCountry(country: string) {
    if (cache.value[country]) return cache.value[country]!
    const { data, error } = await supabase.from('public_holidays').select('day, name').eq('country', country)
    if (error) throw error
    const map: Record<string, string> = {}
    for (const h of data ?? []) map[h.day] = h.name
    cache.value = { ...cache.value, [country]: map }
    return map
  }

  /** Admin list (Congés et règles › Jours fériés) */
  async function fetchAll(country: string, year: number) {
    const { data, error } = await supabase.from('public_holidays').select('country, day, name')
      .eq('country', country).gte('day', `${year}-01-01`).lte('day', `${year}-12-31`).order('day')
    if (error) throw error
    all.value = data ?? []
  }

  async function add(country: string, day: string, name: string) {
    const { error } = await supabase.from('public_holidays').insert({ country, day, name })
    if (error) throw new Error(error.message)
    delete cache.value[country]
  }

  async function remove(country: string, day: string) {
    const { error } = await supabase.from('public_holidays').delete().eq('country', country).eq('day', day)
    if (error) throw new Error(error.message)
    delete cache.value[country]
  }

  return { holidaysOf: (c: string) => cache.value[c] ?? {}, all: readonly(all), fetchCountry, fetchAll, add, remove }
}

/** Countries with seeded holidays, in display order */
export const COUNTRIES = ['FR', 'BE', 'LU', 'DE', 'AT', 'ES', 'IT', 'NL', 'PT', 'IE'] as const
