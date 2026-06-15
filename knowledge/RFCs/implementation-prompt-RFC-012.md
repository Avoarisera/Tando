# Implementation Prompt — RFC-012: Global UI States & Error Pages

## Context

You are implementing **RFC-012** of the WakaBods POC — the final polish pass: `AppSpinner` component, the Nuxt `app/error.vue` page, and a comprehensive audit ensuring all async sections have the mandatory 4 UI states (loading → error → empty → content).

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 through RFC-011 are complete — all features are functional. This RFC polishes and completes.

## Your task

Implement everything defined in `RFCs/RFC-012-Global-UI-States.md`:

1. **`app/components/app/AppSpinner.vue`** — `animate-spin`, `border-2 border-t-transparent rounded-full`, size props `sm`/`md`, color props `white`/`gray`, `aria-hidden="true"`

2. **`app/error.vue`** — Nuxt error page:
   - Accepts `error: NuxtError` prop
   - Shows status code (404, 403, or other) prominently
   - Shows appropriate French title: "Page introuvable" (404), "Accès refusé" (403), "Une erreur est survenue" (other)
   - "Retour à l'accueil" button calls `clearError({ redirect: '/profile' })` if authenticated, `clearError({ redirect: '/login' })` if not
   - Consistent brand styling (no raw browser error page)

3. **Full UI state audit** — scan every async section in the app and fix any missing states:
   - `/profile`: profile card + balance section
   - `/leave-requests`: employee list, manager queue + team balances + history, admin table
   - `/calendar`: calendar grid
   - `/leave-types`: types table
   
   For every section verify: AppSkeleton during load, AppErrorBanner on error with retry, AppEmptyState when list is empty, content when data exists.

4. **Replace all button loading states** with `AppSpinner`:
   - Login submit button
   - "Envoyer la demande" in LeaveRequestForm
   - "Approuver"/"Refuser" in AppConfirmModal
   - "Enregistrer" in leave type form

5. **Zero tolerance audit** — find and remove:
   - `console.log` in any `app/` file
   - `: any` explicit type annotations
   - `TODO`, `FIXME`, `HACK` comments

## Non-negotiable rules

1. **`app/error.vue` uses `clearError()`** — not `navigateTo()` or `useRouter().push()`
2. **All 4 states must be present** on every async section — no exceptions
3. **Zero `console.log`, zero `any`, zero TODOs** in delivered code
4. **French** for all error page messages

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes with zero errors
- [ ] `grep -r "console.log" app/` returns zero results
- [ ] `grep -r ": any" app/` returns zero results  
- [ ] `grep -r "TODO\|FIXME" app/` returns zero results
- [ ] Navigate to `/nonexistent` → shows `app/error.vue` with "Page introuvable" (404)
- [ ] Employee accessing `/leave-types` → shows "Accès refusé" (403)
- [ ] "Retour à l'accueil" button on error page redirects correctly based on auth state
- [ ] Throttle network → skeletons visible on all pages
- [ ] Block Supabase URL → error banners visible with retry buttons on all pages
- [ ] Every submit button uses `AppSpinner` when loading
- [ ] All empty states have contextual French messages
