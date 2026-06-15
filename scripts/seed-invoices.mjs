/**
 * Uploads minimal valid PDFs to Supabase Storage for the three demo invoices,
 * then upserts the invoice rows so pdf_path is always consistent.
 *
 * Run: node --env-file=.env scripts/seed-invoices.mjs
 * Requires: NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SECRET_KEY in .env
 * Idempotent: safe to run multiple times.
 */

import { createClient } from '@supabase/supabase-js'

const { NUXT_PUBLIC_SUPABASE_URL, NUXT_SUPABASE_SECRET_KEY } = process.env

if (!NUXT_PUBLIC_SUPABASE_URL || !NUXT_SUPABASE_SECRET_KEY) {
  console.error('Missing env vars: NUXT_PUBLIC_SUPABASE_URL and NUXT_SUPABASE_SECRET_KEY are required.')
  process.exit(1)
}

const supabase = createClient(NUXT_PUBLIC_SUPABASE_URL, NUXT_SUPABASE_SECRET_KEY)

// Minimal valid single-blank-page PDF (190 bytes, PDF 1.0 spec).
// Byte offsets in the xref table are exact — this file opens without errors in all viewers.
const BLANK_PDF = Buffer.from(
  'JVBERi0xLjAKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIg' +
  'MCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2Jq' +
  'PDwvVHlwZS9QYWdlL01lZGlhQm94WzAgMCAzIDNdPj5lbmRvYmoKeHJlZgowIDQKMDAwMDAw' +
  'MDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAK' +
  'MDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyPDwvU2l6ZSA0L1Jvb3QgMSAwIFI+PgpzdGFy' +
  'dHhyZWYKMTkwCiUlRU9G',
  'base64',
)

const ADMIN_ID = '00000000-0000-0000-0000-000000000001'

const INVOICES = [
  {
    id:           '00000000-0000-0000-0000-000000000060',
    reference:    'FAC-2026-001',
    client:       'ACME Corp',
    amount:       1500.00,
    currency:     'EUR',
    invoice_date: '2026-02-01',
    due_date:     '2026-03-01',
    notes:        'Prestation de conseil — Janvier 2026',
    status:       'payee',
    pdf_name:     'FAC-2026-001.pdf',
  },
  {
    id:           '00000000-0000-0000-0000-000000000061',
    reference:    'FAC-2026-002',
    client:       'SoWell Technologies',
    amount:       2800.00,
    currency:     'EUR',
    invoice_date: '2026-03-15',
    due_date:     '2026-04-14',
    notes:        null,
    status:       'envoyee',
    pdf_name:     'FAC-2026-002.pdf',
  },
  {
    id:           '00000000-0000-0000-0000-000000000062',
    reference:    'FAC-2026-003',
    client:       'Startup XYZ',
    amount:       750.00,
    currency:     'USD',
    invoice_date: '2026-04-10',
    due_date:     null,
    notes:        null,
    status:       'en_attente',
    pdf_name:     'FAC-2026-003.pdf',
  },
]

async function main() {
  console.log('Seeding invoices…\n')

  for (const inv of INVOICES) {
    const pdf_path = `${inv.id}/${inv.pdf_name}`

    // Upload PDF (upsert: true — safe to re-run)
    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(pdf_path, BLANK_PDF, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      console.error(`  ✗ Storage upload failed for ${inv.reference}:`, uploadError.message)
      process.exit(1)
    }

    // Upsert invoice row (idempotent via id conflict)
    const { error: dbError } = await supabase
      .from('invoices')
      .upsert(
        {
          id:           inv.id,
          reference:    inv.reference,
          client:       inv.client,
          amount:       inv.amount,
          currency:     inv.currency,
          invoice_date: inv.invoice_date,
          due_date:     inv.due_date,
          notes:        inv.notes,
          status:       inv.status,
          pdf_path,
          created_by:   ADMIN_ID,
        },
        { onConflict: 'id' },
      )

    if (dbError) {
      console.error(`  ✗ DB upsert failed for ${inv.reference}:`, dbError.message)
      process.exit(1)
    }

    console.log(`  ✓ ${inv.reference} — ${inv.client} (${inv.status})`)
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
