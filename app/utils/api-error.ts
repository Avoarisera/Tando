/**
 * Turns an ofetch error string ('[GET] "/api/metrics?…": 400 workspaceId requis')
 * into the server's own message ("workspaceId requis"). Server errors and
 * network failures return null, so the screen shows its generic message.
 */
export function readableApiError(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = /^\[\w+\]\s+"[^"]*":\s+(\d{3})\s*(.*)$/s.exec(raw)
  if (!m) return /fetch failed|NetworkError|Failed to fetch/i.test(raw) ? null : raw
  const status = Number(m[1])
  const text = (m[2] ?? '').trim()
  if (status >= 500 || !text) return null
  return text.charAt(0).toUpperCase() + text.slice(1)
}
