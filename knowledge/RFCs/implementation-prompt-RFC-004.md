# Implementation Prompt — RFC-004: Layout & Navigation

## Context

You are implementing **RFC-004** of the WakaBods POC — the private layout with responsive sidebar navigation used by all authenticated pages.

WakaBods is a lightweight HR platform for remote teams built with **Nuxt 4.4.2 + Vue 3.5 + TypeScript + Tailwind CSS + Supabase**. The product language is **French**.

## What has already been implemented

RFC-001 through RFC-003 are complete:
- DB, seed, and auth are fully working
- `useCurrentUser` composable exists with `isAdmin`/`isManager`/`isEmployee`/`signOut`
- Stub pages exist for all private routes with correct `definePageMeta`

## Your task

Implement everything defined in `RFCs/RFC-004-Layout-Navigation.md`:

1. **`app/layouts/private.vue`** — wrapper: `flex min-h-screen`, includes `AppSidebar` (hidden on mobile), `AppMobileDrawer`, `<slot>`, and `<AppToastContainer>` (added in RFC-006 but placeholder now)
2. **`app/components/nav/AppSidebar.vue`** — desktop sidebar: `w-60`, fixed, brand at top, role-aware nav links computed from `useCurrentUser()`, active link highlighted via `useRoute().path`, Déconnexion button at bottom
3. **`app/components/nav/AppMobileDrawer.vue`** — hamburger button visible on mobile only, drawer overlay, closes on navigation (`watch(route.path)`) and Escape key, `role="dialog"` + `aria-modal="true"`
4. **`app/components/app/AppButton.vue`** — generic button with variants: `primary`, `secondary`, `danger`, `ghost`; `disabled` prop; `type` prop

Nav links by role:
- Employee/Manager: Profil (`/profile`), Demandes de congé (`/leave-requests`), Calendrier (`/calendar`), Déconnexion
- Admin: same + Types de congé (`/leave-types`)

## Non-negotiable rules

1. **Role resolved from `useCurrentUser()`** — never hard-coded or read from JWT
2. **Mobile-first Tailwind** — sidebar `hidden lg:flex`, hamburger `flex lg:hidden`
3. **Drawer closes on navigation** — `watch(() => route.path, () => { isOpen.value = false })`
4. **Accessibility** — hamburger `aria-label="Ouvrir le menu"`, drawer `role="dialog"` + `aria-modal="true"`, active links distinguishable by more than color alone
5. **No Pinia** — `useCurrentUser()` composable only

## Checklist before declaring done

- [ ] `yarn nuxt typecheck` passes with zero errors
- [ ] Private layout renders correctly on all 4 stub pages
- [ ] Desktop (1280px): sidebar visible at 240px, content alongside it
- [ ] Mobile (375px): sidebar hidden, hamburger button visible at top
- [ ] Hamburger opens drawer; clicking a link OR tapping the backdrop closes it
- [ ] Pressing Escape closes the drawer
- [ ] Employee nav: 4 items (no "Types de congé")
- [ ] Admin nav: 5 items (includes "Types de congé")
- [ ] Active route link is visually highlighted
- [ ] Déconnexion button visible and calls `signOut()`
- [ ] Responsive tested at both 375px and 1280px without horizontal scroll
