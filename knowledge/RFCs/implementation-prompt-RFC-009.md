# Implementation Prompt — RFC-009: Admin Leave Management

## Context

You are implementing **RFC-009** of the WakaBods POC — the admin view of `/leave-requests` with full-company request table, status filtering, and approval/rejection actions including the level-1 bypass.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 through RFC-008 are complete:
- `useLeaveRequests` with `updateRequestStatus` exists
- Employee and manager views on `/leave-requests` are implemented
- `AppConfirmModal`, `useToast`, `LeaveRequestTable`, `LeaveStatusBadge` exist

## Your task

Implement everything defined in `RFCs/RFC-009-Admin-Leave-Management.md` — the admin view section in `app/pages/leave-requests.vue`:

1. **Status filter** (client-side): `ref<LeaveStatus | 'all'>('all')` with a `<select>` showing Tous / En attente / Validé manager / Approuvé / Refusé — filters `requests.value` without re-fetching

2. **Action buttons** — contextual visibility:
   - `pending` → both "Approuver" and "Refuser" visible
   - `manager_approved` → both visible
   - `approved` or `rejected` → no action buttons

3. **Approve action** (`pending` or `manager_approved` → `approved`):
   - Sets `status: 'approved'`, `admin_reviewed_by: profile.value!.id`, `admin_reviewed_at: new Date().toISOString()`
   - `manager_reviewed_by` remains NULL if source was `pending` (bypass — no explicit handling needed)
   - Trigger fires automatically on DB side

4. **Reject action** (`pending` or `manager_approved` → `rejected`):
   - Sets `status: 'rejected'`, `admin_reviewed_by`, `admin_reviewed_at`

5. **Level-1 bypass confirm modal** — when approving a `pending` request, the confirm modal title should say "Approuver directement (sans validation manager) ?" to communicate the bypass

6. **Columns**: Employé, Équipe, Type (badge with color dot), Période, Durée, Statut (LeaveStatusBadge), Date de création, Actions

## Non-negotiable rules

1. **Every action opens `AppConfirmModal` first** — no direct execution without confirmation
2. **After action: `fetchRequests()` and close modal** — UI must reflect the new state
3. **Toast on success, toast on error** — never silent failure
4. **`admin_reviewed_by` + `admin_reviewed_at` always set** on admin actions
5. **Filter is client-side only** — no additional Supabase query on filter change
6. **4 UI states** on the request table (loading/error/empty after filter/content)

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes with zero errors
- [ ] Login as admin → all 4 seeded requests visible
- [ ] Status filter "Validé manager" → only Eddy's RTT request shown
- [ ] Status filter "Approuvé" → only Emma's approved request shown
- [ ] Approving `manager_approved` request → `approved`, reviewer fields set, toast shown
- [ ] Approving `pending` request directly → `approved`, `manager_reviewed_by = NULL`, admin fields set, bypass wording in confirm modal
- [ ] Rejecting any pending/manager_approved → `rejected`, admin reviewer fields set
- [ ] `approved` / `rejected` rows have no action buttons
- [ ] No action buttons on read-only rows
- [ ] After approval, check Supabase Studio: `leave_balances.used_days` incremented correctly
