# Implementation Prompt — RFC-015: Admin Leave Dashboard

## Context

You are implementing **RFC-015** — the `/dashboard` admin page with capacity metrics and employee status list.

WakaBods is a lightweight HR platform built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. Product language: **French**.

## What has already been implemented

RFC-001 through RFC-014 are complete. The DB has the `get_dashboard_snapshot()` RPC. The app has all leave management, calendar, and admin pages from Sprint 1–3.

## Your task

Implement all changes in `RFCs/RFC-015-Admin-Dashboard.md`:

1. `app/types/index.ts` — add `EmployeeStatus` and `DashboardSnapshot` interfaces
2. `app/composables/useDashboard.ts` — new composable wrapping `get_dashboard_snapshot` RPC
3. `app/components/dashboard/DashboardMetrics.vue` — 4-metric banner component
4. `app/components/dashboard/EmployeeStatusTable.vue` — employee list with status, filter
5. `app/pages/dashboard.vue` — admin-only page orchestrating both components
6. Update navigation (AppSidebar / AppMobileDrawer) to add "Tableau de bord" link for admin

## Two-Phase Approach

### Phase 1 — Planning (No Code)
Read the RFC and existing navigation code. Present the implementation plan including how you'll add the nav link without duplicating logic.

### Phase 2 — Implementation

## Non-negotiable rules

1. TypeScript strict — zero `any`
2. `definePageMeta({ middleware: 'admin-only', layout: 'private' })`
3. 4 UI states on every async section
4. All strings in French
5. Responsive at 375px (metrics wrap to 2×2 grid on mobile) and 1280px

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes
- [ ] `/dashboard` redirects employee/manager to 403
- [ ] Nav link "Tableau de bord" visible only for admin
- [ ] Metrics correct against seeded data
- [ ] "En congé aujourd'hui" highlighted with colored background
- [ ] Employee list shows leave type + return date for employees on leave
- [ ] Seniority calculated correctly from `joined_at`
- [ ] Filter "Présents / En congé" works client-side
- [ ] Responsive 375px and 1280px verified
