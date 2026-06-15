# WakaBods — RFC Backlog

Suivi de progression des 17 RFCs. Mettre à jour dès qu'un RFC est complètement terminé (implémentation + review + tests).

| RFC | Titre | Sprint | Statut | Branch | Notes |
|-----|-------|--------|--------|--------|-------|
| RFC-001 | Project Setup + Database Foundation | 1 | ✅ Done | rfc-001 | Tables, RLS, trigger, RPC, Nuxt config, Tailwind |
| RFC-002 | Seed Data | 1 | ✅ Done | rfc-002 | Seed idempotent appliqué via `supabase db reset` |
| RFC-003 | Authentication & Routing | 1 | ✅ Done | rfc-003 | Login, middleware auth + admin-only, signOut, suite E2E Playwright (F01–F04 + sécurité) — fix SSR `useSupabaseUser().id` undefined via fallback `getUser()` |
| RFC-004 | Layout & Navigation | 1 | ✅ Done | rfc-004 | private.vue layout, AppButton (4 variants), AppSidebar desktop, AppMobileDrawer (focus trap, Escape, backdrop, Teleport) — 28 static checks + 21 E2E Playwright tests (38/38 pass) |
| RFC-005 | Profile & Leave Balance Display | 1 | ✅ Done | RFC-05 | Profile card (F06) + soldes congés (F07) — AppSkeleton, AppErrorBanner, AppEmptyState, AppBadge, LeaveBalanceCard, useLeaveBalances — 16 E2E Playwright pass |
| RFC-006 | Shared UI Components | 2 | ✅ Done | rfc-006 | AppConfirmModal, useToast, AppToastContainer — composants génériques toast + modale de confirmation |
| RFC-007 | Leave Request Creation | 2 | ✅ Done | rfc-007 | RPC `create_leave_request`, LeaveRequestForm modal, LeaveStatusBadge, useLeaveRequests, useLeaveTypes, useDate — page `/leave-requests` avec 4 états UI, redirection `/` vers `/profile` ou `/login` |
| RFC-008 | Leave Request Views | 2 | ✅ Done | rfc-008 | Employee history view (F11) + manager validation queue with AppConfirmModal approve/reject (F12) + team Congé payé balances table (F13) — LeaveRequestTable reusable component, useLeaveBalances extended with fetchTeamBalances |
| RFC-009 | Admin Leave Management | 2 | ✅ Done | rfc-009 | Admin table (F14) with status filter + approve/reject actions (F15) + level-1 bypass (F16) — LeaveAdminView component, Équipe column, per-row conditional actions, bypass wording for pending; 33 E2E tests + unit tests pass |
| RFC-010 | Calendar | 3 | ✅ Done | rfc-010 | useCalendar composable, CalendarGrid (7-col CSS grid, mobile list view), CalendarEvent badge, "Absents aujourd'hui" (manager), team filter (admin), legend, 4 UI states — continuous multi-day event blocks (CalendarEvent isEnd prop + negative margins) — 216 unit tests (useCalendar, CalendarGrid, useTeams) + 10 E2E Playwright tests — migration 20260427000001 (RLS employee team-approved) + 20260427000002 (profiles_select_employee_same_team, fixes INNER JOIN exclusion) — useLeaveRequests scoped to own requests for employees via auth.getUser() fallback |
| RFC-011 | Leave Types Management + Balance Admin | 3 | ✅ Done | rfc-011 | F21 liste types, F22 création/modification, F23 toggle actif/inactif. F31 onglet Soldes : migration RPC upsert_leave_type_balances, inline edit par employé, bulk-set quota par type, auto-init soldes à 0 à la création d'un type |
| RFC-012 | Global UI States & Error Pages | 3 | ✅ Done | rfc-012 | AppSpinner (size/color props), app/error.vue (404/403/generic), inline spinners replaced across login + LeaveRequestForm + AppConfirmModal + leave-types (toggle + save + bulk). Audit: zero console.log/any/TODO, all 4 UI states confirmed on every async section |
| RFC-013 | Vercel Deployment | 3 | ⬜ À faire | — | |
| RFC-014 | Sprint 4 DB Schema Extensions | 4 | ✅ Done | main | Migration 20260518000001: profiles (birth_date, trial_ends_at), tables invoices + notification_logs, RLS policies, RPC get_dashboard_snapshot, bucket Storage invoices. Types TS: Profile enrichi, Invoice, DashboardSnapshot, DashboardEmployee |
| RFC-015 | Admin Leave Dashboard | 4 | ⬜ À faire | — | Page /dashboard, composable useDashboard, métriques + liste employés + filtre |
| RFC-016 | Factures Vault PDF | 4 | ✅ Done | feat/rfc-016-invoices-vault | Page /invoices admin-only, useInvoices (fetch/create/updateStatus/uploadPdf/getSignedUrl), InvoiceForm modal avec validation inline, InvoiceTable avec select statut par ligne + upload PDF + URL signée 60s, filtre client-side, 4 états UI, database.ts enrichi avec table invoices |
| RFC-017 | Notification Engine | 4 | ⬜ À faire | — | Edge Function daily-notifications + pg_cron + Resend (birthday, work_anniversary, trial_end) |

## Légende

| Icône | Signification |
|-------|---------------|
| ✅ Done | Implémenté, reviewé, testé — prêt pour merge |
| 🔄 En cours | Implémentation en cours sur une branch |
| ⬜ À faire | Pas encore démarré |
| 🚫 Bloqué | Bloqué sur dépendance ou décision en attente |
