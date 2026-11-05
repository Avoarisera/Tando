/** Reads a design token (CSS custom property) for Chart.js, which needs plain colours. */
export function cssVar(name: string, fallback = '#888'): string {
  if (typeof window === 'undefined') return fallback
  const el = document.querySelector('.wb-app') ?? document.documentElement
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback
}

/** Series colours chart-1 … chart-6, colour-blind safe, in this order */
export const chartSeries = () => Array.from({ length: 6 }, (_, i) => cssVar(`--chart-${i + 1}`))
