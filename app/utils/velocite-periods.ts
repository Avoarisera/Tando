export interface RangeOption {
  label: string
  value: number
}

export const VELOCITE_RANGES: RangeOption[] = [
  { label: '3 mois', value: 3 },
  { label: '6 mois', value: 6 },
  { label: '12 mois', value: 12 },
]

const VALID_RANGES = new Set(VELOCITE_RANGES.map(r => r.value))

export function isValidRange(n: number): boolean {
  return VALID_RANGES.has(n)
}

// Available years: 2024 → current year (auto-extends each year).
export function getAvailableYears(): number[] {
  const current = new Date().getFullYear()
  return Array.from({ length: current - 2023 }, (_, i) => 2024 + i)
}

export function isCurrentYear(year: number): boolean {
  return year === new Date().getFullYear()
}

export function isValidYear(n: number): boolean {
  return getAvailableYears().includes(n)
}

export interface PeriodSelection {
  year: number
  range: number
}

// Compute the list of YYYY-MM months for a year+range selection.
// Current year: last N months from now. Past year: last N months of that year.
export function computeSelectionMonths(year: number, range: number): string[] {
  const months: string[] = []
  if (isCurrentYear(year)) {
    const now = new Date()
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months
  }
  for (let m = 12 - range; m < 12; m++) {
    months.push(`${year}-${String(m + 1).padStart(2, '0')}`)
  }
  return months
}

export function selectionLabel(year: number, range: number): string {
  if (isCurrentYear(year)) return `${range} derniers mois`
  if (range === 12) return `Année ${year}`
  return `${range} derniers mois de ${year}`
}

// Same as computeSelectionMonths but prepends the previous calendar month,
// so MoM variation can compare the first displayed month to its predecessor.
export function computeFetchMonths(year: number, range: number): string[] {
  const months = computeSelectionMonths(year, range)
  if (!months.length) return months
  const [firstY, firstM] = months[0]!.split('-').map(Number)
  const prev = new Date(firstY!, firstM! - 1 - 1, 1)
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  return [prevKey, ...months]
}
