import { createError } from 'h3'
/**
 * PostgREST answers at most `max_rows` rows (1000 on this project) per request,
 * silently. Every Vélocité query that can exceed it goes through these helpers
 * (TND-24: a team has ~1,850 delivered tickets and ~23,000 history rows).
 */

export const PAGE_SIZE = 1000

interface PageResult<T> { data: T[] | null, error: { message: string } | null }

/** Reads every page of a query: `build(from, to)` must apply `.range(from, to)` on a stable order */
export async function fetchAllRows<T>(build: (from: number, to: number) => PromiseLike<PageResult<T>>, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return rows
  }
}

/** Splits ids in chunks (URL length) and reads every page of each chunk, chunks in parallel */
export async function fetchAllByIds<T>(ids: string[], build: (chunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>, chunkSize = 150): Promise<T[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize))
  const parts = await Promise.all(chunks.map(chunk => fetchAllRows<T>((from, to) => build(chunk, from, to))))
  return parts.flat()
}

/** First day of the earliest month of a list of 'YYYY-MM' keys, as an ISO string (period lower bound) */
export function periodStart(months: string[]): string | null {
  const first = [...months].sort()[0]
  return first ? new Date(`${first}-01T00:00:00Z`).toISOString() : null
}
