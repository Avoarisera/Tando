/**
 * Capacity of a dev over a date range: working days (Mon–Fri minus public
 * holidays of their country) and the leave days taken on them. Pure, so the
 * rule is unit-tested (tests/unit/capacity.test.ts). Dates are ISO strings.
 */

export interface CapacityLeave {
  start_date: string
  end_date: string
  start_half: boolean
  end_half: boolean
}

function addDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function isWeekendIso(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return dow === 0 || dow === 6
}

export function workingDaysIn(from: string, to: string, holidays: ReadonlySet<string>): string[] {
  const days: string[] = []
  for (let d = from; d <= to; d = addDay(d)) {
    if (!isWeekendIso(d) && !holidays.has(d)) days.push(d)
  }
  return days
}

/** Leave days counted on the working days of [from, to]; half days count 0.5 on the first / last day */
export function leaveDaysIn(from: string, to: string, holidays: ReadonlySet<string>, leaves: readonly CapacityLeave[]): number {
  const working = new Set(workingDaysIn(from, to, holidays))
  let total = 0
  for (const day of working) {
    let taken = 0
    for (const l of leaves) {
      if (day < l.start_date || day > l.end_date) continue
      let v = 1
      if (day === l.start_date && l.start_half) v -= 0.5
      if (day === l.end_date && l.end_half) v -= 0.5
      taken = Math.max(taken, v)
    }
    total += taken
  }
  return total
}

export function capacityOf(from: string, to: string, holidays: ReadonlySet<string>, leaves: readonly CapacityLeave[]) {
  const working = workingDaysIn(from, to, holidays).length
  const leave = leaveDaysIn(from, to, holidays, leaves)
  return { working, leave, available: Math.max(0, working - leave) }
}
