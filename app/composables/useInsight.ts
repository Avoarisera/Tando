import type { MonthlyMetrics } from './useMetrics'

type MetricKey = 'ticketsCount' | 'pointsSum' | 'bugsCount' | 'medianDevCycleHours' | 'avgSize'

function avg(metrics: Record<string, MonthlyMetrics>, months: string[], key: MetricKey, n = 3): number {
  const slice = months.slice(-n)
  if (!slice.length) return 0
  return slice.reduce((s, m) => s + (metrics[m]?.[key] ?? 0), 0) / slice.length
}

function trend(metrics: Record<string, MonthlyMetrics>, months: string[], key: MetricKey): 'up' | 'down' | 'neutral' {
  if (months.length < 2) return 'neutral'
  const last = months[months.length - 1]!
  const prev = months[months.length - 2]!
  const cur = metrics[last]?.[key] ?? 0
  const pre = metrics[prev]?.[key] ?? 0
  if (pre === 0) return 'neutral'
  const delta = (cur - pre) / pre
  if (delta > 0.1) return 'up'
  if (delta < -0.1) return 'down'
  return 'neutral'
}

export function useInsight(
  metrics: Record<string, MonthlyMetrics>,
  months: string[],
) {
  function insightForMetric(key: MetricKey): string {
    const avgVal = avg(metrics, months, key)
    const t = trend(metrics, months, key)

    switch (key) {
      case 'ticketsCount': {
        const label = avgVal.toFixed(1)
        if (t === 'up') return `Volume en hausse — moyenne ${label} tickets/mois sur les 3 derniers mois.`
        if (t === 'down') return `Volume en baisse — moyenne ${label} tickets/mois sur les 3 derniers mois.`
        return `Volume stable — moyenne ${label} tickets/mois sur les 3 derniers mois.`
      }
      case 'pointsSum': {
        const label = avgVal.toFixed(1)
        if (t === 'up') return `Complexité livrée en hausse — ${label} pts/mois en moyenne.`
        if (t === 'down') return `Complexité livrée en baisse — ${label} pts/mois en moyenne.`
        return `Complexité stable — ${label} pts/mois en moyenne.`
      }
      case 'bugsCount': {
        const tickets = avg(metrics, months, 'ticketsCount')
        if (tickets === 0) return 'Pas de données suffisantes.'
        const ratio = Math.round((avgVal / tickets) * 100)
        if (ratio > 40) return `Profil orienté bugs urgents — ${ratio}% des tickets sans estimation.`
        if (ratio < 15) return `Profil orienté features — seulement ${ratio}% de bugs urgents.`
        return `Mix équilibré — ${ratio}% de tickets sans estimation (proxy bugs).`
      }
      case 'medianDevCycleHours': {
        const h = avgVal.toFixed(0)
        if (avgVal > 48) return `Cycle dev long — médiane ${h}h. Peut indiquer des tickets bloqués.`
        if (avgVal < 8) return `Cycle dev très court — médiane ${h}h. Tickets fractionnés.`
        return `Cycle dev nominal — médiane ${h}h.`
      }
      case 'avgSize': {
        const s = avgVal.toFixed(1)
        if (avgVal > 5) return `Tickets de grande taille en moyenne (${s} pts).`
        if (avgVal < 2) return `Petits tickets en moyenne (${s} pts).`
        return `Taille de tickets standard — ${s} pts en moyenne.`
      }
    }
  }

  return { insightForMetric }
}
