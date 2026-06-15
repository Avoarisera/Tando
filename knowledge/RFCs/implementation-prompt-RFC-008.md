# Implementation Prompt — RFC-008: Leave Request Views (Employee + Manager)

## Context

You are implementing **RFC-008** of the WakaBods POC — completing the employee history view and the full manager view on `/leave-requests`: validation queue, team balances, and team history.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 through RFC-007 are complete:
- `useLeaveRequests` with `fetchRequests` and `updateRequestStatus` exists
- `LeaveStatusBadge`, `LeaveRequestForm`, `AppConfirmModal`, `useToast` exist
- `app/pages/leave-requests.vue` has the employee view (request creation + list)

## Your task

Implement everything defined in `RFCs/RFC-008-Leave-Request-Views.md`:

1. **`app/components/leave/LeaveRequestTable.vue`** — reusable table with props: `requests`, `showEmployee?`, `showTeam?`, `showActions?`; emits `approve` and `reject` with request ID; mobile-responsive (cards on mobile, table on desktop)

2. **Employee view** (complete from RFC-007 but finalize): columns Type/Période/Durée/Statut/Créée le; empty state with CTA; skeleton; error banner

3. **Manager view** in `leave-requests.vue` — three sections in order:
   - "À valider": `pending` requests filtered client-side, with Approuver/Refuser buttons each opening `AppConfirmModal` before executing `updateRequestStatus`
   - "Soldes de l'équipe": table using extended `useLeaveBalances` query (joined with profiles), filtered to Congé payé type
   - "Historique équipe": all team requests (read-only), sorted `created_at DESC`

4. **Date formatting utility** — `formatDate(isoDate: string): string` using `toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })`

## Non-negotiable rules

1. **Approve/reject always requires `AppConfirmModal`** — no direct action without confirmation
2. **`manager_reviewed_by` = `profile.value!.id`** and **`manager_reviewed_at` = `new Date().toISOString()`** set on update
3. **RLS scopes data to manager's team** — no client-side team filtering needed for the request list
4. **4 UI states** on every async section
5. **Refresh after action** — call `fetchRequests()` after approve/reject so the UI reflects the new state

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes with zero errors
- [ ] Login as manager → three sections visible: "À valider", "Soldes de l'équipe", "Historique équipe"
- [ ] "À valider" shows Emma's pending request
- [ ] Click "Approuver" → confirm modal opens with employee name and dates → confirm → request disappears from "À valider", appears in "Historique équipe" as "Validé manager"
- [ ] Toast "Demande approuvée" shown after action
- [ ] Team balances: Marc 25/0/25, Emma 25/5/20, Eddy 25/0/25
- [ ] Login as employee2 → sees own requests only (RLS enforced, cannot see Emma's)
- [ ] Employee view: empty state shown when no requests, CTA opens form modal
- [ ] Responsive at 375px: table shown as cards (no horizontal scroll)
