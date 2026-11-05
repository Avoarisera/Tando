import { describe, it, expect } from 'vitest'
import { fetchAllByIds, fetchAllRows, periodStart } from '../../server/utils/paginate'

const rows = Array.from({ length: 2345 }, (_, i) => ({ id: i }))
const page = (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null })

describe('fetchAllRows (PostgREST stops at 1000 rows)', () => {
  it('reads every page', async () => {
    const all = await fetchAllRows(page)
    expect(all).toHaveLength(2345)
    expect(all.at(-1)).toEqual({ id: 2344 })
  })
  it('stops on an exact multiple of the page size', async () => {
    const calls: number[] = []
    const two = rows.slice(0, 2000)
    await fetchAllRows((from, to) => { calls.push(from); return Promise.resolve({ data: two.slice(from, to + 1), error: null }) })
    expect(calls).toEqual([0, 1000, 2000])
  })
  it('throws on a database error', async () => {
    await expect(fetchAllRows(() => Promise.resolve({ data: null, error: { message: 'boom' } }))).rejects.toThrow()
  })
})

describe('fetchAllByIds', () => {
  it('splits ids into chunks and merges every page of each', async () => {
    const ids = Array.from({ length: 320 }, (_, i) => `i${i}`)
    const seen: number[] = []
    const all = await fetchAllByIds(ids, (chunk, from, to) => { seen.push(chunk.length); return Promise.resolve({ data: chunk.slice(from, to + 1).map(id => ({ id })), error: null }) })
    expect(all).toHaveLength(320)
    expect(seen.sort()).toEqual([150, 150, 20].sort())
  })
})

describe('periodStart', () => {
  it('is the first day of the earliest month', () => {
    expect(periodStart(['2026-11', '2026-06', '2026-09'])).toBe('2026-06-01T00:00:00.000Z')
    expect(periodStart([])).toBeNull()
  })
})
