# RFC-006: Shared UI Components (AppConfirmModal, useToast, AppToastContainer)
# Sourced by tests/static-analysis.sh — uses ROOT, pass(), fail(), check_*() from parent

echo ""
echo "=== RFC-006: Shared UI Components ==="
echo ""

# --- Required files ----------------------------------------------------------
check_file "app/components/app/AppModal.vue"
check_file "app/components/app/AppConfirmModal.vue"
check_file "app/components/app/AppToast.vue"
check_file "app/components/app/AppToastContainer.vue"
check_file "app/composables/useToast.ts"

# --- AppModal accessibility --------------------------------------------------
count=$(grep -c 'role="dialog"' "$ROOT/app/components/app/AppModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppModal.vue: role="dialog"' "$count"

count=$(grep -c 'aria-modal="true"' "$ROOT/app/components/app/AppModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppModal.vue: aria-modal="true"' "$count"

count=$(grep -c 'aria-labelledby="modal-title"' "$ROOT/app/components/app/AppModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppModal.vue: aria-labelledby="modal-title"' "$count"

count=$(grep -c 'id="modal-title"' "$ROOT/app/components/app/AppModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppModal.vue: h2 has id="modal-title"' "$count"

count=$(grep -c 'aria-label="Fermer"' "$ROOT/app/components/app/AppModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppModal.vue: close button has aria-label="Fermer"' "$count"

count=$(grep -c 'Escape' "$ROOT/app/components/app/AppModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppModal.vue: handles Escape key' "$count"

count=$(grep -c '@click.self' "$ROOT/app/components/app/AppModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppModal.vue: backdrop uses @click.self' "$count"

count=$(grep -c 'onMounted\|onUnmounted' "$ROOT/app/components/app/AppModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppModal.vue: keydown listener registered and cleaned up' "$count"

# --- AppConfirmModal ---------------------------------------------------------
count=$(grep -c 'isConfirming' "$ROOT/app/components/app/AppConfirmModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppConfirmModal.vue: isConfirming state present' "$count"

count=$(grep -c 'animate-spin' "$ROOT/app/components/app/AppConfirmModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppConfirmModal.vue: spinner element present' "$count"

count=$(grep -c ':disabled="isConfirming"' "$ROOT/app/components/app/AppConfirmModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppConfirmModal.vue: confirm button disabled while isConfirming' "$count"

count=$(grep -c "emit('confirm')\|emit(\"confirm\")" "$ROOT/app/components/app/AppConfirmModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero "AppConfirmModal.vue: emits 'confirm'" "$count"

count=$(grep -c "emit('cancel')\|emit(\"cancel\")" "$ROOT/app/components/app/AppConfirmModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero "AppConfirmModal.vue: emits 'cancel'" "$count"

count=$(grep -c 'handleCancel' "$ROOT/app/components/app/AppConfirmModal.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppConfirmModal.vue: handleCancel resets isConfirming on cancel' "$count"

# --- AppToast accessibility --------------------------------------------------
count=$(grep -c 'role="alert"' "$ROOT/app/components/app/AppToast.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppToast.vue: role="alert"' "$count"

count=$(grep -c 'aria-live' "$ROOT/app/components/app/AppToast.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppToast.vue: aria-live attribute present' "$count"

count=$(grep -c "'assertive'" "$ROOT/app/components/app/AppToast.vue" 2>/dev/null); count=${count:-0}
check_nonzero "AppToast.vue: error type uses aria-live='assertive'" "$count"

count=$(grep -c 'aria-label="Fermer la notification"' "$ROOT/app/components/app/AppToast.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppToast.vue: dismiss button has aria-label="Fermer la notification"' "$count"

# --- useToast composable -----------------------------------------------------
count=$(grep -c 'MAX_TOASTS' "$ROOT/app/composables/useToast.ts" 2>/dev/null); count=${count:-0}
check_nonzero 'useToast.ts: MAX_TOASTS constant defined' "$count"

count=$(grep -c "useState.*'toasts'" "$ROOT/app/composables/useToast.ts" 2>/dev/null); count=${count:-0}
check_nonzero "useToast.ts: useState('toasts') for shared state" "$count"

count=$(grep -c 'readonly(toasts)' "$ROOT/app/composables/useToast.ts" 2>/dev/null); count=${count:-0}
check_nonzero 'useToast.ts: toasts exposed as readonly' "$count"

count=$(grep -c 'setTimeout' "$ROOT/app/composables/useToast.ts" 2>/dev/null); count=${count:-0}
check_nonzero 'useToast.ts: setTimeout used for success auto-dismiss' "$count"

# --- AppToastContainer wiring ------------------------------------------------
count=$(grep -c 'AppToastContainer' "$ROOT/app/layouts/private.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'private.vue: AppToastContainer included in layout' "$count"

count=$(grep -c 'Teleport' "$ROOT/app/components/app/AppToastContainer.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppToastContainer.vue: uses Teleport' "$count"

count=$(grep -c 'TransitionGroup' "$ROOT/app/components/app/AppToastContainer.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppToastContainer.vue: uses TransitionGroup' "$count"

count=$(grep -c '@dismiss="remove"' "$ROOT/app/components/app/AppToastContainer.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppToastContainer.vue: wires @dismiss to remove()' "$count"

count=$(grep -c 'toast-enter-active\|toast-leave-active' "$ROOT/app/components/app/AppToastContainer.vue" 2>/dev/null); count=${count:-0}
check_nonzero 'AppToastContainer.vue: toast TransitionGroup CSS classes defined' "$count"
