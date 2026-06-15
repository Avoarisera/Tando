# Implementation Prompt — RFC-016: Factures Vault PDF

## Context

You are implementing **RFC-016** — the `/invoices` admin page with invoice CRUD, PDF upload, and status management.

WakaBods is a lightweight HR platform built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. Product language: **French**.

## What has already been implemented

RFC-001 through RFC-015 are complete. The `invoices` table exists with RLS (RFC-014). The Supabase Storage bucket `invoices` is private with admin-only policy.

## Your task

Implement all changes in `RFCs/RFC-016-Factures-Vault.md`:

1. `app/types/index.ts` — add `Invoice`, `InvoiceStatus`, `InvoiceCurrency`
2. `app/composables/useInvoices.ts` — new composable (fetch, create, updateStatus, uploadPdf, getSignedUrl)
3. `app/components/invoice/InvoiceStatusBadge.vue` — status badge (en_attente/envoyee/payee)
4. `app/components/invoice/InvoiceForm.vue` — create modal with all fields + validation
5. `app/components/invoice/InvoiceTable.vue` — list with status change, PDF upload/view
6. `app/pages/invoices.vue` — admin-only page orchestrating the above

## Two-Phase Approach

### Phase 1 — Planning (No Code)
Read the RFC. Present the file list, component responsibilities, and how the PDF upload input is wired to the table row.

### Phase 2 — Implementation

## Non-negotiable rules

1. TypeScript strict — `Invoice`, `InvoiceStatus`, `InvoiceCurrency` fully typed
2. `definePageMeta({ middleware: 'admin-only', layout: 'private' })`
3. PDF validation: check `file.type === 'application/pdf'` before upload
4. Signed URL: always call `createSignedUrl(path, 60)` at click time — never store the URL
5. 4 UI states on the invoice list
6. Inline error in create modal — modal stays open on error

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes
- [ ] `/invoices` redirects employee/manager to 403
- [ ] Create invoice — happy path and duplicate reference error
- [ ] Upload PDF — spinner, toast, "Voir PDF" button appears
- [ ] Non-PDF file → client-side rejection with toast
- [ ] "Voir PDF" → signed URL opens in new tab
- [ ] Status change → saved + toast
- [ ] Filter by status — client-side, no API call
- [ ] Responsive 375px and 1280px
