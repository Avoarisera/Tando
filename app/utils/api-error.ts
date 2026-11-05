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

/**
 * Message of anything thrown: Error, Supabase/PostgREST error objects
 * ({ message, details, hint }), strings. Never "[object Object]".
 */
export function errorMessage(e: unknown, fallback = 'Erreur inattendue'): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string' && e) return e
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    const m = (e as { message: string }).message
    if (m) return m
  }
  return fallback
}
