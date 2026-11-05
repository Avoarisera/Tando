/**
 * Date and colour helpers shared by the WakaBods components.
 * Dates are ISO strings (YYYY-MM-DD) handled in UTC, so a day never shifts
 * with the browser time zone.
 */

const pad = (n: number) => String(n).padStart(2, '0')

export const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

export function parseIso(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}

export const toIso = (d: Date) => isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())

export function addDays(s: string, n: number): string {
  const d = parseIso(s)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}

/** Day of week, Monday = 0 … Sunday = 6 */
export const dayOfWeek = (s: string) => (parseIso(s).getUTCDay() + 6) % 7

export const isWeekend = (s: string) => dayOfWeek(s) > 4

/** Today in the browser's local calendar, as an ISO date */
export function todayIso(): string {
  const n = new Date()
  return isoDate(n.getFullYear(), n.getMonth() + 1, n.getDate())
}

export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const n = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return Array.from({ length: n }, (_, i) => isoDate(y!, m!, i + 1))
}

export function shiftMonth(month: string, k: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m! - 1 + k, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

export const inRange = (d: string, a?: string | null, b?: string | null) => !!a && !!b && d >= a && d <= b

/** Inclusive number of calendar days, as counted by create_leave_request */
export function calendarDays(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000) + 1
}

/** Whole weeks between today and a future date */
export function weeksUntil(date: string, today = todayIso()): number {
  return Math.floor((calendarDays(today, date) - 1) / 7)
}

export function fmtDate(s: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }).format(parseIso(s))
}

export const fmtDay = (s: string, l: string) => fmtDate(s, l, { weekday: 'short', day: 'numeric', month: 'short' })
export const fmtMonth = (s: string, l: string) => fmtDate(s, l, { month: 'long', year: 'numeric' })
export const fmtShort = (s: string, l: string) => fmtDate(s, l, { day: 'numeric', month: 'short' })
export const fmtWeekday = (s: string, l: string) => fmtDate(s, l, { weekday: 'short' }).replace('.', '')

/** Weekday labels starting on Monday */
export const weekdayLabels = (l: string) => Array.from({ length: 7 }, (_, i) => fmtWeekday(addDays('2026-05-04', i), l))

/**
 * CSS variables for a leave colour. Named design colours map to their tokens;
 * a free hex colour gets a tint and an ink that keeps 4.5:1 contrast.
 */
export function leaveVars(c = 'gray'): Record<string, string> {
  if (!c.startsWith('#')) {
    return { '--lt': `var(--leave-${c}-tint)`, '--ls': `var(--leave-${c}-solid)`, '--lx': `var(--leave-${c}-text)`, '--lo': `var(--leave-${c}-on)` }
  }
  const hex = c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c.slice(0, 7)
  const n = Number.parseInt(hex.slice(1), 16)
  const rgb = [n >> 16, (n >> 8) & 255, n & 255]
  const lin = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const lum = 0.2126 * lin(rgb[0]!) + 0.7152 * lin(rgb[1]!) + 0.0722 * lin(rgb[2]!)
  const on = 1.05 / (lum + 0.05) >= 4.5 ? '#ffffff' : '#121a2d'
  return { '--lt': `${hex}22`, '--ls': hex, '--lx': 'var(--ink)', '--lo': on }
}

/** The design's 12 leave colours (light theme "solid" values), stored as hex in the database */
export const LEAVE_PALETTE: { name: string, hex: string }[] = [
  { name: 'green', hex: '#007840' }, { name: 'blue', hex: '#2863ab' }, { name: 'red', hex: '#a04038' },
  { name: 'gray', hex: '#5a6475' }, { name: 'violet', hex: '#754d9e' }, { name: 'teal', hex: '#00787a' },
  { name: 'amber', hex: '#895800' }, { name: 'orange', hex: '#9b4805' }, { name: 'pink', hex: '#973f6e' },
  { name: 'indigo', hex: '#5658ab' }, { name: 'lime', hex: '#526f00' }, { name: 'cyan', hex: '#00709a' },
]

/**
 * Working days of a leave period, same rule as count_leave_days() in the
 * database: Mon–Fri, minus the public holidays of the person's country,
 * minus half a day when it starts in the afternoon or ends at noon.
 */
export function countLeaveDays(start: string, end: string, holidays: Record<string, string>, startHalf = false, endHalf = false): number {
  let days = 0
  let d = start
  while (d <= end) {
    if (!isWeekend(d) && !holidays[d]) {
      days += 1
      if (d === start && startHalf) days -= 0.5
      if (d === end && endHalf) days -= 0.5
    }
    d = addDays(d, 1)
  }
  return days
}

/** "2,5" / "2.5": day counts can be halves */
export const fmtDays = (n: number, locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n)

/**
 * Short label for a person in dense views: the first name, plus the initial of
 * the last name when several people share that first name ("Emma G.").
 */
export function shortNames(fullNames: readonly string[]): (full: string) => string {
  const count = new Map<string, number>()
  for (const n of new Set(fullNames)) {
    const first = n.split(' ')[0] ?? n
    count.set(first, (count.get(first) ?? 0) + 1)
  }
  return (full: string) => {
    const [first = full, ...rest] = full.split(' ')
    const last = rest.join(' ')
    return (count.get(first) ?? 0) > 1 && last ? `${first} ${last.charAt(0)}.` : first
  }
}

/** Lower-case text without accents, for searching ("Éloïse" → "eloise") */
export function foldText(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Accent- and case-insensitive "contains": a search for "emma" finds "Emma Employée", "eloise" finds "Éloïse" */
export function textMatch(haystack: string | null | undefined, query: string | null | undefined): boolean {
  const q = foldText(query)
  return !q || foldText(haystack).includes(q)
}
