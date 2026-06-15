# Implementation Prompt — RFC-007: Leave Request Creation

## Context

You are implementing **RFC-007** of the WakaBods POC — the leave request creation flow: `useLeaveRequests` composable, `useLeaveTypes` composable, the `LeaveRequestForm` modal, `LeaveStatusBadge`, and the initial employee view on `/leave-requests`.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 through RFC-006 are complete:
- The `create_leave_request` RPC exists in the database (migration `20260421_004_rpc_functions.sql`)
- `AppModal`, `AppConfirmModal`, `useToast`, `AppToastContainer` exist
- All other shared UI components exist
- Stub `app/pages/leave-requests.vue` exists

## Your task

Implement everything defined in `RFCs/RFC-007-Leave-Request-Creation.md`:

1. **`app/composables/useLeaveTypes.ts`** — fetches leave types (active only by default), exposes `leaveTypes`, `isLoading`, `error`, `fetchLeaveTypes(activeOnly?)`

2. **`app/composables/useLeaveRequests.ts`** — fetches leave requests with joins (`leave_types`, `profiles!user_id` + `teams`), `createRequest(params)` calls `supabase.rpc('create_leave_request', {...})`, `updateRequestStatus(id, update)` calls `.update()`

3. **`app/components/leave/LeaveStatusBadge.vue`** — renders status as colored pill: pending=gray, manager_approved=amber, approved=green, rejected=red; has `title` attribute for accessibility

4. **`app/components/leave/LeaveRequestForm.vue`** — modal form (uses `AppModal`): leave type select (active only), start/end date pickers (native `<input type="date">`), dynamic days count display, optional comment textarea (max 500), front validation (start ≥ today, end ≥ start), spinner + disabled during submit, inline `formError` for RPC errors (modal stays open), success emits `created` event

5. **`app/pages/leave-requests.vue`** — partial implementation: employee view with "Nouvelle demande" button (employee only), 4-state section for request list, `LeaveRequestForm` modal

## Non-negotiable rules

1. **RPC parameter names exactly**: `p_leave_type_id`, `p_start_date`, `p_end_date`, `p_comment`
2. **Server errors displayed inline in modal** — NOT as toasts; modal stays open for correction
3. **`start_date` minimum = today** — use `:min="today"` on the date input
4. **`days_count` calculated client-side**: `Math.max(0, floor((end - start) / 86400000) + 1)`
5. **4 UI states** on the request list section (loading/error/empty/content)
6. **"Nouvelle demande" button** visible only for `isEmployee`

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes with zero errors
- [ ] Login as employee1 → "Nouvelle demande" button visible
- [ ] Modal opens; leave type select shows only active types
- [ ] Picking dates shows correct day count
- [ ] Submit with valid data → `create_leave_request` RPC called → success toast → modal closes → new request in list
- [ ] Submit with overlap → French RPC error shown inline in modal (modal stays open)
- [ ] Submit with insufficient balance → French RPC error shown inline
- [ ] Submit with past start date → front validation blocks before RPC call
- [ ] Request list shows skeleton during load, error banner on failure, empty state with CTA when empty
- [ ] Login as manager → "Nouvelle demande" button NOT visible
