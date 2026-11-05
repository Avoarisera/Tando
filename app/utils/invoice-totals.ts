/**
 * Invoice totals. Each line is rounded to the cent (HT and VAT), then summed,
 * which is how the amounts are printed on the PDF.
 */
export interface InvoiceLineInput {
  description: string
  quantity: number
  unit_price: number
  vat_rate: number
}

export interface InvoiceTotals {
  lines: { net: number, vat: number, gross: number }[]
  net: number
  vat: number
  gross: number
  /** VAT amount per rate, e.g. { 20: 300, 5.5: 11 } */
  byRate: Record<string, number>
}

export const roundCents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function computeInvoiceTotals(lines: readonly InvoiceLineInput[]): InvoiceTotals {
  const out = lines.map((l) => {
    const qty = Number.isFinite(l.quantity) ? l.quantity : 0
    const price = Number.isFinite(l.unit_price) ? l.unit_price : 0
    const rate = Number.isFinite(l.vat_rate) ? l.vat_rate : 0
    const net = roundCents(qty * price)
    const vat = roundCents(net * rate / 100)
    return { net, vat, gross: roundCents(net + vat), rate }
  })
  const byRate: Record<string, number> = {}
  for (const l of out) byRate[String(l.rate)] = roundCents((byRate[String(l.rate)] ?? 0) + l.vat)
  const net = roundCents(out.reduce((s, l) => s + l.net, 0))
  const vat = roundCents(out.reduce((s, l) => s + l.vat, 0))
  return { lines: out.map(({ net, vat, gross }) => ({ net, vat, gross })), net, vat, gross: roundCents(net + vat), byRate }
}

/** A line is valid when it has a description, a positive quantity and a price ≥ 0 */
export function isLineValid(l: InvoiceLineInput): boolean {
  return l.description.trim().length > 0 && l.quantity > 0 && l.unit_price >= 0 && l.vat_rate >= 0 && l.vat_rate <= 100
}
