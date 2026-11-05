/** Countries with seeded public holidays (lot R8-A) */
export const COUNTRIES = ['FR', 'BE', 'LU', 'DE', 'AT', 'ES', 'IT', 'NL', 'PT', 'IE'] as const

export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  }
  catch {
    return code
  }
}

export function countryOptions(locale: string) {
  return COUNTRIES.map(c => ({ value: c, label: countryName(c, locale) }))
}
