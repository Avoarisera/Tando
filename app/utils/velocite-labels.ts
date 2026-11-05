/** "2026-05" → "mai 26" (short) or "mai 2026" (long), in the active locale */
export function velociteMonth(m: string, locale: string, long = false): string {
  if (!m) return ''
  const s = fmtDate(`${m}-01`, locale, long ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Hours → "12 h" under a day, "1,5 j" beyond */
export function velociteDuration(h: number | null, locale: string): string {
  if (h === null || !(h > 0)) return '—'
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  return h < 24 ? `${nf.format(Math.round(h))} h` : `${nf.format(h / 24)} j`
}
