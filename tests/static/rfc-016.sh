# RFC-016: Factures Vault (F39, F40, F41)
# Sourced by tests/static-analysis.sh — uses ROOT, pass(), fail(), check_*() from parent

echo ""
echo "=== RFC-016: Factures Vault ==="
echo ""

# ── Required files ────────────────────────────────────────────────────────────

check_file "app/pages/invoices.vue"
check_file "app/composables/useInvoices.ts"
check_file "app/components/invoice/InvoiceForm.vue"
check_file "app/components/invoice/InvoiceTable.vue"
check_file "app/components/invoice/InvoiceStatusBadge.vue"

# ── Types ─────────────────────────────────────────────────────────────────────

count=$(grep -c "interface Invoice " "$ROOT/app/types/index.ts" 2>/dev/null); count=${count:-0}
check_nonzero "types/index.ts: Invoice interface defined" "$count"

count=$(grep -c "InvoiceStatus" "$ROOT/app/types/index.ts" 2>/dev/null); count=${count:-0}
check_nonzero "types/index.ts: InvoiceStatus type defined" "$count"

count=$(grep -c "InvoiceCurrency" "$ROOT/app/types/index.ts" 2>/dev/null); count=${count:-0}
check_nonzero "types/index.ts: InvoiceCurrency type defined" "$count"

# ── Admin-only middleware ─────────────────────────────────────────────────────

count=$(grep -c "middleware.*admin-only" "$ROOT/app/pages/invoices.vue" 2>/dev/null); count=${count:-0}
check_nonzero "invoices.vue: admin-only middleware declared in definePageMeta" "$count"

# ── 4 mandatory UI states ─────────────────────────────────────────────────────

count=$(grep -c "AppSkeleton" "$ROOT/app/pages/invoices.vue" 2>/dev/null); count=${count:-0}
check_nonzero "invoices.vue: AppSkeleton present (loading state)" "$count"

count=$(grep -c "AppErrorBanner" "$ROOT/app/pages/invoices.vue" 2>/dev/null); count=${count:-0}
check_nonzero "invoices.vue: AppErrorBanner present (error state)" "$count"

count=$(grep -c "AppEmptyState" "$ROOT/app/pages/invoices.vue" 2>/dev/null); count=${count:-0}
check_nonzero "invoices.vue: AppEmptyState present (empty state)" "$count"

# ── Inline form error — modal stays open on server error ─────────────────────

count=$(grep -c "formError" "$ROOT/app/pages/invoices.vue" 2>/dev/null); count=${count:-0}
check_nonzero "invoices.vue: formError inline error (modal stays open on server error)" "$count"

# ── PDF type guard before upload ──────────────────────────────────────────────

count=$(grep -c "application/pdf" "$ROOT/app/pages/invoices.vue" 2>/dev/null); count=${count:-0}
check_nonzero "invoices.vue: file.type === 'application/pdf' guard before upload" "$count"

# ── Signed URL generated at click time, not cached ───────────────────────────

count=$(grep -c "getSignedUrl" "$ROOT/app/pages/invoices.vue" 2>/dev/null); count=${count:-0}
check_nonzero "invoices.vue: getSignedUrl called at click time (never cached)" "$count"

# ── noopener on window.open ───────────────────────────────────────────────────

count=$(grep -c "noopener" "$ROOT/app/pages/invoices.vue" 2>/dev/null); count=${count:-0}
check_nonzero "invoices.vue: window.open uses 'noopener' (security)" "$count"

# ── Client-side filter via computed ──────────────────────────────────────────

count=$(grep -c "filteredInvoices" "$ROOT/app/pages/invoices.vue" 2>/dev/null); count=${count:-0}
check_nonzero "invoices.vue: filteredInvoices computed (client-side filter, no API call)" "$count"

# ── uploadingId spinner guard ─────────────────────────────────────────────────

count=$(grep -c "uploadingId" "$ROOT/app/pages/invoices.vue" 2>/dev/null); count=${count:-0}
check_nonzero "invoices.vue: uploadingId guard (prevents concurrent uploads)" "$count"

# ── onMounted calls fetchInvoices ─────────────────────────────────────────────

count=$(grep -c "onMounted(fetchInvoices)" "$ROOT/app/pages/invoices.vue" 2>/dev/null); count=${count:-0}
check_nonzero "invoices.vue: onMounted(fetchInvoices) called" "$count"

# ── Forbidden patterns — page + composable + components ──────────────────────

count=$(grep -cE "console\.log|TODO|FIXME|: any\b" "$ROOT/app/pages/invoices.vue" 2>/dev/null); count=${count:-0}
check_zero "invoices.vue: no console.log, TODO, FIXME, or :any" "$count"

