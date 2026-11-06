/**
 * TND-30 lot 3 — recruitment statistics, computed from the applications and
 * their stage history. Pure functions (unit-tested).
 */
export interface StatApp { id: string, opening_id: string, stage: string, status: string, source: string, rejection_reason: string | null, created_at: string }
export interface StatEvent { application_id: string, kind: string, data: { from?: string, to?: string }, created_at: string }
export interface StatStage { key: string, label: string }

/** Furthest stage reached by each application (current stage or any stage it went through) */
export function furthestStage(app: StatApp, events: readonly StatEvent[], stages: readonly StatStage[]): number {
  const idx = (k?: string) => stages.findIndex(s => s.key === k)
  let best = idx(app.stage)
  for (const e of events) {
    if (e.application_id !== app.id) continue
    if (e.kind === 'stage') best = Math.max(best, idx(e.data.to))
    if (e.kind === 'hired') best = Math.max(best, idx('hired'))
  }
  if (app.status === 'hired') best = Math.max(best, idx('hired'))
  return Math.max(best, 0)
}

/** How many applications reached each stage (a funnel: never increasing) */
export function funnel(apps: readonly StatApp[], events: readonly StatEvent[], stages: readonly StatStage[]) {
  const reached = apps.map(a => furthestStage(a, events, stages))
  return stages.map((s, i) => ({ ...s, n: reached.filter(r => r >= i).length }))
}

/** Median number of days from application to hire, null when nobody was hired */
export function medianDaysToHire(apps: readonly StatApp[], events: readonly StatEvent[]): number | null {
  const days: number[] = []
  for (const a of apps) {
    if (a.status !== 'hired') continue
    const ev = events.filter(e => e.application_id === a.id && (e.kind === 'hired' || (e.kind === 'stage' && e.data.to === 'hired')))
      .sort((x, y) => x.created_at.localeCompare(y.created_at))[0]
    if (!ev) continue
    days.push(Math.max(0, Math.round((Date.parse(ev.created_at) - Date.parse(a.created_at)) / 86_400_000)))
  }
  if (!days.length) return null
  days.sort((x, y) => x - y)
  const m = Math.floor(days.length / 2)
  return days.length % 2 ? days[m]! : Math.round((days[m - 1]! + days[m]!) / 2)
}

/** Counts per key, largest first */
export function countBy<T>(items: readonly T[], key: (t: T) => string | null | undefined, limit = 6) {
  const map = new Map<string, number>()
  for (const it of items) {
    const k = key(it)?.trim()
    if (k) map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, limit)
}

/** Applications received per month over the last `n` months (oldest first) */
export function perMonth(apps: readonly StatApp[], today: string, n = 6) {
  const out: { month: string, n: number }[] = []
  const [y, m] = today.split('-').map(Number) as [number, number]
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    out.push({ month: key, n: apps.filter(a => a.created_at.slice(0, 7) === key).length })
  }
  return out
}

/** Short, stable pseudonym for anonymous screening (« A3F2 ») */
export function pseudonym(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h.toString(16).toUpperCase().padStart(4, '0').slice(-4)
}
