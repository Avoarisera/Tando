import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { computeInvoiceTotals, type InvoiceLineInput } from './invoice-totals'

/** Data printed on the invoice (R8-G). Labels come from i18n, so the PDF follows the UI language. */
export interface InvoicePdfData {
  reference: string
  client: string
  invoiceDate: string
  dueDate: string | null
  currency: string
  notes: string | null
  lines: InvoiceLineInput[]
  company: { legal_name: string, address: string, vat_number: string, iban: string, bic: string, invoice_footer: string }
  locale: string
  labels: { title: string, billTo: string, date: string, due: string, description: string, qty: string, unitPrice: string, vat: string, net: string, vatTotal: string, gross: string, notes: string, iban: string, bic: string, vatNumber: string, page: string }
}

// Characters outside Latin-1 that the WinAnsi encoding of the standard fonts still has
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')

/** Standard PDF fonts only encode WinAnsi: normalise spaces and drop what can't be printed */
export function toWinAnsi(text: string): string {
  return text
    .replace(/[    ]/g, ' ')
    .replace(/[‐‑−]/g, '-')
    .split('')
    .filter(ch => ch === '\n' || (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126) || (ch.charCodeAt(0) >= 160 && ch.charCodeAt(0) <= 255) || WIN_ANSI_EXTRA.has(ch))
    .join('')
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of toWinAnsi(text).split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= width) line = next
      else {
        if (line) out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}

export async function generateInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(toWinAnsi(`${d.labels.title} ${d.reference}`))
  pdf.setProducer('WakaBods')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.07, 0.1, 0.18)
  const mute = rgb(0.33, 0.37, 0.47)
  const line = rgb(0.85, 0.87, 0.92)
  const W = 595.28
  const H = 841.89
  const M = 48
  const money = (n: number) => toWinAnsi(new Intl.NumberFormat(d.locale, { style: 'currency', currency: d.currency }).format(n))
  const date = (s: string) => toWinAnsi(new Intl.DateTimeFormat(d.locale, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${s}T00:00:00Z`)))
  const totals = computeInvoiceTotals(d.lines)

  let page: PDFPage = pdf.addPage([W, H])
  let y = H - M
  const text = (s: string, x: number, yy: number, size = 10, font = regular, color = ink) => page.drawText(toWinAnsi(s), { x, y: yy, size, font, color })
  const right = (s: string, xr: number, yy: number, size = 10, font = regular, color = ink) => {
    const v = toWinAnsi(s)
    page.drawText(v, { x: xr - font.widthOfTextAtSize(v, size), y: yy, size, font, color })
  }

  // Header: company on the left, title and number on the right
  text(d.company.legal_name || ' ', M, y, 14, bold)
  right(d.labels.title, W - M, y, 20, bold)
  y -= 16
  right(d.reference, W - M, y, 10, regular, mute)
  for (const l of wrap(d.company.address, regular, 9, 260)) { text(l, M, y, 9, regular, mute); y -= 12 }
  if (d.company.vat_number) { text(`${d.labels.vatNumber} ${d.company.vat_number}`, M, y, 9, regular, mute); y -= 12 }

  // Client and dates
  y -= 18
  text(d.labels.billTo, M, y, 8, regular, mute)
  text(d.labels.date, W / 2 + 40, y, 8, regular, mute)
  y -= 13
  text(d.client, M, y, 11, bold)
  text(date(d.invoiceDate), W / 2 + 40, y, 10)
  if (d.dueDate) {
    y -= 18
    text(d.labels.due, W / 2 + 40, y + 5, 8, regular, mute)
    text(date(d.dueDate), W / 2 + 40, y - 8, 10)
    y -= 8
  }

  // Lines
  y -= 30
  const cols = { desc: M, qty: 330, unit: 410, vat: 460, net: W - M }
  const header = () => {
    text(d.labels.description, cols.desc, y, 8, bold)
    right(d.labels.qty, cols.qty, y, 8, bold)
    right(d.labels.unitPrice, cols.unit, y, 8, bold)
    right(d.labels.vat, cols.vat, y, 8, bold)
    right(d.labels.net, cols.net, y, 8, bold)
    y -= 6
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.5, color: ink })
    y -= 14
  }
  header()
  d.lines.forEach((l, i) => {
    const descLines = wrap(l.description, regular, 9, cols.qty - cols.desc - 40)
    const rowH = descLines.length * 12 + 6
    if (y - rowH < M + 140) {
      page = pdf.addPage([W, H])
      y = H - M
      header()
    }
    descLines.forEach((dl, k) => text(dl, cols.desc, y - k * 12, 9))
    right(new Intl.NumberFormat(d.locale, { maximumFractionDigits: 2 }).format(l.quantity), cols.qty, y, 9)
    right(money(l.unit_price), cols.unit, y, 9)
    right(`${new Intl.NumberFormat(d.locale, { maximumFractionDigits: 2 }).format(l.vat_rate)} %`, cols.vat, y, 9)
    right(money(totals.lines[i]?.net ?? 0), cols.net, y, 9)
    y -= rowH
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.5, color: line })
  })

  // Totals
  y -= 10
  const tl = W - M - 200
  text(d.labels.net, tl, y, 10); right(money(totals.net), W - M, y, 10); y -= 16
  text(d.labels.vatTotal, tl, y, 10); right(money(totals.vat), W - M, y, 10); y -= 8
  page.drawLine({ start: { x: tl, y }, end: { x: W - M, y }, thickness: 1.5, color: ink }); y -= 16
  text(d.labels.gross, tl, y, 12, bold); right(money(totals.gross), W - M, y, 12, bold)

  // Footer: notes, bank details, legal mentions
  let fy = M + 90
  if (d.notes) {
    text(d.labels.notes, M, fy, 8, bold); fy -= 12
    for (const l of wrap(d.notes, regular, 8, W - 2 * M).slice(0, 3)) { text(l, M, fy, 8, regular, mute); fy -= 11 }
  }
  if (d.company.iban) { text(`${d.labels.iban} ${d.company.iban}${d.company.bic ? `  ·  ${d.labels.bic} ${d.company.bic}` : ''}`, M, fy, 8, regular, mute); fy -= 11 }
  for (const l of wrap(d.company.invoice_footer, regular, 7, W - 2 * M).slice(0, 3)) { text(l, M, fy, 7, regular, mute); fy -= 10 }

  const pages = pdf.getPages()
  if (pages.length > 1) pages.forEach((p, i) => p.drawText(toWinAnsi(`${d.labels.page} ${i + 1} / ${pages.length}`), { x: W - M - 50, y: 24, size: 8, font: regular, color: mute }))

  return pdf.save()
}
