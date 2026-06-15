# WakaBods POC — RFC Master Index

**Version:** 1.2  
**Date:** 2026-05-18  
**Total RFCs:** 17  
**Implementation order:** strictly sequential — never skip or parallelize

---

## Implementation Roadmap

```
RFC-001  Project Setup + DB Schema + RLS + Trigger
  └─ RFC-002  Seed Data
       └─ RFC-003  Authentication & Routing
            └─ RFC-004  Layout & Navigation
                 └─ RFC-005  Profile & Leave Balance Display
                      └─ RFC-006  Shared UI Components (Toast + Confirm Modal)
                           └─ RFC-007  Leave Request Creation (RPC + Form)
                                └─ RFC-008  Leave Request Views (Employee + Manager)
                                     └─ RFC-009  Admin Leave Management
                                          └─ RFC-010  Calendar (All Roles)
                                               └─ RFC-011  Leave Types Management (Admin)
                                                    └─ RFC-012  Global UI States & Error Pages
                                                         └─ RFC-013  Vercel Deployment
                                                              └─ RFC-014  Sprint 4 DB Schema Extensions
                                                                   └─ RFC-015  Admin Leave Dashboard
                                                                        └─ RFC-016  Factures Vault PDF
                                                                             └─ RFC-017  Notification Engine
```

---

## RFC List

| # | RFC | Features | Sprint | Complexity | Predecessor | Successor |
|---|-----|----------|--------|------------|-------------|-----------|
| RFC-001 | [Project Setup + Database Foundation](RFC-001-Project-Setup-Database.md) | F24, F05, F17 | 1 | High | — | RFC-002 |
| RFC-002 | [Seed Data](RFC-002-Seed-Data.md) | F25 | 1 | Medium | RFC-001 | RFC-003 |
| RFC-003 | [Authentication & Routing](RFC-003-Authentication-Routing.md) | F01, F02, F03, F04 | 1 | Low | RFC-002 | RFC-004 |
| RFC-004 | [Layout & Navigation](RFC-004-Layout-Navigation.md) | F08 | 1 | Medium | RFC-003 | RFC-005 |
| RFC-005 | [Profile & Leave Balance Display](RFC-005-Profile-Balance.md) | F06, F07 | 1 | Low–Medium | RFC-004 | RFC-006 |
| RFC-006 | [Shared UI Components](RFC-006-Shared-UI-Components.md) | F29, F30 | 2 | Low | RFC-005 | RFC-007 |
| RFC-007 | [Leave Request Creation](RFC-007-Leave-Request-Creation.md) | F10, F09 | 2 | High | RFC-006 | RFC-008 |
| RFC-008 | [Leave Request Views](RFC-008-Leave-Request-Views.md) | F11, F12, F13 | 2 | Medium | RFC-007 | RFC-009 |
| RFC-009 | [Admin Leave Management](RFC-009-Admin-Leave-Management.md) | F14, F15, F16 | 2 | Medium | RFC-008 | RFC-010 |
| RFC-010 | [Calendar](RFC-010-Calendar.md) | F18, F19, F20 | 3 | Medium | RFC-009 | RFC-011 |
| RFC-011 | [Leave Types Management](RFC-011-Leave-Types-Management.md) | F21, F22, F23 | 3 | Low | RFC-010 | RFC-012 |
| RFC-012 | [Global UI States & Error Pages](RFC-012-Global-UI-States.md) | F27, F28 | 3 | Medium | RFC-011 | RFC-013 |
| RFC-013 | [Vercel Deployment](RFC-013-Deployment.md) | F26 | 3 | Low | RFC-012 | RFC-014 |
| RFC-014 | [Sprint 4 DB Schema Extensions](RFC-014-Sprint4-DB-Schema.md) | F32–F35 (DB), F36–F41 (DB) | 4 | Medium | RFC-013 | RFC-015 |
| RFC-015 | [Admin Leave Dashboard](RFC-015-Admin-Dashboard.md) | F36, F37, F38 | 4 | Medium | RFC-014 | RFC-016 |
| RFC-016 | [Factures Vault PDF](RFC-016-Factures-Vault.md) | F39, F40, F41 | 4 | Medium | RFC-015 | RFC-017 |
| RFC-017 | [Notification Engine](RFC-017-Notification-Engine.md) | F33, F34, F35 | 4 | High | RFC-016 | — |

