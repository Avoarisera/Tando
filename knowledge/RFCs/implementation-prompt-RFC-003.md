# Implementation Prompt — RFC-003: Authentication & Routing

## Context

You are implementing **RFC-003** of the WakaBods POC — the complete authentication boundary: login page, global auth middleware, admin-only middleware, logout, and the `useCurrentUser` composable.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 and RFC-002 are complete:
- All 5 DB tables, RLS, trigger, and RPC exist
- 4 demo accounts exist and can authenticate via Supabase

## Your task

Implement everything defined in `RFCs/RFC-003-Authentication-Routing.md`:

1. **`app/pages/login.vue`** — public login page (`definePageMeta({ layout: false })`), email + password form, Supabase `signInWithPassword`, redirect to `/profile` on success, generic French error on failure, spinner + disabled button during request
2. **`app/middleware/auth.global.ts`** — global middleware: redirect unauthenticated users to `/login`, redirect authenticated users away from `/login` to `/profile`
3. **`app/middleware/admin-only.ts`** — non-global middleware: reads role from `useCurrentUser().profile`, throws 403 if not admin
4. **`app/composables/useCurrentUser.ts`** — critical composable: `useSupabaseUser()`, `useState('current-profile')`, `loadProfile()`, `signOut()` (clears ALL `useState` caches), `isAdmin`/`isManager`/`isEmployee` computed properties

Also create stub pages for all private routes (they will be replaced in later RFCs):
- `app/pages/profile.vue` — `definePageMeta({ layout: 'private' })`
- `app/pages/leave-requests.vue` — `definePageMeta({ layout: 'private' })`
- `app/pages/calendar.vue` — `definePageMeta({ layout: 'private' })`
- `app/pages/leave-types.vue` — `definePageMeta({ middleware: 'admin-only', layout: 'private' })`

## Non-negotiable rules

1. **Role is never read from JWT** — always from `profiles` table via `useCurrentUser()`
2. **No Pinia** — `useState('current-profile')` for the profile state
3. **All `useState` caches cleared on `signOut`** — to prevent data leaking between sessions
4. **French error messages** — generic login error without distinguishing email vs password (security)
5. **`admin-only` middleware is server-side** — not just a UI hide; `createError({ statusCode: 403 })` is the enforcement

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes with zero errors
- [ ] Visiting `/profile` unauthenticated → redirect to `/login`
- [ ] Visiting `/leave-types` unauthenticated → redirect to `/login`
- [ ] Submitting wrong credentials → French error message, no crash
- [ ] Login with `admin@waka.com` / `Waka2026!` → redirect to `/profile`
- [ ] Login with `employee1@waka.com` → redirect to `/profile`
- [ ] While logged in, visiting `/login` → redirect to `/profile`
- [ ] Employee visiting `/leave-types` → 403 error
- [ ] Logout clears all `useState` caches and redirects to `/login`
- [ ] After logout, visiting a private route → redirect to `/login`
