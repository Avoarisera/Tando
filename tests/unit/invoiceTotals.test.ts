import { describe, it, expect } from 'vitest'
import { computeInvoiceTotals, isLineValid, roundCents } from '~/utils/invoice-totals'

describe('computeInvoiceTotals', () => {
  it('sums net, VAT and gross per line', () => {
    const t = computeInvoiceTotals([
      { description: 'Développement', quantity: 3, unit_price: 500, vat_rate: 20 },
      { description: 'Hébergement', quantity: 1, unit_price: 49.9, vat_rate: 20 },
    ])
    expect(t.net).toBe(1549.9)
    expect(t.vat).toBe(309.98)
    expect(t.gross).toBe(1859.88)
  })
  it('rounds each line to the cent before summing', () => {
    const t = computeInvoiceTotals([
      { description: 'a', quantity: 1, unit_price: 0.335, vat_rate: 20 },
      { description: 'b', quantity: 1, unit_price: 0.335, vat_rate: 20 },
    ])
    expect(t.lines[0]).toEqual({ net: 0.34, vat: 0.07, gross: 0.41 })
    expect(t.net).toBe(0.68)
    expect(t.vat).toBe(0.14)
  })
  it('groups VAT by rate', () => {
    const t = computeInvoiceTotals([
      { description: 'a', quantity: 1, unit_price: 100, vat_rate: 20 },
      { description: 'b', quantity: 2, unit_price: 100, vat_rate: 5.5 },
    ])
    expect(t.byRate).toEqual({ 20: 20, 5.5: 11 })
  })
  it('treats invalid numbers as 0', () => {
    expect(computeInvoiceTotals([{ description: 'x', quantity: Number.NaN, unit_price: 10, vat_rate: 20 }]).gross).toBe(0)
  })
})

describe('isLineValid / roundCents', () => {
  it('requires a description and a positive quantity', () => {
    expect(isLineValid({ description: ' ', quantity: 1, unit_price: 1, vat_rate: 20 })).toBe(false)
    expect(isLineValid({ description: 'x', quantity: 0, unit_price: 1, vat_rate: 20 })).toBe(false)
    expect(isLineValid({ description: 'x', quantity: 1, unit_price: 0, vat_rate: 0 })).toBe(true)
  })
  it('rounds half up to the cent', () => {
    expect(roundCents(1.005)).toBe(1.01)
  })
})

describe('toWinAnsi', async () => {
  const { toWinAnsi } = await import('~/utils/invoice-pdf')
  it('keeps French accents and the euro sign, normalises special spaces', () => {
    expect(toWinAnsi('Développement 1 500,00 € – l’été')).toBe('Développement 1 500,00 € – l’été')
  })
  it('drops characters the standard fonts cannot print', () => {
    expect(toWinAnsi('OK ✓ 🎉')).toBe('OK  ')
  })
})

describe('generateInvoicePdf', () => {
  it('produces a PDF, with a second page for long invoices', async () => {
    const { generateInvoicePdf } = await import('~/utils/invoice-pdf')
    const { PDFDocument } = await import('pdf-lib')
    const labels = { title: 'Facture', billTo: 'Client', date: 'Date', due: 'Échéance', description: 'Désignation', qty: 'Qté', unitPrice: 'PU HT', vat: 'TVA', net: 'Total HT', vatTotal: 'Total TVA', gross: 'Total TTC', notes: 'Conditions', iban: 'IBAN', bic: 'BIC', vatNumber: 'TVA', page: 'Page' }
    const base = { reference: 'FAC-2026-004', client: 'ACME', invoiceDate: '2026-11-05', dueDate: '2026-12-05', currency: 'EUR', notes: 'Paiement à 30 jours', locale: 'fr-FR', labels,
      company: { legal_name: 'Acme Studio', address: '12 rue de l’Exemple, 75011 Paris', vat_number: 'FR00', iban: 'FR76', bic: 'AGRIFRPP', invoice_footer: 'Pénalités de retard : 3 fois le taux légal.' } }
    const short = await generateInvoicePdf({ ...base, lines: [{ description: 'Développement ✓', quantity: 3, unit_price: 500, vat_rate: 20 }] })
    expect(new TextDecoder().decode(short.slice(0, 5))).toBe('%PDF-')
    const long = await generateInvoicePdf({ ...base, lines: Array.from({ length: 40 }, (_, i) => ({ description: `Ligne ${i}`, quantity: 1, unit_price: 10, vat_rate: 20 })) })
    expect((await PDFDocument.load(long)).getPageCount()).toBeGreaterThan(1)
  })
})