---

## Dependency Table

| RFC | Depends on | Provides to |
|-----|-----------|-------------|
| RFC-001 | — | DB schema, RLS policies, balance trigger, Nuxt config |
| RFC-002 | RFC-001 | Demo accounts, teams, leave types, balances, seed requests |
| RFC-003 | RFC-002 | Auth session, route protection, admin guard, logout |
| RFC-004 | RFC-003 | Private layout, sidebar, mobile drawer, navigation |
| RFC-005 | RFC-004 | /profile page, useCurrentUser, balance display |
| RFC-006 | RFC-005 | AppConfirmModal, useToast, AppToastContainer |
| RFC-007 | RFC-006 | create_leave_request RPC, LeaveRequestForm modal |
| RFC-008 | RFC-007 | Employee history, manager queue, team balances |
| RFC-009 | RFC-008 | Admin request table, approve/reject actions |
| RFC-010 | RFC-009 | Calendar grid, all role views |
| RFC-011 | RFC-010 | Leave type CRUD for admin |
| RFC-012 | RFC-011 | AppSkeleton, AppErrorBanner, AppEmptyState audit, error.vue |
| RFC-013 | RFC-012 | Production URL, smoke test pass |
| RFC-014 | RFC-013 | New DB columns, invoices table, notification_logs, RLS, dashboard RPC, Storage bucket |
| RFC-015 | RFC-014 | /dashboard page, useDashboard composable, DashboardMetrics + EmployeeStatusTable components |
| RFC-016 | RFC-015 | /invoices page, useInvoices composable, invoice CRUD + PDF upload |
| RFC-017 | RFC-016 | Edge Function daily-notifications, pg_cron job, Resend integration |

---

## Sprint Mapping

| Sprint | RFCs | Focus |
|--------|------|-------|
| Sprint 1 (days 1–5) | RFC-001 → RFC-005 | Infrastructure, DB, Auth, Layout, Profile |
| Sprint 2 (days 6–10) | RFC-006 → RFC-009 | Leave management, validation flows |
| Sprint 3 (days 11–15) | RFC-010 → RFC-013 | Calendar, admin types, polish, deploy |
| Sprint 4 | RFC-014 → RFC-017 | Notifications, Dashboard, Factures Vault |

---

## Grouping Rationale

- **RFC-001** groups F24+F05+F17 because the database schema and trigger are inseparable prerequisites — no app code runs until they exist.
- **RFC-002** is isolated because seed creation requires the service key and must be verified before auth flows are tested.
- **RFC-003** groups all four auth features (login, auth guard, admin guard, logout) because they form a single security boundary.
- **RFC-004** isolates the layout/navigation because all subsequent pages depend on it, and it requires `useCurrentUser` to resolve roles.
- **RFC-005** groups profile + balance because both live on `/profile` and share the same data fetch context.
- **RFC-006** isolates shared UI components (toast + confirm modal) because RFC-007 through RFC-009 depend on them — they must exist before any mutation action is built.
- **RFC-007** groups the RPC (SQL) and the form together because the form is meaningless without the RPC validation.
- **RFC-008** groups the three `/leave-requests` sub-views that don't depend on admin actions.
- **RFC-009** groups admin leave features because they build on the same table and composable from RFC-008.
- **RFC-010** groups all three calendar role-views because they share the same grid component with progressive data scoping.
- **RFC-011** groups leave type CRUD because all three features (list, edit, toggle) share the same page and composable.
- **RFC-012** audits and completes UI state coverage and adds the 404 page as final polish.
- **RFC-013** is always last — it verifies the full system on production infrastructure.
