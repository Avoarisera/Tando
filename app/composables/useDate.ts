export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = iso.substring(0, 10)
  return `${s.substring(8, 10)}/${s.substring(5, 7)}/${s.substring(0, 4)}`
}
