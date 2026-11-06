/**
 * TND-27 — "Who took how much leave": days per person and per leave type over a
 * calendar year, split into taken (before today) and planned (today and after),
 * plus the absences per month. Pure functions, unit-tested.
 */

export interface StatRequest {
  user_id: string
  start_date: string
  end_date: string
  start_half?: boolean | null
  end_half?: boolean | null
  status: string
  type: string
  color: string
}

export interface PersonStat {
  id: string
  taken: number
  planned: number
  /** per type, in the order of `types` */
  byType: Record<string, { taken: number, planned: number }>
  /** last day of leave already taken this year (null: none) */
  lastLeave: string | null
}

const isWeekendIso = (d: string) => {
  const w = new Date(`${d}T12:00:00Z`).getUTCDay()
  return w === 0 || w === 6
}
const nextDay = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + 1)
  return x.toISOString().slice(0, 10)
}

/** Working days of a request that fall in [from, to], half days counted at its own edges */
export function workingDaysIn(r: Pick<StatRequest, 'start_date' | 'end_date' | 'start_half' | 'end_half'>, from: string, to: string, holidays: Record<string, string> = {}): number {
  const a = r.start_date > from ? r.start_date : from
  const b = r.end_date < to ? r.end_date : to
  let n = 0
  for (let d = a; d <= b; d = nextDay(d)) {
    if (isWeekendIso(d) || holidays[d]) continue
    let v = 1
    if (d === r.start_date && r.start_half) v -= 0.5
    if (d === r.end_date && r.end_half) v -= 0.5
    n += v
  }
  return n
}

/** Leave that counts: approved, or approved and waiting for a cancellation */
export const countsAsLeave = (status: string) => status === 'approved' || status === 'cancel_requested'

export function leaveStats(requests: readonly StatRequest[], year: number, today: string, holidays: Record<string, string> = {}) {
  const first = `${year}-01-01`
  const last = `${year}-12-31`
  const yesterday = (() => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10) })()
  const people = new Map<string, PersonStat>()
  const types = new Map<string, string>() // name → colour, first seen order
  const months = Array.from({ length: 12 }, () => ({} as Record<string, number>))

  for (const r of requests) {
    if (!countsAsLeave(r.status) || r.end_date < first || r.start_date > last) continue
    if (!types.has(r.type)) types.set(r.type, r.color)
    const p = people.get(r.user_id) ?? { id: r.user_id, taken: 0, planned: 0, byType: {}, lastLeave: null }
    const taken = workingDaysIn(r, first, yesterday < last ? yesterday : last, holidays)
    const planned = workingDaysIn(r, today > first ? today : first, last, holidays)
    const t = p.byType[r.type] ?? { taken: 0, planned: 0 }
    t.taken += taken
    t.planned += planned
    p.byType[r.type] = t
    p.taken += taken
    p.planned += planned
    if (taken > 0) {
      const end = r.end_date < today ? r.end_date : yesterday
      if (!p.lastLeave || end > p.lastLeave) p.lastLeave = end
    }
    people.set(r.user_id, p)
    // per month (taken and planned alike: it is the team's load)
    for (let m = 0; m < 12; m++) {
      const mm = String(m + 1).padStart(2, '0')
      const mFirst = `${year}-${mm}-01`
      const mLast = `${year}-${mm}-${new Date(Date.UTC(year, m + 1, 0)).getUTCDate()}`
      if (r.end_date < mFirst || r.start_date > mLast) continue
      const n = workingDaysIn(r, mFirst, mLast, holidays)
      if (n) months[m]![r.type] = (months[m]![r.type] ?? 0) + n
    }
  }
  return { people, types: [...types].map(([name, color]) => ({ name, color })), months }
}

/**
 * "Little leave" flag (fatigue signal): past mid-year and under 25 % of the paid
 * leave allowance used, or no leave taken for 4 months while the year is under way.
 */
export function littleLeave(p: Pick<PersonStat, 'taken' | 'lastLeave'> | undefined, allowance: number | null, today: string, year: number): boolean {
  if (Number(today.slice(0, 4)) !== year) return false
  const dayOfYear = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${year}-01-01T00:00:00Z`)) / 86_400_000
  const taken = p?.taken ?? 0
  if (dayOfYear > 182 && allowance && taken / allowance < 0.25) return true
  if (dayOfYear < 120) return false
  const last = p?.lastLeave
  const sinceDays = last ? (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000 : dayOfYear
  return sinceDays > 120
}