count=$(grep -cE "console\.log|TODO|FIXME|: any\b" "$ROOT/app/composables/useInvoices.ts" 2>/dev/null); count=${count:-0}
check_zero "useInvoices.ts: no console.log, TODO, FIXME, or :any" "$count"

count=$(grep -rE "console\.log|TODO|FIXME|: any\b" "$ROOT/app/components/invoice/" 2>/dev/null | wc -l); count=${count:-0}
check_zero "invoice/ components: no console.log, TODO, FIXME, or :any" "$count"

# ── SERVICE_KEY never in client files ─────────────────────────────────────────

count=$(grep -r "SERVICE_KEY" "$ROOT/app/" 2>/dev/null | wc -l); count=${count:-0}
check_zero "app/: SUPABASE_SERVICE_KEY never referenced in client code (S-016-008)" "$count"

# ── Composable: readonly() on all exposed refs ────────────────────────────────

count=$(grep -c "readonly(invoices)" "$ROOT/app/composables/useInvoices.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useInvoices.ts: invoices wrapped in readonly()" "$count"

count=$(grep -c "readonly(isLoading)" "$ROOT/app/composables/useInvoices.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useInvoices.ts: isLoading wrapped in readonly()" "$count"

count=$(grep -c "readonly(error)" "$ROOT/app/composables/useInvoices.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useInvoices.ts: error wrapped in readonly()" "$count"

# ── Composable: signed URL TTL = 60s (not public, not longer) ────────────────

count=$(grep -c "createSignedUrl(path, 60)" "$ROOT/app/composables/useInvoices.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useInvoices.ts: signed URL TTL = 60s" "$count"

# ── Composable: filename sanitized before upload ──────────────────────────────

count=$(grep -c "replace(" "$ROOT/app/composables/useInvoices.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useInvoices.ts: filename sanitized before Storage upload (replace unsafe chars)" "$count"

# ── Composable: upsert:true on upload (second PDF replaces first) ─────────────

count=$(grep -c "upsert: true" "$ROOT/app/composables/useInvoices.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useInvoices.ts: upsert:true on storage.upload (second PDF replaces first)" "$count"

# ── Composable: storage path prefixed with invoiceId ─────────────────────────

count=$(grep -c "\`\${invoiceId}" "$ROOT/app/composables/useInvoices.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useInvoices.ts: storage path scoped to invoiceId/ prefix" "$count"

# ── InvoiceForm: G1 fix — due_date < invoice_date validation ─────────────────

count=$(grep -c "dueDate.value < invoiceDate.value" "$ROOT/app/components/invoice/InvoiceForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero "InvoiceForm.vue: due_date < invoice_date validation present (G1 fix)" "$count"

# ── InvoiceForm: all required fields validated ────────────────────────────────

count=$(grep -c "La référence est obligatoire" "$ROOT/app/components/invoice/InvoiceForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero "InvoiceForm.vue: empty reference validation message present" "$count"

count=$(grep -c "Le client est obligatoire" "$ROOT/app/components/invoice/InvoiceForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero "InvoiceForm.vue: empty client validation message present" "$count"

count=$(grep -c "supérieur à 0" "$ROOT/app/components/invoice/InvoiceForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero "InvoiceForm.vue: amount > 0 validation message present" "$count"

count=$(grep -c "La date de facture est obligatoire" "$ROOT/app/components/invoice/InvoiceForm.vue" 2>/dev/null); count=${count:-0}
check_nonzero "InvoiceForm.vue: invoice_date required validation message present" "$count"

# ── InvoiceStatusBadge: all three statuses handled ───────────────────────────

count=$(grep -c "en_attente" "$ROOT/app/components/invoice/InvoiceStatusBadge.vue" 2>/dev/null); count=${count:-0}
check_nonzero "InvoiceStatusBadge.vue: en_attente status handled" "$count"

count=$(grep -c "envoyee" "$ROOT/app/components/invoice/InvoiceStatusBadge.vue" 2>/dev/null); count=${count:-0}
check_nonzero "InvoiceStatusBadge.vue: envoyee status handled" "$count"

count=$(grep -c "payee" "$ROOT/app/components/invoice/InvoiceStatusBadge.vue" 2>/dev/null); count=${count:-0}
check_nonzero "InvoiceStatusBadge.vue: payee status handled" "$count"

# ── InvoiceStatusBadge: title + aria-label for accessibility ─────────────────

count=$(grep -c 'aria-label' "$ROOT/app/components/invoice/InvoiceStatusBadge.vue" 2>/dev/null); count=${count:-0}
check_nonzero "InvoiceStatusBadge.vue: aria-label present (accessible, not color-only)" "$count"
