# Implementation Prompt — RFC-005: Profile & Leave Balance Display

## Context

You are implementing **RFC-005** of the WakaBods POC — the `/profile` page with user info display and leave balance section, plus foundational shared UI components.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 through RFC-004 are complete:
- Full auth, layout, and navigation working
- `useCurrentUser()` composable available
- Stub `app/pages/profile.vue` exists with `definePageMeta({ layout: 'private' })`
- `AppButton` component exists

## Your task

Implement everything defined in `RFCs/RFC-005-Profile-Balance.md`:

1. **Shared app components** (used throughout all future RFCs):
   - `app/components/app/AppSkeleton.vue` — animated gray placeholder bar
   - `app/components/app/AppErrorBanner.vue` — red error banner with retry button (emits `retry`)
   - `app/components/app/AppEmptyState.vue` — centered empty state with title, optional description, default slot for CTA
   - `app/components/app/AppBadge.vue` — pill badge with variants: `gray`, `blue`, `green`, `red`, `amber`

2. **`app/composables/useLeaveBalances.ts`** — fetches `leave_balances` joined with `leave_types` for current year, exposes `balances`, `isLoading`, `error`, `fetchBalances`

3. **`app/components/leave/LeaveBalanceCard.vue`** — single balance row: type color dot + name, Acquis/Utilisés/Restants columns, remaining shown in red when 0

4. **`app/pages/profile.vue`** — replaces stub:
   - Section 1 (all roles): profile card — prénom, nom, email (from `useSupabaseUser()`), role badge, équipe (or "Toute l'entreprise" if null), date d'entrée formatted in French
   - Section 2 (employee/manager only): leave balance list per type for current year
   - Both sections: 4 UI states (loading skeleton / error banner / empty / content)

## Non-negotiable rules

1. **4 UI states mandatory** on both async sections (loading → error → empty → content)
2. **Admin sees no balance section** — `v-if="!isAdmin"`
3. **Email from `useSupabaseUser()`**, not from `profiles` table
4. **`restant = allocated_days - used_days`**, display `Math.max(0, ...)` — never negative
5. **French date formatting** — `toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })`
6. **Readonly refs** — composable returns `readonly(balances)`, `readonly(isLoading)`, etc.

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes with zero errors
- [ ] Login as employee1 → profile shows "Emma Employée", role badge "Employé" (green)
- [ ] Balance section shows: Congé payé — 25 / 5 / 20
- [ ] Login as admin → no balance section visible
- [ ] Admin team shows "Toute l'entreprise"
- [ ] Skeleton shown during data fetch (throttle network to test)
- [ ] Error banner shown when fetch fails, retry works
- [ ] Empty state shown when no balances exist for current year
- [ ] Responsive at 375px and 1280px without horizontal scroll
